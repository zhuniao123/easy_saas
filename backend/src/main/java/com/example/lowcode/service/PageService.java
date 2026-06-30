package com.example.lowcode.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class PageService {
    private static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private ObjectMapper objectMapper;

    private String requireSafeIdentifier(String value, String fieldName) {
        if (value == null || !SAFE_IDENTIFIER.matcher(value).matches()) {
            throw new IllegalArgumentException(fieldName + " must be a safe SQL identifier");
        }
        return value;
    }

    public Map<String, Object> getPageConfig(String pageCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("pageCode", pageCode);
        return jdbcTemplate.queryForObject(
            "SELECT page_code as \"pageCode\", title, route_path as \"routePath\", query_code as \"queryCode\", entity_code as \"entityCode\", config_json::text as \"config\" FROM lc_page_model WHERE page_code = :pageCode",
            params,
            (rs, rowNum) -> {
                Map<String, Object> map = new HashMap<>();
                map.put("pageCode", rs.getString("pageCode"));
                map.put("title", rs.getString("title"));
                map.put("routePath", rs.getString("routePath"));
                map.put("queryCode", rs.getString("queryCode"));
                map.put("entityCode", rs.getString("entityCode"));
                map.put("config", rs.getString("config"));
                return map;
            }
        );
    }

    public Map<String, Object> getEntityConfig(String entityCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("entityCode", entityCode);
        return jdbcTemplate.queryForObject(
            "SELECT entity_code as \"entityCode\", table_name as \"tableName\", primary_key as \"primaryKey\", fields_json::text as \"fieldsJson\" FROM lc_entity_model WHERE entity_code = :entityCode",
            params,
            (rs, rowNum) -> {
                Map<String, Object> map = new HashMap<>();
                map.put("entityCode", rs.getString("entityCode"));
                map.put("tableName", rs.getString("tableName"));
                map.put("primaryKey", rs.getString("primaryKey"));
                map.put("fieldsJson", rs.getString("fieldsJson"));
                return map;
            }
        );
    }

    public void updateEntityConfig(String entityCode, String fieldsJsonStr) {
        updateEntityConfig(entityCode, fieldsJsonStr, null);
    }

    public void updateEntityConfig(String entityCode, String fieldsJsonStr, String primaryKey) {
        Map<String, Object> params = new HashMap<>();
        params.put("entityCode", entityCode);
        params.put("fieldsJson", fieldsJsonStr);
        params.put("primaryKey", primaryKey);
        jdbcTemplate.update(
            "UPDATE lc_entity_model SET fields_json = :fieldsJson::jsonb, primary_key = COALESCE(:primaryKey, primary_key) WHERE entity_code = :entityCode",
            params
        );
    }

    public void updatePageConfig(String pageCode, String configJsonStr) {
        Map<String, Object> params = new HashMap<>();
        params.put("pageCode", pageCode);
        params.put("configJson", configJsonStr);
        jdbcTemplate.update(
            "UPDATE lc_page_model SET config_json = :configJson::jsonb WHERE page_code = :pageCode",
            params
        );
    }

    public java.util.List<Map<String, Object>> listPages() {
        return jdbcTemplate.query(
            "SELECT page_code as \"pageCode\", title, route_path as \"routePath\", query_code as \"queryCode\", entity_code as \"entityCode\" FROM lc_page_model ORDER BY page_code",
            new HashMap<>(),
            (rs, rowNum) -> {
                Map<String, Object> map = new HashMap<>();
                map.put("pageCode", rs.getString("pageCode"));
                map.put("title", rs.getString("title"));
                map.put("routePath", rs.getString("routePath"));
                map.put("queryCode", rs.getString("queryCode"));
                map.put("entityCode", rs.getString("entityCode"));
                return map;
            }
        );
    }

    public void createPage(String pageCode, String title, String routePath) {
        requireSafeIdentifier(pageCode, "Page code");
        if (title == null || title.trim().isEmpty()) {
            throw new IllegalArgumentException("Title is required");
        }
        if (routePath == null || routePath.trim().isEmpty()) {
            throw new IllegalArgumentException("Route path is required");
        }

        String entityCode = pageCode + "_entity";
        String queryCode = "q_" + pageCode;
        String defaultPageConfig = """
            {
              "presentation": {
                "title": "%s",
                "description": "SQL-driven workspace generated from page metadata.",
                "badge": "Stage One Grid",
                "emptyState": "No rows yet. Use raw SQL to seed test data or update the query."
              },
              "dataSource": {
                "queryCode": "%s",
                "pageSize": 20,
                "pageSizeOptions": [20, 50, 100]
              },
              "table": {
                "columns": [],
                "filters": [],
                "actions": [
                  { "code": "refresh_grid", "label": "Refresh", "dsl": "grid.refresh", "scope": "page", "variant": "primary" },
                  { "code": "export_grid", "label": "Export CSV", "dsl": "grid.exportCsv", "scope": "page", "variant": "secondary" }
                ]
              },
              "features": {
                "pagination": true,
                "create": true,
                "edit": true,
                "delete": true,
                "export": true,
                "density": "comfortable"
              }
            }
            """.formatted(title.replace("\"", "\\\""), queryCode);
        
        // 1. Insert entity
        Map<String, Object> entityParams = new HashMap<>();
        entityParams.put("entityCode", entityCode);
        entityParams.put("tableName", pageCode);
        entityParams.put("fieldsJson", "[]");
        jdbcTemplate.update(
            "INSERT INTO lc_entity_model (entity_code, table_name, fields_json) VALUES (:entityCode, :tableName, :fieldsJson::jsonb) ON CONFLICT (entity_code) DO NOTHING",
            entityParams
        );
        
        // 2. Insert query
        Map<String, Object> queryParams = new HashMap<>();
        queryParams.put("queryCode", queryCode);
        queryParams.put("entityCode", entityCode);
        queryParams.put("sqlText", "SELECT 1 as val");
        jdbcTemplate.update(
            "INSERT INTO lc_query_model (query_code, anchor_entity, sql_text) VALUES (:queryCode, :entityCode, :sqlText) ON CONFLICT (query_code) DO NOTHING",
            queryParams
        );
        
        // 3. Insert page
        Map<String, Object> pageParams = new HashMap<>();
        pageParams.put("pageCode", pageCode);
        pageParams.put("title", title);
        pageParams.put("routePath", routePath);
        pageParams.put("queryCode", queryCode);
        pageParams.put("entityCode", entityCode);
        pageParams.put("configJson", defaultPageConfig);
        jdbcTemplate.update(
            "INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES (:pageCode, :title, :routePath, :queryCode, :entityCode, :configJson::jsonb) ON CONFLICT (page_code) DO NOTHING",
            pageParams
        );
    }

    public void deletePage(String pageCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("pageCode", pageCode);
        
        // Fetch queryCode and entityCode first
        Map<String, Object> page = jdbcTemplate.queryForMap(
            "SELECT query_code, entity_code FROM lc_page_model WHERE page_code = :pageCode",
            params
        );
        String queryCode = (String) page.get("query_code");
        String entityCode = (String) page.get("entity_code");
        
        // Delete page
        jdbcTemplate.update("DELETE FROM lc_page_model WHERE page_code = :pageCode", params);
        
        // Delete query
        if (queryCode != null) {
            Map<String, Object> qParams = new HashMap<>();
            qParams.put("queryCode", queryCode);
            jdbcTemplate.update("DELETE FROM lc_query_model WHERE query_code = :queryCode", qParams);
        }
        
        // Delete entity
        if (entityCode != null) {
            Map<String, Object> eParams = new HashMap<>();
            eParams.put("entityCode", entityCode);
            jdbcTemplate.update("DELETE FROM lc_entity_model WHERE entity_code = :entityCode", eParams);
        }
    }

    public void insertRow(String pageCode, Map<String, Object> rowData) {
        Map<String, Object> entity = resolveEntity(pageCode);
        String tableName = requireSafeIdentifier((String) entity.get("tableName"), "Table name");
        String primaryKey = requireSafeIdentifier((String) entity.get("primaryKey"), "Primary key");
        Map<String, Object> sanitizedRowData = sanitizeRowData(rowData, primaryKey, true);

        StringBuilder sql = new StringBuilder("INSERT INTO ");
        sql.append("\"").append(tableName).append("\" (");
        StringBuilder vals = new StringBuilder(" VALUES (");

        Map<String, Object> params = new HashMap<>();
        int i = 0;
        for (Map.Entry<String, Object> entry : sanitizedRowData.entrySet()) {
            String key = entry.getKey();
            if (!key.matches("^[a-zA-Z0-9_]+$")) continue;

            if (i > 0) {
                sql.append(", ");
                vals.append(", ");
            }
            sql.append("\"").append(key).append("\"");
            vals.append(":").append(key);
            params.put(key, entry.getValue());
            i++;
        }
        if (params.isEmpty()) {
            throw new IllegalArgumentException("No valid columns were provided");
        }
        sql.append(")").append(vals).append(")");

        jdbcTemplate.update(sql.toString(), params);
    }

    public void updateRow(String pageCode, Object id, Map<String, Object> rowData) {
        Map<String, Object> entity = resolveEntity(pageCode);
        String tableName = requireSafeIdentifier((String) entity.get("tableName"), "Table name");
        String primaryKey = requireSafeIdentifier((String) entity.get("primaryKey"), "Primary key");
        Map<String, Object> sanitizedRowData = sanitizeRowData(rowData, primaryKey, false);

        StringBuilder sql = new StringBuilder("UPDATE ");
        sql.append("\"").append(tableName).append("\" SET ");

        Map<String, Object> params = new HashMap<>();
        params.put("__id", id);

        int i = 0;
        for (Map.Entry<String, Object> entry : sanitizedRowData.entrySet()) {
            String key = entry.getKey();
            if (key.equals(primaryKey)) continue;
            if (!key.matches("^[a-zA-Z0-9_]+$")) continue;

            if (i > 0) {
                sql.append(", ");
            }
            sql.append("\"").append(key).append("\" = :").append(key);
            params.put(key, entry.getValue());
            i++;
        }
        if (i == 0) {
            throw new IllegalArgumentException("No updatable columns were provided");
        }
        sql.append(" WHERE \"").append(primaryKey).append("\" = :__id");

        jdbcTemplate.update(sql.toString(), params);
    }

    public void deleteRow(String pageCode, Object id) {
        Map<String, Object> entity = resolveEntity(pageCode);
        String tableName = requireSafeIdentifier((String) entity.get("tableName"), "Table name");
        String primaryKey = requireSafeIdentifier((String) entity.get("primaryKey"), "Primary key");

        String sql = "DELETE FROM \"" + tableName + "\" WHERE \"" + primaryKey + "\" = :__id";
        Map<String, Object> params = new HashMap<>();
        params.put("__id", id);

        jdbcTemplate.update(sql, params);
    }

    private Map<String, Object> resolveEntity(String pageCode) {
        Map<String, Object> page = getPageConfig(pageCode);
        String entityCode = (String) page.get("entityCode");
        Map<String, Object> entity = getEntityConfig(entityCode);
        if (entity.get("primaryKey") == null || String.valueOf(entity.get("primaryKey")).trim().isEmpty()) {
            String inferredPrimaryKey = inferPrimaryKey((String) entity.get("tableName"));
            entity.put("primaryKey", inferredPrimaryKey != null ? inferredPrimaryKey : "id");
        }
        return entity;
    }

    public List<Map<String, Object>> resolveEntityFields(String entityCode) {
        return resolveEntityFields(getEntityConfig(entityCode));
    }

    public List<Map<String, Object>> resolveEntityFields(Map<String, Object> entityConfig) {
        String tableName = entityConfig.get("tableName") == null ? null : String.valueOf(entityConfig.get("tableName"));
        String fieldsJsonStr = entityConfig.get("fieldsJson") == null ? "[]" : String.valueOf(entityConfig.get("fieldsJson"));

        List<Map<String, Object>> schemaFields = loadSchemaFields(tableName);
        Map<String, Map<String, Object>> overrideByField = new LinkedHashMap<>();
        for (Map<String, Object> field : parseFieldOverrides(fieldsJsonStr)) {
            String fieldName = field.get("field") == null ? null : String.valueOf(field.get("field"));
            if (fieldName == null || fieldName.trim().isEmpty()) {
                continue;
            }
            overrideByField.put(fieldName, field);
        }

        List<Map<String, Object>> merged = new ArrayList<>();
        for (Map<String, Object> schemaField : schemaFields) {
            String fieldName = String.valueOf(schemaField.get("field"));
            Map<String, Object> mergedField = new LinkedHashMap<>(schemaField);
            Map<String, Object> override = overrideByField.remove(fieldName);
            if (override != null) {
                mergeFieldOverrides(mergedField, override);
            }
            merged.add(mergedField);
        }

        for (Map<String, Object> override : overrideByField.values()) {
            Map<String, Object> mergedField = new LinkedHashMap<>();
            mergedField.put("field", override.get("field"));
            mergedField.put("label", override.getOrDefault("label", override.get("field")));
            mergedField.put("type", override.getOrDefault("type", "string"));
            mergeFieldOverrides(mergedField, override);
            merged.add(mergedField);
        }

        return merged;
    }

    public String inferPrimaryKey(String tableName) {
        if (tableName == null || tableName.trim().isEmpty()) {
            return null;
        }

        return jdbcTemplate.getJdbcOperations().execute((ConnectionCallback<String>) connection -> {
            DatabaseMetaData metaData = connection.getMetaData();
            try (ResultSet rs = metaData.getPrimaryKeys(null, null, tableName)) {
                if (rs.next()) {
                    return rs.getString("COLUMN_NAME");
                }
            }
            return null;
        });
    }

    private List<Map<String, Object>> loadSchemaFields(String tableName) {
        if (tableName == null || tableName.trim().isEmpty()) {
            return new ArrayList<>();
        }

        String primaryKey = inferPrimaryKey(tableName);
        Map<String, Object> params = new HashMap<>();
        params.put("tableName", tableName);
        return jdbcTemplate.query(
            """
            SELECT column_name, data_type, ordinal_position
            FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = :tableName
            ORDER BY ordinal_position
            """,
            params,
            (rs, rowNum) -> {
                Map<String, Object> field = new LinkedHashMap<>();
                String columnName = rs.getString("column_name");
                field.put("field", columnName);
                field.put("label", toDisplayLabel(columnName));
                field.put("type", mapInformationSchemaType(rs.getString("data_type")));
                if (primaryKey != null && primaryKey.equalsIgnoreCase(columnName)) {
                    field.put("primary", true);
                }
                return field;
            }
        );
    }

    private List<Map<String, Object>> parseFieldOverrides(String fieldsJsonStr) {
        try {
            return objectMapper.readValue(fieldsJsonStr, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception ignore) {
            return new ArrayList<>();
        }
    }

    private void mergeFieldOverrides(Map<String, Object> target, Map<String, Object> override) {
        for (String key : List.of("label", "type", "width", "align", "hidden", "format", "tone", "placeholder", "readonly", "primary")) {
            if (override.containsKey(key) && override.get(key) != null) {
                target.put(key, override.get(key));
            }
        }
    }

    private String toDisplayLabel(String columnName) {
        if (columnName == null || columnName.trim().isEmpty()) {
            return "";
        }

        String[] parts = columnName.split("_");
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append(' ');
            }
            builder.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                builder.append(part.substring(1));
            }
        }
        return builder.toString();
    }

    private String mapInformationSchemaType(String dataType) {
        if (dataType == null) {
            return "string";
        }

        String normalized = dataType.toLowerCase();
        return switch (normalized) {
            case "smallint", "integer", "bigint" -> "integer";
            case "numeric", "decimal", "real", "double precision" -> "number";
            case "boolean" -> "boolean";
            case "date", "timestamp without time zone", "timestamp with time zone", "time without time zone", "time with time zone" -> "datetime";
            default -> "string";
        };
    }

    private Map<String, Object> sanitizeRowData(Map<String, Object> rowData, String primaryKey, boolean omitBlankPrimaryKey) {
        Map<String, Object> sanitized = new HashMap<>();
        if (rowData == null) {
            return sanitized;
        }

        for (Map.Entry<String, Object> entry : rowData.entrySet()) {
            String key = entry.getKey();
            if (key == null || !key.matches("^[a-zA-Z0-9_]+$")) {
                continue;
            }

            Object value = entry.getValue();
            if (omitBlankPrimaryKey && key.equals(primaryKey) && value instanceof String && ((String) value).trim().isEmpty()) {
                continue;
            }
            sanitized.put(key, value);
        }
        return sanitized;
    }
}
