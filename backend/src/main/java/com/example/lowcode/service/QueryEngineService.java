package com.example.lowcode.service;

import com.example.lowcode.interceptor.IGroovyActionInterceptor;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class QueryEngineService {
    private static final int MAX_PAGE_SIZE = 200;
    private static final int RAW_SQL_TIMEOUT_SECONDS = 15;
    private static final Pattern SAFE_RESULT_FIELD = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private JdbcDataSourceRegistry jdbcDataSourceRegistry;
    @Autowired
    private GroovyScriptService groovyScriptService;
    @Autowired
    private PageService pageService;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private ConfigValidationService configValidationService;
    @Autowired
    private QueryLogService queryLogService;
    @Autowired
    private AuthzRuntimeService authzRuntimeService;

    @Transactional(readOnly = true, timeout = RAW_SQL_TIMEOUT_SECONDS)
    public Map<String, Object> executeSql(String queryCode, Map<String, Object> requestParams) {
        return executeSql(queryCode, requestParams, new ArrayList<>(), null);
    }

    @Transactional(readOnly = true, timeout = RAW_SQL_TIMEOUT_SECONDS)
    public Map<String, Object> executeSql(String queryCode, Map<String, Object> requestParams, List<Map<String, Object>> filters) {
        return executeSql(queryCode, requestParams, filters, null);
    }

    /**
     * @param pageCode optional; when set, page.data_source_code overrides query binding
     */
    @Transactional(readOnly = true, timeout = RAW_SQL_TIMEOUT_SECONDS)
    public Map<String, Object> executeSql(
            String queryCode,
            Map<String, Object> requestParams,
            List<Map<String, Object>> filters,
            String pageCode
    ) {
        Map<String, Object> modelParams = new HashMap<>();
        modelParams.put("queryCode", queryCode);

        // Metadata always from platform DS
        Map<String, Object> queryModel = jdbcTemplate.queryForMap(
            "SELECT sql_text, count_sql_text, groovy_script_code, anchor_entity FROM lc_query_model WHERE query_code = :queryCode",
            modelParams
        );
        String dsCode = jdbcDataSourceRegistry.resolveDsCode(pageCode, queryCode);
        NamedParameterJdbcTemplate bizJdbc = jdbcDataSourceRegistry.getTemplate(dsCode);
        
        String sqlText = (String) queryModel.get("sql_text");
        String countSqlText = (String) queryModel.get("count_sql_text");
        String groovyCode = (String) queryModel.get("groovy_script_code");
        String anchorEntity = (String) queryModel.get("anchor_entity");

        IGroovyActionInterceptor interceptor = null;
        try {
            interceptor = groovyScriptService.getInterceptor(groovyCode);
            if (interceptor != null) {
                interceptor.beforeQuery(requestParams);
            }
        } catch (Exception hookEx) {
            if (interceptor != null) {
                try {
                    interceptor.onError("beforeQuery", hookEx,
                            Map.of("queryCode", queryCode));
                } catch (Exception ignored) { /* isolation */ }
            }
            throw hookEx instanceof RuntimeException re ? re : new IllegalStateException(hookEx.getMessage(), hookEx);
        }

        // Extract pagination and sorting parameters
        Integer page = null;
        Integer pageSize = null;
        String sortField = null;
        String sortOrder = null;

        if (requestParams != null) {
            if (requestParams.containsKey("_page") && requestParams.get("_page") != null) {
                try {
                    page = Integer.parseInt(requestParams.get("_page").toString());
                } catch (Exception e) { /* ignore */ }
            }
            if (requestParams.containsKey("_pageSize") && requestParams.get("_pageSize") != null) {
                try {
                    pageSize = Math.min(Integer.parseInt(requestParams.get("_pageSize").toString()), MAX_PAGE_SIZE);
                } catch (Exception e) { /* ignore */ }
            }
            if (requestParams.containsKey("_sortField") && requestParams.get("_sortField") != null) {
                String field = requestParams.get("_sortField").toString();
                if (field.matches("^[a-zA-Z0-9_\\.]+$")) {
                    sortField = field;
                }
            }
            if (requestParams.containsKey("_sortOrder") && requestParams.get("_sortOrder") != null) {
                String order = requestParams.get("_sortOrder").toString().toUpperCase();
                if ("ASC".equals(order) || "DESC".equals(order)) {
                    sortOrder = order;
                }
            }
        }

        Map<String, Object> sqlParams = new HashMap<>(requestParams != null ? requestParams : new HashMap<>());
        sqlParams.remove("_page");
        sqlParams.remove("_pageSize");
        sqlParams.remove("_sortField");
        sqlParams.remove("_sortOrder");
        // Forced scope params (client cannot override); optional row filter when page declares authz fields.
        authzRuntimeService.applyForcedParams(sqlParams);
        AuthzRuntimeService.ScopeBinding scopeBinding = authzRuntimeService.resolveScopeBinding(pageCode);
        sqlText = authzRuntimeService.applyScopeFilter(sqlText, sqlParams, scopeBinding);
        if (countSqlText != null && !countSqlText.isBlank() && !scopeBinding.isEmpty()
                && !authzRuntimeService.currentDataScope().isAll()) {
            // Count SQL may not include scope; fall back to auto-count on filtered SQL.
            countSqlText = null;
        }

        long start = System.currentTimeMillis();
        boolean success = false;
        String errMsg = null;
        Map<String, Object> result = null;
        try {
            Map<String, String> resultFields = inspectResultFields(bizJdbc, sqlText, sqlParams);
            String filteredSql = applyFilters(sqlText, filters, sqlParams, resultFields);

            // 1. Get total records count first
            Number totalValue;
            if (countSqlText != null && !countSqlText.isBlank() && (filters == null || filters.isEmpty())) {
                totalValue = bizJdbc.queryForObject(countSqlText, sqlParams, Number.class);
            } else {
                String countSql = "SELECT COUNT(*) FROM (" + filteredSql + ") as count_query";
                totalValue = bizJdbc.queryForObject(countSql, sqlParams, Number.class);
            }
            long total = totalValue == null ? 0L : totalValue.longValue();

            // 2. Build sorted/paginated final SQL
            StringBuilder finalSql = new StringBuilder();
            finalSql.append("SELECT * FROM (").append(filteredSql).append(") as main_query");
            if (sortField != null && !sortField.trim().isEmpty()) {
                String resolvedSortField = resultFields.get(sortField.toLowerCase());
                if (resolvedSortField == null || !SAFE_RESULT_FIELD.matcher(resolvedSortField).matches()) {
                    throw new IllegalArgumentException("Sort field is not present in the query result: " + sortField);
                }
                finalSql.append(" ORDER BY ");
                finalSql.append("\"").append(resolvedSortField).append("\"");
                if (sortOrder != null) {
                    finalSql.append(" ").append(sortOrder);
                }
            }
            if (pageSize != null && pageSize > 0) {
                finalSql.append(" LIMIT ").append(pageSize);
                if (page != null && page > 0) {
                    int offset = (page - 1) * pageSize;
                    finalSql.append(" OFFSET ").append(offset);
                }
            }

            result = bizJdbc.query(finalSql.toString(), sqlParams, rs -> {
                ResultSetMetaData metaData = rs.getMetaData();
                int count = metaData.getColumnCount();
                
                Map<String, List<Map<String, Object>>> entityFieldsMap = loadEntityFieldsMap();
                
                List<Map<String, Object>> columns = new ArrayList<>();
                for (int i = 1; i <= count; i++) {
                    String columnLabel = metaData.getColumnLabel(i);
                    String columnName = metaData.getColumnName(i);
                    String tableName = metaData.getTableName(i);
                    int sqlType = metaData.getColumnType(i);
                    
                    columns.add(resolveColumnMeta(columnLabel, columnName, tableName, anchorEntity, sqlType, entityFieldsMap));
                }
                
                List<Map<String, Object>> rows = new ArrayList<>();
                while (rs.next()) {
                    Map<String, Object> row = new HashMap<>();
                    for (int i = 1; i <= count; i++) {
                        String columnLabel = metaData.getColumnLabel(i);
                        row.put(columnLabel, rs.getObject(i));
                    }
                    rows.add(row);
                }
                
                Map<String, Object> res = new HashMap<>();
                res.put("columns", columns);
                res.put("rows", rows);
                return res;
            });

            if (result != null) {
                result.put("total", total);
            }
            success = true;
        } catch (Exception e) {
            errMsg = e.getMessage();
            if (interceptor != null) {
                try {
                    interceptor.onError("query", e,
                            Map.of("queryCode", queryCode));
                } catch (Exception ignored) { /* isolation */ }
            }
            throw e;
        } finally {
            long duration = System.currentTimeMillis() - start;
            queryLogService.record(queryCode, dsCode, success, (int) duration, errMsg);
        }

        if (result != null) {
            result.put("dataSourceCode", dsCode);
        }

        if (interceptor != null && result != null) {
            try {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> processedRows = interceptor.afterQuery((List<Map<String, Object>>) result.get("rows"));
                result.put("rows", processedRows);
            } catch (Exception hookEx) {
                try {
                    interceptor.onError("afterQuery", hookEx,
                            Map.of("queryCode", queryCode));
                } catch (Exception ignored) { /* isolation */ }
                throw hookEx instanceof RuntimeException re ? re : new IllegalStateException(hookEx.getMessage(), hookEx);
            }
        }

        // Field deny strip after hooks so scripts cannot re-expose denied columns.
        if (result != null) {
            authzRuntimeService.sanitizeQueryResult(result);
        }

        return result;
    }

    private Map<String, String> inspectResultFields(
            NamedParameterJdbcTemplate bizJdbc,
            String sqlText,
            Map<String, Object> sqlParams
    ) {
        // Probe result columns without fetching rows. Fail with a clearer message if SQL is invalid.
        String inspectSql = "SELECT * FROM (" + sqlText + ") AS result_field_probe LIMIT 0";
        try {
            return bizJdbc.query(inspectSql, sqlParams, rs -> {
                ResultSetMetaData metaData = rs.getMetaData();
                Map<String, String> fields = new LinkedHashMap<>();
                for (int i = 1; i <= metaData.getColumnCount(); i++) {
                    String label = metaData.getColumnLabel(i);
                    if (label != null) {
                        String key = label.toLowerCase();
                        if (fields.containsKey(key)) {
                            throw new IllegalArgumentException(
                                    "Query result contains duplicate column label '" + label + "'; use unique SQL aliases"
                            );
                        }
                        fields.put(key, label);
                    }
                }
                return fields;
            });
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            String detail = ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage();
            throw new IllegalArgumentException(
                    "Query SQL failed column inspection (check table/column names): " + detail,
                    ex
            );
        }
    }

    /**
     * Outer-wrap filters. Supports explicit {@code operator}:
     * eq | ne | ilike | like | in | between | isNull | isNotNull | gt | gte | lt | lte
     * <p>
     * When operator omitted, defaults by {@code type}: select/date → eq, text → ilike.
     * Null operators do not require a value. {@code in}/{@code between} accept List or comma text.
     */
    private String applyFilters(
            String sqlText,
            List<Map<String, Object>> filters,
            Map<String, Object> sqlParams,
            Map<String, String> resultFields) {
        if (filters == null || filters.isEmpty()) {
            return sqlText;
        }

        List<String> predicates = new ArrayList<>();
        int filterIndex = 0;
        for (Map<String, Object> filter : filters) {
            if (filter == null) {
                continue;
            }

            Object fieldObj = filter.get("field");
            if (fieldObj == null) {
                continue;
            }
            String field = String.valueOf(fieldObj).trim();
            if (field.isEmpty()) {
                continue;
            }

            String resolvedField = resultFields.get(field.toLowerCase());
            if (resolvedField == null || !SAFE_RESULT_FIELD.matcher(resolvedField).matches()) {
                throw new IllegalArgumentException("Filter field is not present in the query result: " + field);
            }

            String filterType = filter.get("type") == null ? "text" : String.valueOf(filter.get("type")).trim().toLowerCase();
            String operator = resolveFilterOperator(filter.get("operator"), filterType);
            String safeField = "\"" + resolvedField + "\"";
            Object valueObj = filter.containsKey("value") ? filter.get("value") : filter.get("values");

            if ("isnull".equals(operator)) {
                predicates.add(safeField + " IS NULL");
                continue;
            }
            if ("isnotnull".equals(operator)) {
                predicates.add(safeField + " IS NOT NULL");
                continue;
            }

            // between may use valueFrom/valueTo without a single "value"
            if ("between".equals(operator)) {
                Object from = filter.get("valueFrom");
                Object to = filter.get("valueTo");
                if (from == null || to == null) {
                    List<Object> items = toListValue(valueObj);
                    if (from == null && items.size() > 0) {
                        from = items.get(0);
                    }
                    if (to == null && items.size() > 1) {
                        to = items.get(1);
                    }
                }
                if (from == null || to == null
                        || String.valueOf(from).isBlank()
                        || String.valueOf(to).isBlank()) {
                    continue;
                }
                String paramKey = "__filter_" + filterIndex++;
                String pFrom = paramKey + "_from";
                String pTo = paramKey + "_to";
                if ("date".equals(filterType)) {
                    predicates.add(
                            "CAST(" + safeField + " AS DATE) BETWEEN CAST(:" + pFrom + " AS DATE) AND CAST(:" + pTo + " AS DATE)"
                    );
                } else {
                    predicates.add(safeField + " BETWEEN :" + pFrom + " AND :" + pTo);
                }
                sqlParams.put(pFrom, normalizeScalar(from));
                sqlParams.put(pTo, normalizeScalar(to));
                continue;
            }

            if (valueObj == null) {
                continue;
            }
            if (valueObj instanceof String s && s.trim().isEmpty() && !"in".equals(operator)) {
                continue;
            }

            String paramKey = "__filter_" + filterIndex++;

            switch (operator) {
                case "eq" -> {
                    if ("date".equals(filterType)) {
                        predicates.add("CAST(" + safeField + " AS DATE) = CAST(:" + paramKey + " AS DATE)");
                    } else {
                        predicates.add(safeField + " = :" + paramKey);
                    }
                    sqlParams.put(paramKey, normalizeScalar(valueObj));
                }
                case "ne" -> {
                    predicates.add(safeField + " <> :" + paramKey);
                    sqlParams.put(paramKey, normalizeScalar(valueObj));
                }
                case "gt" -> {
                    predicates.add(safeField + " > :" + paramKey);
                    sqlParams.put(paramKey, normalizeScalar(valueObj));
                }
                case "gte" -> {
                    predicates.add(safeField + " >= :" + paramKey);
                    sqlParams.put(paramKey, normalizeScalar(valueObj));
                }
                case "lt" -> {
                    predicates.add(safeField + " < :" + paramKey);
                    sqlParams.put(paramKey, normalizeScalar(valueObj));
                }
                case "lte" -> {
                    predicates.add(safeField + " <= :" + paramKey);
                    sqlParams.put(paramKey, normalizeScalar(valueObj));
                }
                case "like" -> {
                    predicates.add("CAST(" + safeField + " AS TEXT) LIKE :" + paramKey);
                    sqlParams.put(paramKey, withPercentWildcards(normalizeScalar(valueObj)));
                }
                case "ilike" -> {
                    predicates.add("CAST(" + safeField + " AS TEXT) ILIKE :" + paramKey);
                    sqlParams.put(paramKey, withPercentWildcards(normalizeScalar(valueObj)));
                }
                case "in" -> {
                    List<Object> items = toListValue(valueObj);
                    if (items.isEmpty()) {
                        continue;
                    }
                    List<String> placeholders = new ArrayList<>();
                    for (int i = 0; i < items.size(); i++) {
                        String pk = paramKey + "_" + i;
                        placeholders.add(":" + pk);
                        sqlParams.put(pk, items.get(i));
                    }
                    predicates.add(safeField + " IN (" + String.join(", ", placeholders) + ")");
                }
                default -> throw new IllegalArgumentException("Unsupported filter operator: " + operator);
            }
        }

        if (predicates.isEmpty()) {
            return sqlText;
        }

        return "SELECT * FROM (" + sqlText + ") as filtered_query WHERE " + String.join(" AND ", predicates);
    }

    private static String resolveFilterOperator(Object rawOperator, String filterType) {
        if (rawOperator != null && !String.valueOf(rawOperator).isBlank()) {
            return String.valueOf(rawOperator).trim().toLowerCase(java.util.Locale.ROOT)
                    .replace("-", "")
                    .replace("_", "");
        }
        // Legacy type mapping when operator omitted
        return switch (filterType == null ? "text" : filterType) {
            case "select", "date", "number", "integer" -> "eq";
            default -> "ilike";
        };
    }

    private static Object normalizeScalar(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String s) {
            return s.trim();
        }
        return value;
    }

    private static String withPercentWildcards(Object value) {
        String s = value == null ? "" : String.valueOf(value);
        if (s.contains("%") || s.contains("_")) {
            return s;
        }
        return "%" + s + "%";
    }

    @SuppressWarnings("unchecked")
    private static List<Object> toListValue(Object valueObj) {
        if (valueObj == null) {
            return List.of();
        }
        if (valueObj instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            for (Object item : list) {
                if (item == null) {
                    continue;
                }
                String s = String.valueOf(item).trim();
                if (!s.isEmpty()) {
                    out.add(item instanceof String ? s : item);
                }
            }
            return out;
        }
        String raw = String.valueOf(valueObj).trim();
        if (raw.isEmpty()) {
            return List.of();
        }
        // JSON array string
        if (raw.startsWith("[") && raw.endsWith("]")) {
            try {
                com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                List<Object> parsed = om.readValue(raw, List.class);
                return toListValue(parsed);
            } catch (Exception ignore) {
                /* fall through to comma split */
            }
        }
        String[] parts = raw.split("[,;|]");
        List<Object> out = new ArrayList<>();
        for (String p : parts) {
            String t = p.trim();
            if (!t.isEmpty()) {
                out.add(t);
            }
        }
        return out;
    }

    private Map<String, List<Map<String, Object>>> loadEntityFieldsMap() {
        Map<String, List<Map<String, Object>>> fieldsMap = new HashMap<>();
        try {
            List<Map<String, Object>> list = jdbcTemplate.queryForList(
                "SELECT entity_code, table_name, CAST(fields_json AS TEXT) as fields_str FROM lc_entity_model",
                new HashMap<>()
            );
            ObjectMapper mapper = new ObjectMapper();
            for (Map<String, Object> row : list) {
                String entityCode = (String) row.get("entity_code");
                String tableName = (String) row.get("table_name");
                String fieldsStr = (String) row.get("fields_str");
                if (fieldsStr != null) {
                    try {
                        List<Map<String, Object>> fields = mapper.readValue(
                            fieldsStr,
                            new TypeReference<List<Map<String, Object>>>() {}
                        );
                        if (entityCode != null) {
                            fieldsMap.put(entityCode.toLowerCase(), fields);
                        }
                        if (tableName != null) {
                            fieldsMap.put(tableName.toLowerCase(), fields);
                        }
                    } catch (Exception e) {
                        // ignore malformed fields_json
                    }
                }
            }
        } catch (Exception e) {
            // table might not exist yet or other query errors
        }
        return fieldsMap;
    }

    private Map<String, Object> resolveColumnMeta(
            String columnLabel, String columnName, String tableName, String anchorEntity,
            int sqlType, Map<String, List<Map<String, Object>>> entityFieldsMap) {
        
        List<Map<String, Object>> candidateFields = null;

        // Rule 1: Match by table name if available
        if (tableName != null && !tableName.trim().isEmpty()) {
            candidateFields = entityFieldsMap.get(tableName.trim().toLowerCase());
        }

        // Rule 2: Check anchor_entity
        if (candidateFields == null && anchorEntity != null) {
            candidateFields = entityFieldsMap.get(anchorEntity.trim().toLowerCase());
        }

        // Rule 3: Search candidates for columnName or columnLabel
        if (candidateFields != null) {
            for (Map<String, Object> fieldDef : candidateFields) {
                String f = (String) fieldDef.get("field");
                if (f != null && (f.equalsIgnoreCase(columnName) || f.equalsIgnoreCase(columnLabel))) {
                    Map<String, Object> meta = new HashMap<>();
                    meta.put("field", columnLabel);
                    meta.put("label", fieldDef.getOrDefault("label", columnLabel));
                    meta.put("type", fieldDef.getOrDefault("type", mapSqlType(sqlType)));
                    mergeFieldPresentation(meta, fieldDef);
                    return meta;
                }
            }
        }

        // Rule 4: Search ALL loaded entity models for any matching field
        for (List<Map<String, Object>> fields : entityFieldsMap.values()) {
            for (Map<String, Object> fieldDef : fields) {
                String f = (String) fieldDef.get("field");
                if (f != null && (f.equalsIgnoreCase(columnName) || f.equalsIgnoreCase(columnLabel))) {
                    Map<String, Object> meta = new HashMap<>();
                    meta.put("field", columnLabel);
                    meta.put("label", fieldDef.getOrDefault("label", columnLabel));
                    meta.put("type", fieldDef.getOrDefault("type", mapSqlType(sqlType)));
                    mergeFieldPresentation(meta, fieldDef);
                    return meta;
                }
            }
        }

        // Rule 5: Fallback to columnLabel (alias) and deduce type from sql type
        Map<String, Object> meta = new HashMap<>();
        meta.put("field", columnLabel);
        meta.put("label", columnLabel);
        meta.put("type", mapSqlType(sqlType));
        return meta;
    }

    private void mergeFieldPresentation(Map<String, Object> target, Map<String, Object> source) {
        for (String key : List.of("format", "tone", "width", "align", "hidden")) {
            if (source.containsKey(key) && source.get(key) != null) {
                target.put(key, source.get(key));
            }
        }
    }

    private String mapSqlType(int sqlType) {
        switch (sqlType) {
            case java.sql.Types.VARCHAR:
            case java.sql.Types.CHAR:
            case java.sql.Types.LONGVARCHAR:
            case java.sql.Types.CLOB:
                return "string";
            case java.sql.Types.INTEGER:
            case java.sql.Types.BIGINT:
            case java.sql.Types.SMALLINT:
            case java.sql.Types.TINYINT:
                return "integer";
            case java.sql.Types.DECIMAL:
            case java.sql.Types.DOUBLE:
            case java.sql.Types.FLOAT:
            case java.sql.Types.NUMERIC:
            case java.sql.Types.REAL:
                return "number";
            case java.sql.Types.DATE:
            case java.sql.Types.TIMESTAMP:
            case java.sql.Types.TIME:
            case java.sql.Types.TIMESTAMP_WITH_TIMEZONE:
                return "datetime";
            case java.sql.Types.BOOLEAN:
            case java.sql.Types.BIT:
                return "boolean";
            default:
                return "string";
        }
    }

    public Map<String, Object> getQueryConfig(String queryCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("queryCode", queryCode);
        return jdbcTemplate.queryForObject(
            """
            SELECT query_code as "queryCode",
                   anchor_entity as "anchorEntity",
                   sql_text as "sqlText",
                   count_sql_text as "countSqlText",
                   COALESCE(query_mode, 'rawSql') as "queryMode",
                   data_source_code as "dataSourceCode"
            FROM lc_query_model WHERE query_code = :queryCode
            """,
            params,
            (rs, rowNum) -> {
                Map<String, Object> map = new HashMap<>();
                map.put("queryCode", rs.getString("queryCode"));
                map.put("anchorEntity", rs.getString("anchorEntity"));
                map.put("sqlText", rs.getString("sqlText"));
                map.put("countSqlText", rs.getString("countSqlText"));
                map.put("queryMode", rs.getString("queryMode"));
                map.put("dataSourceCode", rs.getString("dataSourceCode"));
                return map;
            }
        );
    }

    public void updateQueryConfig(String queryCode, String sqlText) {
        updateQueryConfig(queryCode, sqlText, null);
    }

    public void updateQueryConfig(String queryCode, String sqlText, String countSqlText) {
        Map<String, Object> existingParams = Map.of("queryCode", queryCode);
        String queryMode = jdbcTemplate.queryForObject(
                "SELECT COALESCE(query_mode, 'rawSql') FROM lc_query_model WHERE query_code = :queryCode",
                existingParams,
                String.class
        );
        configValidationService.validateSqlAsset(queryCode, sqlText, queryMode);
        configValidationService.validateCountSql(countSqlText);
        Map<String, Object> params = new HashMap<>();
        params.put("queryCode", queryCode);
        params.put("sqlText", sqlText);
        params.put("countSqlText", countSqlText == null || countSqlText.isBlank() ? null : countSqlText);
        jdbcTemplate.update(
            "UPDATE lc_query_model SET sql_text = :sqlText, count_sql_text = :countSqlText WHERE query_code = :queryCode",
            params
        );
    }

    public Map<String, Object> introspectQuery(String queryCode) {
        Map<String, Object> queryConfig = getQueryConfig(queryCode);
        String sqlText = queryConfig.get("sqlText") == null ? null : String.valueOf(queryConfig.get("sqlText"));
        String anchorEntity = queryConfig.get("anchorEntity") == null ? null : String.valueOf(queryConfig.get("anchorEntity"));

        if (sqlText == null || sqlText.trim().isEmpty()) {
            Map<String, Object> response = new HashMap<>();
            response.put("valid", false);
            response.put("error", "SQL is empty");
            return response;
        }

        try {
            Map<String, Object> sqlParams = buildNullParams(sqlText);
            NamedParameterJdbcTemplate bizJdbc = jdbcDataSourceRegistry.resolveForQuery(null, queryCode);
            List<Map<String, Object>> columns = inspectQueryColumns(bizJdbc, sqlText, anchorEntity, sqlParams);
            Map<String, Object> entityConfig = loadAnchorEntity(anchorEntity);
            String tableName = entityConfig.get("tableName") == null ? null : String.valueOf(entityConfig.get("tableName"));
            String primaryKey = entityConfig.get("primaryKey") == null ? pageService.inferPrimaryKey(tableName) : String.valueOf(entityConfig.get("primaryKey"));
            List<Map<String, Object>> entityFields = buildSuggestedEntityFields(entityConfig, columns);

            Map<String, Object> response = new HashMap<>();
            response.put("valid", true);
            response.put("columns", columns);
            response.put("entityFields", entityFields);
            response.put("pageConfig", buildSuggestedPageConfig(queryCode, columns));
            response.put("primaryKey", primaryKey);
            response.put("tableName", tableName);
            return response;
        } catch (Exception e) {
            Map<String, Object> response = new HashMap<>();
            response.put("valid", false);
            response.put("error", e.getMessage());
            return response;
        }
    }

    private Map<String, Object> buildSuggestedPageConfig(String queryCode, List<Map<String, Object>> columns) {
        List<Map<String, Object>> suggestedColumns = new ArrayList<>();
        List<Map<String, Object>> suggestedFilters = new ArrayList<>();

        for (Map<String, Object> column : columns) {
            Map<String, Object> columnConfig = new LinkedHashMap<>();
            columnConfig.put("field", column.get("field"));
            columnConfig.put("label", column.get("label"));
            if (column.get("format") != null) {
                columnConfig.put("format", column.get("format"));
            }
            suggestedColumns.add(columnConfig);

            String type = column.get("type") == null ? "string" : String.valueOf(column.get("type"));
            if (suggestedFilters.size() < 4 && !"boolean".equals(type)) {
                Map<String, Object> filter = new LinkedHashMap<>();
                filter.put("field", column.get("field"));
                filter.put("label", column.get("label"));
                filter.put("type", "datetime".equals(type) ? "date" : "text");
                suggestedFilters.add(filter);
            }
        }

        Map<String, Object> pageConfig = new LinkedHashMap<>();
        pageConfig.put("dataSource", Map.of(
                "queryCode", queryCode,
                "pageSize", 20,
                "pageSizeOptions", List.of(20, 50, 100)
        ));
        pageConfig.put("table", Map.of(
                "columns", suggestedColumns,
                "filters", suggestedFilters,
                "actions", List.of(
                        Map.of("code", "refresh_grid", "label", "Refresh", "dsl", "grid.refresh", "scope", "page", "variant", "primary"),
                        Map.of("code", "export_grid", "label", "Export CSV", "dsl", "grid.exportCsv", "scope", "page", "variant", "secondary")
                )
        ));
        pageConfig.put("features", Map.of(
                "pagination", true,
                "create", true,
                "edit", true,
                "delete", true,
                "export", true,
                "density", "comfortable"
        ));
        return pageConfig;
    }

    private List<Map<String, Object>> buildSuggestedEntityFields(Map<String, Object> entityConfig, List<Map<String, Object>> queryColumns) {
        List<Map<String, Object>> resolvedFields =
                entityConfig.get("entityCode") == null
                        ? new ArrayList<>()
                        : pageService.resolveEntityFields(String.valueOf(entityConfig.get("entityCode")));

        Map<String, Map<String, Object>> byField = new LinkedHashMap<>();
        for (Map<String, Object> field : resolvedFields) {
            String fieldName = field.get("field") == null ? null : String.valueOf(field.get("field"));
            if (fieldName == null || fieldName.isEmpty()) {
                continue;
            }
            Map<String, Object> suggested = new LinkedHashMap<>();
            suggested.put("field", fieldName);
            suggested.put("label", field.getOrDefault("label", fieldName));
            copyOptionalFieldConfig(field, suggested);
            byField.put(fieldName, suggested);
        }

        for (Map<String, Object> column : queryColumns) {
            String fieldName = column.get("field") == null ? null : String.valueOf(column.get("field"));
            if (fieldName == null || byField.containsKey(fieldName)) {
                continue;
            }
            Map<String, Object> suggested = new LinkedHashMap<>();
            suggested.put("field", fieldName);
            suggested.put("label", column.getOrDefault("label", fieldName));
            if (column.get("format") != null) {
                suggested.put("format", column.get("format"));
            }
            byField.put(fieldName, suggested);
        }

        return new ArrayList<>(byField.values());
    }

    private void copyOptionalFieldConfig(Map<String, Object> source, Map<String, Object> target) {
        for (String key : List.of("format", "tone", "width", "align", "hidden", "readonly", "placeholder")) {
            if (source.containsKey(key) && source.get(key) != null) {
                target.put(key, source.get(key));
            }
        }
    }

    private Map<String, Object> loadAnchorEntity(String anchorEntity) {
        if (anchorEntity == null || anchorEntity.trim().isEmpty()) {
            return new HashMap<>();
        }
        try {
            return pageService.getEntityConfig(anchorEntity);
        } catch (Exception ignore) {
            return new HashMap<>();
        }
    }

    private Map<String, Object> buildNullParams(String sqlText) {
        Set<String> paramNames = new LinkedHashSet<>();
        java.util.regex.Matcher matcher = Pattern.compile("(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)").matcher(sqlText);
        while (matcher.find()) {
            paramNames.add(matcher.group(1));
        }

        Map<String, Object> params = new HashMap<>();
        for (String paramName : paramNames) {
            params.put(paramName, null);
        }
        return params;
    }

    private List<Map<String, Object>> inspectQueryColumns(
            NamedParameterJdbcTemplate bizJdbc,
            String sqlText,
            String anchorEntity,
            Map<String, Object> sqlParams
    ) {
        String inspectSql = "SELECT * FROM (" + sqlText + ") as inspect_query LIMIT 0";
        Map<String, List<Map<String, Object>>> entityFieldsMap = loadEntityFieldsMap();
        return bizJdbc.query(inspectSql, sqlParams, rs -> {
            ResultSetMetaData metaData = rs.getMetaData();
            List<Map<String, Object>> columns = new ArrayList<>();
            for (int i = 1; i <= metaData.getColumnCount(); i++) {
                String columnLabel = metaData.getColumnLabel(i);
                String columnName = metaData.getColumnName(i);
                String tableName = metaData.getTableName(i);
                int sqlType = metaData.getColumnType(i);
                columns.add(resolveColumnMeta(columnLabel, columnName, tableName, anchorEntity, sqlType, entityFieldsMap));
            }
            return columns;
        });
    }

    public List<Map<String, Object>> executeOptionsQuery(String queryCode, String labelField, String valueField) {
        Map<String, Object> modelParams = new HashMap<>();
        modelParams.put("queryCode", queryCode);

        Map<String, Object> queryModel = jdbcTemplate.queryForMap(
            "SELECT sql_text FROM lc_query_model WHERE query_code = :queryCode",
            modelParams
        );
        String sqlText = (String) queryModel.get("sql_text");
        Map<String, Object> sqlParams = buildNullParams(sqlText);
        NamedParameterJdbcTemplate bizJdbc = jdbcDataSourceRegistry.resolveForQuery(null, queryCode);

        List<Map<String, Object>> rawRows = bizJdbc.queryForList(sqlText, sqlParams);
        List<Map<String, Object>> options = new ArrayList<>();
        for (Map<String, Object> row : rawRows) {
            Map<String, Object> option = new LinkedHashMap<>();
            Object rawLabel = row.get(labelField);
            Object rawValue = row.get(valueField);
            
            if (rawLabel == null) {
                rawLabel = row.get(labelField.toLowerCase());
            }
            if (rawValue == null) {
                rawValue = row.get(valueField.toLowerCase());
            }
            
            option.put("label", rawLabel != null ? String.valueOf(rawLabel) : "");
            option.put("value", rawValue != null ? String.valueOf(rawValue) : "");
            options.add(option);
        }
        return options;
    }

    public List<Map<String, Object>> executeSuggestQuery(
            String queryCode, String labelField, String valueField, 
            String keyword, String keywordParam) {
        Map<String, Object> modelParams = new HashMap<>();
        modelParams.put("queryCode", queryCode);
        
        Map<String, Object> queryModel = jdbcTemplate.queryForMap(
            "SELECT sql_text FROM lc_query_model WHERE query_code = :queryCode",
            modelParams
        );
        String sqlText = (String) queryModel.get("sql_text");
        Map<String, Object> sqlParams = buildNullParams(sqlText);
        NamedParameterJdbcTemplate bizJdbc = jdbcDataSourceRegistry.resolveForQuery(null, queryCode);

        String paramKey = (keywordParam != null && !keywordParam.trim().isEmpty()) ? keywordParam : "keyword";
        sqlParams.put(paramKey, "%" + keyword + "%");

        List<Map<String, Object>> rawRows = bizJdbc.queryForList(sqlText, sqlParams);
        List<Map<String, Object>> options = new ArrayList<>();
        for (Map<String, Object> row : rawRows) {
            Map<String, Object> option = new LinkedHashMap<>();
            Object rawLabel = row.get(labelField);
            Object rawValue = row.get(valueField);
            
            if (rawLabel == null) {
                rawLabel = row.get(labelField.toLowerCase());
            }
            if (rawValue == null) {
                rawValue = row.get(valueField.toLowerCase());
            }
            
            option.put("label", rawLabel != null ? String.valueOf(rawLabel) : "");
            option.put("value", rawValue != null ? String.valueOf(rawValue) : "");
            options.add(option);
        }
        return options;
    }

    public void executeRawSql(String sql) {
        if (sql == null || sql.trim().isEmpty()) {
            throw new IllegalArgumentException("SQL is required");
        }

        jdbcTemplate.getJdbcOperations().execute((ConnectionCallback<Void>) connection -> {
            try (Statement statement = connection.createStatement()) {
                statement.setQueryTimeout(RAW_SQL_TIMEOUT_SECONDS);
                statement.execute(sql.trim());
            }
            return null;
        });
    }
}
