package com.example.lowcode.service;

import com.example.lowcode.interceptor.IGroovyActionInterceptor;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSetMetaData;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class QueryEngineService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private GroovyScriptService groovyScriptService;

    public Map<String, Object> executeSql(String queryCode, Map<String, Object> requestParams) {
        Map<String, Object> modelParams = new HashMap<>();
        modelParams.put("queryCode", queryCode);
        
        Map<String, Object> queryModel = jdbcTemplate.queryForMap(
            "SELECT sql_text, groovy_script_code, anchor_entity FROM lc_query_model WHERE query_code = :queryCode",
            modelParams
        );
        
        String sqlText = (String) queryModel.get("sql_text");
        String groovyCode = (String) queryModel.get("groovy_script_code");
        String anchorEntity = (String) queryModel.get("anchor_entity");

        IGroovyActionInterceptor interceptor = groovyScriptService.getInterceptor(groovyCode);
        
        if (interceptor != null) {
            interceptor.beforeQuery(requestParams);
        }

        long start = System.currentTimeMillis();
        boolean success = false;
        String errMsg = null;
        Map<String, Object> result = null;
        try {
            result = jdbcTemplate.query(sqlText, requestParams, rs -> {
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
            success = true;
        } catch (Exception e) {
            errMsg = e.getMessage();
            throw e;
        } finally {
            long duration = System.currentTimeMillis() - start;
            Map<String, Object> logParams = new HashMap<>();
            logParams.put("queryCode", queryCode);
            logParams.put("success", success);
            logParams.put("duration", (int) duration);
            logParams.put("errMsg", errMsg);
            jdbcTemplate.update(
                "INSERT INTO lc_query_log(query_code, success, duration_ms, error_message) VALUES (:queryCode, :success, :duration, :errMsg)",
                logParams
            );
        }

        if (interceptor != null && result != null) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> processedRows = interceptor.afterQuery((List<Map<String, Object>>) result.get("rows"));
            result.put("rows", processedRows);
        }

        return result;
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
                    meta.put("label", fieldDef.get("label"));
                    meta.put("type", fieldDef.get("type"));
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
                    meta.put("label", fieldDef.get("label"));
                    meta.put("type", fieldDef.get("type"));
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
            "SELECT query_code as \"queryCode\", anchor_entity as \"anchorEntity\", sql_text as \"sqlText\" FROM lc_query_model WHERE query_code = :queryCode",
            params,
            (rs, rowNum) -> {
                Map<String, Object> map = new HashMap<>();
                map.put("queryCode", rs.getString("queryCode"));
                map.put("anchorEntity", rs.getString("anchorEntity"));
                map.put("sqlText", rs.getString("sqlText"));
                return map;
            }
        );
    }

    public void updateQueryConfig(String queryCode, String sqlText) {
        Map<String, Object> params = new HashMap<>();
        params.put("queryCode", queryCode);
        params.put("sqlText", sqlText);
        jdbcTemplate.update(
            "UPDATE lc_query_model SET sql_text = :sqlText WHERE query_code = :queryCode",
            params
        );
    }

    public void executeRawSql(String sql) {
        jdbcTemplate.getJdbcOperations().execute(sql);
    }
}

