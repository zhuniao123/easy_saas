package com.example.lowcode.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
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
 * Executes configured SQL transaction actions.
 * SQL body is never accepted from the client — only actionCode + context.
 */
@Service
public class ActionService {
    private static final Pattern NAMED_PARAM = Pattern.compile("(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)");
    private static final Pattern SAFE_PARAM_NAME = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");
    private static final int DEFAULT_TIMEOUT_SECONDS = 10;

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private ObjectMapper objectMapper;

    public Map<String, Object> execute(String actionCode, Map<String, Object> requestBody) {
        if (actionCode == null || actionCode.isBlank()) {
            throw new IllegalArgumentException("actionCode is required");
        }
        String pageCode = requestBody == null ? null : stringOrNull(requestBody.get("pageCode"));
        @SuppressWarnings("unchecked")
        Map<String, Object> row = requestBody != null && requestBody.get("row") instanceof Map
                ? (Map<String, Object>) requestBody.get("row")
                : Map.of();
        @SuppressWarnings("unchecked")
        Map<String, Object> form = requestBody != null && requestBody.get("form") instanceof Map
                ? (Map<String, Object>) requestBody.get("form")
                : Map.of();
        @SuppressWarnings("unchecked")
        Map<String, Object> requestParams = requestBody != null && requestBody.get("params") instanceof Map
                ? (Map<String, Object>) requestBody.get("params")
                : Map.of();

        Map<String, Object> definition = resolveActionDefinition(actionCode, pageCode);
        String actionType = stringOrNull(definition.get("type"));
        if (actionType == null) {
            actionType = "sqlTransaction";
        }
        if (!"sqlTransaction".equalsIgnoreCase(actionType)) {
            throw new IllegalArgumentException("Unsupported action type: " + actionType);
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> txConfig = definition.get("sqlTransaction") instanceof Map
                ? (Map<String, Object>) definition.get("sqlTransaction")
                : definition;

        List<Map<String, Object>> statements = parseStatements(txConfig.get("statements"));
        if (statements.isEmpty()) {
            throw new IllegalArgumentException("Action has no statements configured");
        }

        Map<String, Object> boundParams = bindParameters(txConfig, row, form, requestParams);
        final int timeoutSeconds;
        if (txConfig.get("timeoutSeconds") instanceof Number) {
            timeoutSeconds = Math.max(1, Math.min(60, ((Number) txConfig.get("timeoutSeconds")).intValue()));
        } else {
            timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
        }

        long start = System.currentTimeMillis();
        boolean success = false;
        String errMsg = null;
        List<Integer> rowsAffected = new ArrayList<>();
        try {
            rowsAffected = jdbcTemplate.getJdbcOperations().execute((ConnectionCallback<List<Integer>>) connection -> {
                boolean previousAutoCommit = connection.getAutoCommit();
                connection.setAutoCommit(false);
                List<Integer> affected = new ArrayList<>();
                try (Statement timeoutStmt = connection.createStatement()) {
                    timeoutStmt.execute("SET LOCAL statement_timeout = '" + timeoutSeconds + "s'");
                }
                try {
                    for (Map<String, Object> statementDef : statements) {
                        String sql = resolveStatementSql(statementDef);
                        String kind = statementDef.get("kind") == null ? "write" : String.valueOf(statementDef.get("kind"));
                        validateStatement(sql, kind);
                        Map<String, Object> stmtParams = filterParamsForSql(sql, boundParams);

                        if ("assert".equalsIgnoreCase(kind)) {
                            runAssert(connection, sql, stmtParams);
                            affected.add(0);
                        } else {
                            int count = runWrite(connection, sql, stmtParams);
                            affected.add(count);
                        }
                    }
                    connection.commit();
                    return affected;
                } catch (RuntimeException ex) {
                    connection.rollback();
                    throw ex;
                } catch (Exception ex) {
                    connection.rollback();
                    throw new IllegalStateException(ex.getMessage(), ex);
                } finally {
                    connection.setAutoCommit(previousAutoCommit);
                }
            });
            success = true;
        } catch (RuntimeException ex) {
            errMsg = ex.getMessage();
            throw ex;
        } finally {
            long duration = System.currentTimeMillis() - start;
            writeLog(actionCode, pageCode, boundParams, success, errMsg, (int) duration);
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("status", "success");
        response.put("message", txConfig.get("successMessage") != null
                ? String.valueOf(txConfig.get("successMessage"))
                : "Action completed");
        response.put("refresh", txConfig.get("refresh") == null || Boolean.TRUE.equals(txConfig.get("refresh")));
        response.put("rowsAffected", rowsAffected);
        return response;
    }

    private Map<String, Object> resolveActionDefinition(String actionCode, String pageCode) {
        // 1) Catalog
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("code", actionCode);
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT action_type, label, config_json::text AS config_json, enabled FROM lc_action WHERE action_code = :code",
                    params
            );
            if (!rows.isEmpty()) {
                Map<String, Object> row = rows.get(0);
                Object enabled = row.get("enabled");
                if (enabled instanceof Boolean b && !b) {
                    throw new IllegalStateException("Action is disabled: " + actionCode);
                }
                if (enabled != null && !(enabled instanceof Boolean)
                        && !Boolean.parseBoolean(String.valueOf(enabled))) {
                    throw new IllegalStateException("Action is disabled: " + actionCode);
                }
                Map<String, Object> config = objectMapper.readValue(
                        String.valueOf(row.get("config_json")),
                        new TypeReference<Map<String, Object>>() {}
                );
                if (!config.containsKey("type") && row.get("action_type") != null) {
                    config.put("type", row.get("action_type"));
                }
                return config;
            }
        } catch (IllegalStateException ex) {
            throw ex;
        } catch (Exception ignore) {
            // table missing or parse error → try page embed
        }

        // 2) Page embed fallback
        if (pageCode == null || pageCode.isBlank()) {
            throw new IllegalArgumentException("Action not found in catalog; pageCode is required for page-embedded actions: " + actionCode);
        }
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("pageCode", pageCode);
            String configJson = jdbcTemplate.queryForObject(
                    "SELECT config_json::text FROM lc_page_model WHERE page_code = :pageCode",
                    params,
                    String.class
            );
            Map<String, Object> pageConfig = objectMapper.readValue(configJson, new TypeReference<Map<String, Object>>() {});
            Map<String, Object> embedded = findEmbeddedAction(pageConfig, actionCode);
            if (embedded != null) {
                return embedded;
            }
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Action not found: " + actionCode, ex);
        }
        throw new IllegalArgumentException("Action not found: " + actionCode);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findEmbeddedAction(Map<String, Object> pageConfig, String actionCode) {
        List<Map<String, Object>> actions = new ArrayList<>();
        if (pageConfig.get("actions") instanceof List<?> top) {
            for (Object item : top) {
                if (item instanceof Map) {
                    actions.add((Map<String, Object>) item);
                }
            }
        }
        if (pageConfig.get("table") instanceof Map<?, ?> table
                && ((Map<String, Object>) table).get("actions") instanceof List<?> tableActions) {
            for (Object item : tableActions) {
                if (item instanceof Map) {
                    actions.add((Map<String, Object>) item);
                }
            }
        }
        for (Map<String, Object> action : actions) {
            String code = stringOrNull(action.get("code"));
            String ref = stringOrNull(action.get("actionCode"));
            if (!actionCode.equals(code) && !actionCode.equals(ref)) {
                continue;
            }
            String type = stringOrNull(action.get("type"));
            if (type != null && !"sqlTransaction".equalsIgnoreCase(type) && action.get("sqlTransaction") == null) {
                continue;
            }
            if (action.get("sqlTransaction") instanceof Map) {
                Map<String, Object> def = new LinkedHashMap<>();
                def.put("type", "sqlTransaction");
                def.put("sqlTransaction", action.get("sqlTransaction"));
                return def;
            }
            // whole action body is the tx config
            if (action.get("statements") != null) {
                Map<String, Object> def = new LinkedHashMap<>(action);
                def.put("type", "sqlTransaction");
                return def;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseStatements(Object raw) {
        List<Map<String, Object>> result = new ArrayList<>();
        if (!(raw instanceof List<?> list)) {
            return result;
        }
        for (Object item : list) {
            if (item instanceof String sql) {
                Map<String, Object> one = new LinkedHashMap<>();
                one.put("sql", sql);
                one.put("kind", "write");
                result.add(one);
            } else if (item instanceof Map) {
                result.add((Map<String, Object>) item);
            }
        }
        return result;
    }

    /**
     * Prefer SQL repository asset ({@code sqlAssetCode}); fall back to inline {@code sql} for legacy configs.
     * Client never supplies SQL — both paths load from DB-backed action/page config.
     */
    private String resolveStatementSql(Map<String, Object> statementDef) {
        String assetCode = stringOrNull(statementDef.get("sqlAssetCode"));
        if (assetCode == null || assetCode.isBlank()) {
            assetCode = stringOrNull(statementDef.get("sql_asset_code"));
        }
        if (assetCode != null && !assetCode.isBlank()) {
            Map<String, Object> params = new HashMap<>();
            params.put("code", assetCode);
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT sql_text FROM lc_query_model WHERE query_code = :code",
                    params
            );
            if (rows.isEmpty() || rows.get(0).get("sql_text") == null) {
                throw new IllegalArgumentException("SQL asset not found in repository: " + assetCode);
            }
            String sql = String.valueOf(rows.get(0).get("sql_text"));
            if (sql.isBlank()) {
                throw new IllegalArgumentException("SQL asset is empty: " + assetCode);
            }
            return sql;
        }

        String inline = stringOrNull(statementDef.get("sql"));
        if (inline != null && !inline.isBlank()) {
            return inline;
        }
        throw new IllegalArgumentException(
                "Statement requires sqlAssetCode (preferred) or inline sql; both missing"
        );
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> bindParameters(
            Map<String, Object> txConfig,
            Map<String, Object> row,
            Map<String, Object> form,
            Map<String, Object> requestParams
    ) {
        Map<String, Object> bound = new LinkedHashMap<>();
        Object bindRaw = txConfig.get("bind");
        if (!(bindRaw instanceof Map<?, ?> bindMap) || bindMap.isEmpty()) {
            // Legacy/simple: fixedParams + all row fields (fixed wins)
            if (txConfig.get("fixedParams") instanceof Map<?, ?> fixed) {
                fixed.forEach((k, v) -> bound.put(String.valueOf(k), v));
            }
            if (row != null) {
                row.forEach((k, v) -> {
                    if (!bound.containsKey(k)) {
                        bound.put(k, v);
                    }
                });
            }
            return bound;
        }

        Map<String, Object> bind = (Map<String, Object>) bindRaw;
        for (Map.Entry<String, Object> entry : bind.entrySet()) {
            String paramName = entry.getKey();
            if (!SAFE_PARAM_NAME.matcher(paramName).matches()) {
                throw new IllegalArgumentException("Invalid bind param name: " + paramName);
            }
            if (!(entry.getValue() instanceof Map<?, ?> specMap)) {
                throw new IllegalArgumentException("Bind entry must be object: " + paramName);
            }
            Map<String, Object> spec = (Map<String, Object>) specMap;
            String from = spec.get("from") == null ? "row" : String.valueOf(spec.get("from"));
            boolean required = spec.get("required") == null || Boolean.TRUE.equals(spec.get("required"))
                    || "true".equalsIgnoreCase(String.valueOf(spec.get("required")));
            Object value;
            switch (from.toLowerCase(Locale.ROOT)) {
                case "fixed" -> value = spec.get("value");
                case "row" -> {
                    String field = spec.get("field") == null ? paramName : String.valueOf(spec.get("field"));
                    value = row == null ? null : row.get(field);
                }
                case "form" -> {
                    String field = spec.get("field") == null ? paramName : String.valueOf(spec.get("field"));
                    value = form == null ? null : form.get(field);
                }
                case "request" -> {
                    String field = spec.get("field") == null ? paramName : String.valueOf(spec.get("field"));
                    value = requestParams == null ? null : requestParams.get(field);
                }
                default -> throw new IllegalArgumentException("Unknown bind.from: " + from);
            }
            if (value == null || (value instanceof String s && s.isBlank())) {
                if (required) {
                    throw new IllegalArgumentException("Missing required param: " + paramName);
                }
            }
            bound.put(paramName, value);
        }
        return bound;
    }

    private void validateStatement(String sql, String kind) {
        if (sql == null || sql.isBlank()) {
            throw new IllegalArgumentException("Statement sql is empty");
        }
        String trimmed = sql.trim();
        if (trimmed.contains(";")) {
            throw new IllegalArgumentException("Semicolons are not allowed in action SQL; use statements[] instead");
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        // Only allow DML/SELECT as the first keyword — blocks DDL/DCL without matching column names.
        String first = firstKeyword(lower);
        if ("assert".equalsIgnoreCase(kind)) {
            if (!"select".equals(first)) {
                throw new IllegalArgumentException("assert statements must be SELECT");
            }
        } else {
            if (!Set.of("select", "insert", "update", "delete").contains(first)) {
                throw new IllegalArgumentException("write statements must start with SELECT/INSERT/UPDATE/DELETE");
            }
        }
    }

    private String firstKeyword(String lowerSql) {
        String[] parts = lowerSql.trim().split("\\s+");
        return parts.length == 0 ? "" : parts[0];
    }

    private Map<String, Object> filterParamsForSql(String sql, Map<String, Object> boundParams) {
        Set<String> needed = new LinkedHashSet<>();
        Matcher matcher = NAMED_PARAM.matcher(sql);
        while (matcher.find()) {
            needed.add(matcher.group(1));
        }
        Map<String, Object> filtered = new HashMap<>();
        for (String name : needed) {
            if (!boundParams.containsKey(name)) {
                throw new IllegalArgumentException("SQL requires unbound parameter :" + name);
            }
            filtered.put(name, boundParams.get(name));
        }
        return filtered;
    }

    private int runWrite(java.sql.Connection connection, String sql, Map<String, Object> params) throws Exception {
        String jdbcSql = toJdbcPlaceholders(sql, params);
        try (PreparedStatement ps = connection.prepareStatement(jdbcSql)) {
            bindPrepared(ps, sql, params);
            return ps.executeUpdate();
        }
    }

    private void runAssert(java.sql.Connection connection, String sql, Map<String, Object> params) throws Exception {
        String jdbcSql = toJdbcPlaceholders(sql, params);
        try (PreparedStatement ps = connection.prepareStatement(jdbcSql)) {
            bindPrepared(ps, sql, params);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new IllegalStateException("Assert failed: no rows returned");
                }
                ResultSetMetaData meta = rs.getMetaData();
                for (int i = 1; i <= meta.getColumnCount(); i++) {
                    if ("ok".equalsIgnoreCase(meta.getColumnLabel(i))) {
                        Object ok = rs.getObject(i);
                        if (!isTruthy(ok)) {
                            throw new IllegalStateException("Assert failed: ok=" + ok);
                        }
                    }
                }
            }
        }
    }

    private boolean isTruthy(Object ok) {
        if (ok == null) return false;
        if (ok instanceof Boolean b) return b;
        if (ok instanceof Number n) return n.intValue() != 0;
        String s = String.valueOf(ok).trim().toLowerCase(Locale.ROOT);
        return s.equals("t") || s.equals("true") || s.equals("1") || s.equals("yes") || s.equals("y");
    }

    private String toJdbcPlaceholders(String sql, Map<String, Object> params) {
        // Replace :name with ? in order of appearance for PreparedStatement
        Matcher matcher = NAMED_PARAM.matcher(sql);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            matcher.appendReplacement(sb, "?");
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private void bindPrepared(PreparedStatement ps, String sql, Map<String, Object> params) throws Exception {
        Matcher matcher = NAMED_PARAM.matcher(sql);
        int index = 1;
        while (matcher.find()) {
            String name = matcher.group(1);
            ps.setObject(index++, params.get(name));
        }
    }

    private void writeLog(
            String actionCode,
            String pageCode,
            Map<String, Object> params,
            boolean success,
            String errMsg,
            int durationMs
    ) {
        try {
            String paramsJson = objectMapper.writeValueAsString(params == null ? Map.of() : params);
            Map<String, Object> logParams = new HashMap<>();
            logParams.put("actionCode", actionCode);
            logParams.put("pageCode", pageCode);
            logParams.put("paramsJson", paramsJson);
            logParams.put("success", success);
            logParams.put("errMsg", errMsg);
            logParams.put("duration", durationMs);
            jdbcTemplate.update(
                    """
                    INSERT INTO lc_action_log(action_code, page_code, params_json, success, error_message, duration_ms)
                    VALUES (:actionCode, :pageCode, :paramsJson::jsonb, :success, :errMsg, :duration)
                    """,
                    logParams
            );
        } catch (Exception ignore) {
            // logging must not break primary flow after commit; before commit failure still rethrows
        }
    }

    private String stringOrNull(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
