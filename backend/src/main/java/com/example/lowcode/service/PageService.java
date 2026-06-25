package com.example.lowcode.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;

@Service
public class PageService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

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
            "SELECT entity_code as \"entityCode\", table_name as \"tableName\", fields_json::text as \"fieldsJson\" FROM lc_entity_model WHERE entity_code = :entityCode",
            params,
            (rs, rowNum) -> {
                Map<String, Object> map = new HashMap<>();
                map.put("entityCode", rs.getString("entityCode"));
                map.put("tableName", rs.getString("tableName"));
                map.put("fieldsJson", rs.getString("fieldsJson"));
                return map;
            }
        );
    }

    public void updateEntityConfig(String entityCode, String fieldsJsonStr) {
        Map<String, Object> params = new HashMap<>();
        params.put("entityCode", entityCode);
        params.put("fieldsJson", fieldsJsonStr);
        jdbcTemplate.update(
            "UPDATE lc_entity_model SET fields_json = :fieldsJson::jsonb WHERE entity_code = :entityCode",
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
        String entityCode = pageCode + "_entity";
        String queryCode = "q_" + pageCode;
        
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
        pageParams.put("configJson", "{\"columns\":[],\"filters\":[],\"actions\":[]}");
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
        Map<String, Object> page = getPageConfig(pageCode);
        String entityCode = (String) page.get("entityCode");
        Map<String, Object> entity = getEntityConfig(entityCode);
        String tableName = (String) entity.get("tableName");

        StringBuilder sql = new StringBuilder("INSERT INTO ");
        sql.append("\"").append(tableName).append("\" (");
        StringBuilder vals = new StringBuilder(" VALUES (");

        Map<String, Object> params = new HashMap<>();
        int i = 0;
        for (Map.Entry<String, Object> entry : rowData.entrySet()) {
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
        sql.append(")").append(vals).append(")");

        jdbcTemplate.update(sql.toString(), params);
    }

    public void updateRow(String pageCode, Object id, Map<String, Object> rowData) {
        Map<String, Object> page = getPageConfig(pageCode);
        String entityCode = (String) page.get("entityCode");
        Map<String, Object> entity = getEntityConfig(entityCode);
        String tableName = (String) entity.get("tableName");
        String primaryKey = "id"; // default

        StringBuilder sql = new StringBuilder("UPDATE ");
        sql.append("\"").append(tableName).append("\" SET ");

        Map<String, Object> params = new HashMap<>();
        params.put("__id", id);

        int i = 0;
        for (Map.Entry<String, Object> entry : rowData.entrySet()) {
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
        sql.append(" WHERE \"").append(primaryKey).append("\" = :__id");

        jdbcTemplate.update(sql.toString(), params);
    }

    public void deleteRow(String pageCode, Object id) {
        Map<String, Object> page = getPageConfig(pageCode);
        String entityCode = (String) page.get("entityCode");
        Map<String, Object> entity = getEntityConfig(entityCode);
        String tableName = (String) entity.get("tableName");
        String primaryKey = "id"; // default

        String sql = "DELETE FROM \"" + tableName + "\" WHERE \"" + primaryKey + "\" = :__id";
        Map<String, Object> params = new HashMap<>();
        params.put("__id", id);

        jdbcTemplate.update(sql, params);
    }
}
