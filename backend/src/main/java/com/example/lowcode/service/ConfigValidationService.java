package com.example.lowcode.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates Page / SQL-repo / Action configs before persist.
 */
@Service
public class ConfigValidationService {
    private static final Pattern SAFE_CODE = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");
    private static final Pattern SAFE_ROUTE = Pattern.compile("^/[a-zA-Z0-9_\\-./]*$");
    private static final Set<String> QUERY_MODES = Set.of("rawSql", "singleTableTemplate", "dml");
    private static final Set<String> ACTION_TYPES = Set.of("sqlTransaction", "builtin", "openQuery", "client");
    private static final Set<String> STMT_KINDS = Set.of("write", "assert");

    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    public void validatePageConfigJson(String configJsonStr) {
        if (configJsonStr == null || configJsonStr.isBlank()) {
            throw new IllegalArgumentException("Page configJson is required");
        }
        Map<String, Object> config;
        try {
            config = objectMapper.readValue(configJsonStr, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ex) {
            throw new IllegalArgumentException("Page configJson is not valid JSON: " + ex.getMessage());
        }

        Object dataSource = config.get("dataSource");
        if (dataSource instanceof Map<?, ?> ds) {
            Object qc = ds.get("queryCode");
            if (qc != null && !String.valueOf(qc).isBlank()) {
                requireQueryExists(String.valueOf(qc), "dataSource.queryCode");
            }
            Object pageSize = ds.get("pageSize");
            if (pageSize instanceof Number n && (n.intValue() < 1 || n.intValue() > 500)) {
                throw new IllegalArgumentException("dataSource.pageSize must be between 1 and 500");
            }
        }

        Object table = config.get("table");
        if (table instanceof Map<?, ?> tableMap) {
            validatePageActions(tableMap.get("actions"));
            validatePageFilters(tableMap.get("filters"));
            validatePageColumns(tableMap.get("columns"));
        }
        // legacy top-level actions
        if (config.get("actions") != null) {
            validatePageActions(config.get("actions"));
        }
    }

    @SuppressWarnings("unchecked")
    private void validatePageActions(Object actionsRaw) {
        if (!(actionsRaw instanceof List<?> list)) {
            return;
        }
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> action)) {
                throw new IllegalArgumentException("Each action must be a JSON object");
            }
            Map<String, Object> a = (Map<String, Object>) action;
            String code = str(a.get("code"));
            if (code == null || code.isBlank()) {
                throw new IllegalArgumentException("action.code is required");
            }
            String type = str(a.get("type"));
            if (type != null && !type.isBlank() && !ACTION_TYPES.contains(type)
                    && a.get("sqlTransaction") == null && a.get("openQuery") == null
                    && a.get("dsl") == null && a.get("handler") == null) {
                throw new IllegalArgumentException("Unknown action type: " + type + " (code=" + code + ")");
            }
            if ("sqlTransaction".equalsIgnoreCase(type) || a.get("sqlTransaction") != null) {
                String actionCode = str(a.get("actionCode"));
                if (actionCode == null || actionCode.isBlank()) {
                    actionCode = code;
                }
                // Prefer catalog existence; allow embedded sqlTransaction without catalog
                if (a.get("sqlTransaction") == null) {
                    requireActionExists(actionCode, "action.actionCode");
                } else {
                    validateSqlTransactionBody(asMap(a.get("sqlTransaction")), true);
                }
            }
            if ("openQuery".equalsIgnoreCase(type) || a.get("openQuery") != null) {
                Map<String, Object> oq = asMap(a.get("openQuery"));
                if (oq == null) {
                    throw new IllegalArgumentException("openQuery action requires openQuery object (code=" + code + ")");
                }
                String qc = str(oq.get("queryCode"));
                if (qc == null || qc.isBlank()) {
                    throw new IllegalArgumentException("openQuery.queryCode is required (code=" + code + ")");
                }
                requireQueryExists(qc, "openQuery.queryCode");
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void validatePageFilters(Object filtersRaw) {
        if (!(filtersRaw instanceof List<?> list)) {
            return;
        }
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> filter)) {
                continue;
            }
            Map<String, Object> f = (Map<String, Object>) filter;
            if (f.get("field") == null || String.valueOf(f.get("field")).isBlank()) {
                throw new IllegalArgumentException("filter.field is required");
            }
            Object options = f.get("options");
            if (options instanceof Map<?, ?> opt) {
                String source = str(opt.get("source"));
                if ("sql".equalsIgnoreCase(source)) {
                    String qc = str(opt.get("queryCode"));
                    if (qc == null || qc.isBlank()) {
                        throw new IllegalArgumentException("filter options.sql requires queryCode");
                    }
                    requireQueryExists(qc, "filter.options.queryCode");
                } else if ("dict".equalsIgnoreCase(source)) {
                    String dictCode = str(opt.get("dictCode"));
                    if (dictCode == null || dictCode.isBlank()) {
                        throw new IllegalArgumentException("filter options.dict requires dictCode");
                    }
                    requireDictExists(dictCode);
                }
            }
        }
    }

    private void validatePageColumns(Object columnsRaw) {
        if (!(columnsRaw instanceof List<?> list)) {
            return;
        }
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> col)) {
                continue;
            }
            if (col.get("field") == null || String.valueOf(col.get("field")).isBlank()) {
                throw new IllegalArgumentException("column.field is required");
            }
            Object dictCode = col.get("dictCode");
            if (dictCode != null && !String.valueOf(dictCode).isBlank()) {
                requireDictExists(String.valueOf(dictCode));
            }
        }
    }

    public void validateSqlAsset(String queryCode, String sqlText, String queryMode) {
        if (queryCode == null || !SAFE_CODE.matcher(queryCode).matches()) {
            throw new IllegalArgumentException("queryCode must match [a-zA-Z_][a-zA-Z0-9_]*");
        }
        if (sqlText == null || sqlText.isBlank()) {
            throw new IllegalArgumentException("sqlText is required");
        }
        if (sqlText.contains(";")) {
            throw new IllegalArgumentException("Semicolons are not allowed in SQL assets; use multiple statements in actions");
        }
        if (queryMode != null && !QUERY_MODES.contains(queryMode)) {
            throw new IllegalArgumentException("queryMode must be one of " + QUERY_MODES);
        }
        String first = firstKeyword(sqlText);
        boolean selectLike = "select".equals(first) || "with".equals(first);
        boolean dmlLike = Set.of("insert", "update", "delete").contains(first);
        if ("dml".equals(queryMode) && selectLike) {
            throw new IllegalArgumentException("queryMode=dml requires INSERT/UPDATE/DELETE SQL");
        }
        if (("rawSql".equals(queryMode) || "singleTableTemplate".equals(queryMode)) && !selectLike && !dmlLike) {
            // allow dml auto-coercion elsewhere; if explicit select modes, warn as error for non DML/select
            if (!dmlLike) {
                throw new IllegalArgumentException("SQL must start with SELECT/WITH/INSERT/UPDATE/DELETE");
            }
        }
        if (!selectLike && !dmlLike) {
            throw new IllegalArgumentException("SQL must start with SELECT/WITH/INSERT/UPDATE/DELETE");
        }
        // ban obvious DDL
        if (Set.of("alter", "drop", "create", "truncate", "grant", "revoke").contains(first)) {
            throw new IllegalArgumentException("DDL statements are not allowed in SQL repository");
        }
    }

    public void validateActionSave(String actionCode, String actionType, String label, String configJsonStr) {
        if (actionCode == null || !SAFE_CODE.matcher(actionCode).matches()) {
            throw new IllegalArgumentException("actionCode must match [a-zA-Z_][a-zA-Z0-9_]*");
        }
        if (label == null || label.isBlank()) {
            throw new IllegalArgumentException("label is required");
        }
        if (actionType == null || actionType.isBlank()) {
            actionType = "sqlTransaction";
        }
        if (!ACTION_TYPES.contains(actionType) && !"sqlTransaction".equals(actionType)) {
            throw new IllegalArgumentException("actionType must be one of " + ACTION_TYPES);
        }
        if (configJsonStr == null || configJsonStr.isBlank()) {
            throw new IllegalArgumentException("configJson is required");
        }
        Map<String, Object> config;
        try {
            config = objectMapper.readValue(configJsonStr, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ex) {
            throw new IllegalArgumentException("Action configJson is not valid JSON: " + ex.getMessage());
        }

        Map<String, Object> tx = config;
        if (config.get("sqlTransaction") instanceof Map<?, ?>) {
            tx = asMap(config.get("sqlTransaction"));
        }
        if ("sqlTransaction".equals(actionType) || config.get("statements") != null || config.get("sqlTransaction") != null) {
            validateSqlTransactionBody(tx, false);
        }
    }

    @SuppressWarnings("unchecked")
    private void validateSqlTransactionBody(Map<String, Object> tx, boolean allowEmptyStatements) {
        if (tx == null) {
            throw new IllegalArgumentException("sqlTransaction body is required");
        }
        Object statements = tx.get("statements");
        if (!(statements instanceof List<?> list) || list.isEmpty()) {
            if (allowEmptyStatements) {
                return;
            }
            throw new IllegalArgumentException("sqlTransaction.statements must be a non-empty array");
        }
        for (Object item : list) {
            if (item instanceof String sql) {
                if (sql.isBlank() || sql.contains(";")) {
                    throw new IllegalArgumentException("Inline statement sql is empty or contains semicolon");
                }
                continue;
            }
            if (!(item instanceof Map<?, ?> stmtMap)) {
                throw new IllegalArgumentException("Each statement must be string or object");
            }
            Map<String, Object> stmt = (Map<String, Object>) stmtMap;
            String kind = str(stmt.get("kind"));
            if (kind != null && !kind.isBlank() && !STMT_KINDS.contains(kind)) {
                throw new IllegalArgumentException("statement.kind must be write or assert");
            }
            String asset = str(stmt.get("sqlAssetCode"));
            if (asset == null || asset.isBlank()) {
                asset = str(stmt.get("sql_asset_code"));
            }
            String sql = str(stmt.get("sql"));
            if ((asset == null || asset.isBlank()) && (sql == null || sql.isBlank())) {
                throw new IllegalArgumentException("statement requires sqlAssetCode or sql");
            }
            if (asset != null && !asset.isBlank()) {
                requireQueryExists(asset, "statement.sqlAssetCode");
            }
            if (sql != null && sql.contains(";")) {
                throw new IllegalArgumentException("statement.sql must not contain semicolon");
            }
        }
        Object bind = tx.get("bind");
        if (bind != null && !(bind instanceof Map<?, ?>)) {
            throw new IllegalArgumentException("sqlTransaction.bind must be an object");
        }
    }

    public void validateRoutePath(String routePath) {
        if (routePath == null || routePath.isBlank()) {
            throw new IllegalArgumentException("routePath is required");
        }
        if (!SAFE_ROUTE.matcher(routePath).matches()) {
            throw new IllegalArgumentException("routePath must start with / and use safe characters");
        }
    }

    private void requireQueryExists(String queryCode, String field) {
        Map<String, Object> params = new HashMap<>();
        params.put("code", queryCode);
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM lc_query_model WHERE query_code = :code",
                params,
                Integer.class
        );
        if (n == null || n == 0) {
            throw new IllegalArgumentException(field + " references missing SQL asset: " + queryCode);
        }
    }

    private void requireActionExists(String actionCode, String field) {
        Map<String, Object> params = new HashMap<>();
        params.put("code", actionCode);
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM lc_action WHERE action_code = :code",
                params,
                Integer.class
        );
        if (n == null || n == 0) {
            throw new IllegalArgumentException(field + " references missing action: " + actionCode);
        }
    }

    private void requireDictExists(String dictCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("code", dictCode);
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM lc_dict_type WHERE dict_code = :code",
                params,
                Integer.class
        );
        if (n == null || n == 0) {
            throw new IllegalArgumentException("dictCode not found: " + dictCode);
        }
    }

    private String firstKeyword(String sql) {
        String trimmed = sql.trim().toLowerCase(Locale.ROOT);
        String[] parts = trimmed.split("\\s+");
        return parts.length == 0 ? "" : parts[0];
    }

    private String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object v) {
        if (v instanceof Map<?, ?> m) {
            return (Map<String, Object>) m;
        }
        return null;
    }
}
