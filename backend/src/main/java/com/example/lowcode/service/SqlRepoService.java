package com.example.lowcode.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSetMetaData;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Thin SQL repository view over lc_query_model (+ optional metadata columns).
 * SELECT assets only for try-run; DSL pages reference queryCode without owning SQL text.
 */
@Service
public class SqlRepoService {
    private static final Pattern NAMED_PARAM = Pattern.compile("(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)");
    private static final Pattern SAFE_CODE = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");
    private static final int TRY_MAX_ROWS = 100;
    private static final int TRY_TIMEOUT_SECONDS = 10;

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private ConfigValidationService configValidationService;

    public List<Map<String, Object>> listAssets() {
        List<Map<String, Object>> assets = jdbcTemplate.query(
                """
                SELECT query_code AS "queryCode",
                       anchor_entity AS "anchorEntity",
                       COALESCE(query_mode, 'rawSql') AS "queryMode",
                       sql_text AS "sqlText",
                       LEFT(sql_text, 160) AS "sqlPreview",
                       LENGTH(sql_text) AS "sqlLength",
                       COALESCE(params_json::text, '[]') AS "paramsJson",
                       (SELECT COUNT(*) FROM lc_page_model p WHERE p.query_code = q.query_code) AS "pageRefCount"
                FROM lc_query_model q
                ORDER BY query_code
                """,
                new HashMap<>(),
                (rs, rowNum) -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    String sqlText = rs.getString("sqlText");
                    String queryMode = rs.getString("queryMode");
                    String code = rs.getString("queryCode");
                    map.put("queryCode", code);
                    map.put("anchorEntity", rs.getString("anchorEntity"));
                    map.put("queryMode", queryMode);
                    map.put("sqlPreview", rs.getString("sqlPreview"));
                    map.put("sqlLength", rs.getInt("sqlLength"));
                    map.put("paramsJson", rs.getString("paramsJson"));
                    map.put("pageRefCount", rs.getInt("pageRefCount"));
                    map.put("actionRefCount", countActionRefs(code));
                    map.put("kind", inferAssetKind(queryMode, sqlText));
                    map.put("tryRunAllowed", isSelectLike(sqlText));
                    return map;
                }
        );
        return assets;
    }

    private int countActionRefs(String queryCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("p1", "%\"sqlAssetCode\":\"" + queryCode + "\"%");
        params.put("p2", "%\"sql_asset_code\":\"" + queryCode + "\"%");
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM lc_action WHERE config_json::text LIKE :p1 OR config_json::text LIKE :p2",
                params,
                Integer.class
        );
        return count == null ? 0 : count;
    }

    public Map<String, Object> getAsset(String queryCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("queryCode", queryCode);
        Map<String, Object> asset = jdbcTemplate.queryForObject(
                """
                SELECT query_code AS "queryCode",
                       anchor_entity AS "anchorEntity",
                       sql_text AS "sqlText",
                       COALESCE(query_mode, 'rawSql') AS "queryMode",
                       COALESCE(params_json::text, '[]') AS "paramsJson",
                       timeout_ms AS "timeoutMs"
                FROM lc_query_model
                WHERE query_code = :queryCode
                """,
                params,
                (rs, rowNum) -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    String sqlText = rs.getString("sqlText");
                    String queryMode = rs.getString("queryMode");
                    map.put("queryCode", rs.getString("queryCode"));
                    map.put("anchorEntity", rs.getString("anchorEntity"));
                    map.put("sqlText", sqlText);
                    map.put("queryMode", queryMode);
                    map.put("paramsJson", rs.getString("paramsJson"));
                    map.put("timeoutMs", rs.getObject("timeoutMs"));
                    map.put("kind", inferAssetKind(queryMode, sqlText));
                    map.put("tryRunAllowed", isSelectLike(sqlText));
                    map.put("paramNames", extractParamNames(sqlText));
                    return map;
                }
        );

        List<Map<String, Object>> refs = jdbcTemplate.query(
                """
                SELECT page_code AS "pageCode", title, route_path AS "routePath"
                FROM lc_page_model
                WHERE query_code = :queryCode
                ORDER BY page_code
                """,
                params,
                (rs, rowNum) -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("pageCode", rs.getString("pageCode"));
                    map.put("title", rs.getString("title"));
                    map.put("routePath", rs.getString("routePath"));
                    return map;
                }
        );
        asset.put("pageRefs", refs);

        Map<String, Object> actionParams = new HashMap<>();
        actionParams.put("p1", "%\"sqlAssetCode\":\"" + queryCode + "\"%");
        actionParams.put("p2", "%\"sql_asset_code\":\"" + queryCode + "\"%");
        List<Map<String, Object>> actionRefs = jdbcTemplate.query(
                """
                SELECT action_code AS "actionCode", label, action_type AS "actionType"
                FROM lc_action
                WHERE config_json::text LIKE :p1 OR config_json::text LIKE :p2
                ORDER BY action_code
                """,
                actionParams,
                (rs, rowNum) -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("actionCode", rs.getString("actionCode"));
                    map.put("label", rs.getString("label"));
                    map.put("actionType", rs.getString("actionType"));
                    return map;
                }
        );
        asset.put("actionRefs", actionRefs);
        return asset;
    }

    public void saveAsset(String queryCode, Map<String, Object> body) {
        String sqlText = body.get("sqlText") == null ? null : String.valueOf(body.get("sqlText"));
        String queryMode = body.get("queryMode") == null || String.valueOf(body.get("queryMode")).isBlank()
                ? null
                : String.valueOf(body.get("queryMode"));
        // dml = statement body for sqlTransaction (shared SQL repo; not used as page list query)
        if (queryMode == null && sqlText != null) {
            queryMode = isSelectLike(sqlText) ? "rawSql" : "dml";
        }
        if (queryMode != null && "dml".equals(queryMode) && sqlText != null && isSelectLike(sqlText)) {
            queryMode = "rawSql";
        } else if (queryMode != null && sqlText != null && !isSelectLike(sqlText) && !"dml".equals(queryMode)) {
            queryMode = "dml";
        }
        configValidationService.validateSqlAsset(queryCode, sqlText, queryMode);
        String anchorEntity = body.get("anchorEntity") == null || String.valueOf(body.get("anchorEntity")).isBlank()
                ? null
                : String.valueOf(body.get("anchorEntity"));
        String paramsJson = body.get("paramsJson") == null ? "[]" : String.valueOf(body.get("paramsJson"));
        // validate params json
        try {
            objectMapper.readValue(paramsJson, new TypeReference<List<Object>>() {});
        } catch (Exception ex) {
            throw new IllegalArgumentException("paramsJson must be a JSON array");
        }

        Map<String, Object> params = new HashMap<>();
        params.put("queryCode", queryCode);
        params.put("sqlText", sqlText);
        params.put("queryMode", queryMode);
        params.put("anchorEntity", anchorEntity);
        params.put("paramsJson", paramsJson);

        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM lc_query_model WHERE query_code = :queryCode",
                params,
                Integer.class
        );
        if (exists != null && exists > 0) {
            jdbcTemplate.update(
                    """
                    UPDATE lc_query_model
                    SET sql_text = :sqlText,
                        query_mode = :queryMode,
                        anchor_entity = :anchorEntity,
                        params_json = :paramsJson::jsonb
                    WHERE query_code = :queryCode
                    """,
                    params
            );
        } else {
            jdbcTemplate.update(
                    """
                    INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode, params_json)
                    VALUES (:queryCode, :anchorEntity, :sqlText, :queryMode, :paramsJson::jsonb)
                    """,
                    params
            );
        }
    }

    /**
     * Safe playground run: SELECT-only, max rows, named params from request.
     */
    public Map<String, Object> tryRun(String queryCode, Map<String, Object> requestBody) {
        Map<String, Object> asset = getAsset(queryCode);
        String sqlText = String.valueOf(asset.get("sqlText"));
        String overrideSql = requestBody != null && requestBody.get("sqlText") != null
                ? String.valueOf(requestBody.get("sqlText"))
                : null;
        // Allow try with unsaved editor buffer (still SELECT-only, never persisted here)
        if (overrideSql != null && !overrideSql.isBlank()) {
            sqlText = overrideSql;
        }
        validateSelectOnly(sqlText);

        @SuppressWarnings("unchecked")
        Map<String, Object> inputParams = requestBody != null && requestBody.get("params") instanceof Map
                ? new HashMap<>((Map<String, Object>) requestBody.get("params"))
                : new HashMap<>();

        // Fill missing named params with null so PG can still plan simple queries
        for (String name : extractParamNames(sqlText)) {
            inputParams.putIfAbsent(name, null);
        }

        int maxRows = TRY_MAX_ROWS;
        if (requestBody != null && requestBody.get("maxRows") instanceof Number n) {
            maxRows = Math.max(1, Math.min(TRY_MAX_ROWS, n.intValue()));
        }

        String wrapped = "SELECT * FROM (" + sqlText + ") AS sql_repo_try LIMIT " + maxRows;
        long start = System.currentTimeMillis();
        try {
            Map<String, Object> result = jdbcTemplate.query(wrapped, inputParams, rs -> {
                ResultSetMetaData meta = rs.getMetaData();
                int count = meta.getColumnCount();
                List<Map<String, Object>> columns = new ArrayList<>();
                for (int i = 1; i <= count; i++) {
                    Map<String, Object> col = new LinkedHashMap<>();
                    col.put("field", meta.getColumnLabel(i));
                    col.put("label", meta.getColumnLabel(i));
                    col.put("type", "string");
                    columns.add(col);
                }
                List<Map<String, Object>> rows = new ArrayList<>();
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (int i = 1; i <= count; i++) {
                        row.put(meta.getColumnLabel(i), rs.getObject(i));
                    }
                    rows.add(row);
                }
                Map<String, Object> res = new LinkedHashMap<>();
                res.put("columns", columns);
                res.put("rows", rows);
                res.put("rowCount", rows.size());
                return res;
            });
            long duration = System.currentTimeMillis() - start;
            result.put("durationMs", duration);
            result.put("truncated", result.get("rowCount") != null && ((Integer) result.get("rowCount")) >= maxRows);
            result.put("maxRows", maxRows);
            result.put("status", "success");
            return result;
        } catch (Exception ex) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("status", "error");
            err.put("error", ex.getMessage());
            err.put("durationMs", System.currentTimeMillis() - start);
            return err;
        }
    }

    private void validateSelectOnly(String sql) {
        if (sql == null || sql.isBlank()) {
            throw new IllegalArgumentException("SQL is empty");
        }
        String trimmed = sql.trim();
        if (trimmed.contains(";")) {
            throw new IllegalArgumentException("Semicolons are not allowed in try-run SQL");
        }
        if (!isSelectLike(trimmed)) {
            throw new IllegalArgumentException(
                    "SQL repository try-run only allows SELECT (or WITH ... SELECT). DML assets are for sqlTransaction only."
            );
        }
    }

    private boolean isSelectLike(String sql) {
        if (sql == null || sql.isBlank()) {
            return false;
        }
        String first = sql.trim().toLowerCase(Locale.ROOT).split("\\s+")[0];
        return "select".equals(first) || "with".equals(first);
    }

    private String inferAssetKind(String queryMode, String sqlText) {
        if ("dml".equalsIgnoreCase(queryMode)) {
            return "dml";
        }
        if ("singleTableTemplate".equalsIgnoreCase(queryMode)) {
            return "select";
        }
        return isSelectLike(sqlText) ? "select" : "dml";
    }

    private List<String> extractParamNames(String sqlText) {
        Set<String> names = new LinkedHashSet<>();
        if (sqlText == null) {
            return new ArrayList<>();
        }
        Matcher matcher = NAMED_PARAM.matcher(sqlText);
        while (matcher.find()) {
            names.add(matcher.group(1));
        }
        return new ArrayList<>(names);
    }
}
