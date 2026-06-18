package com.example.lowcode.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class QueryEngineService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    public List<Map<String, Object>> executeSql(String queryCode, Map<String, Object> requestParams) {
        Map<String, Object> modelParams = new HashMap<>();
        modelParams.put("queryCode", queryCode);
        
        Map<String, Object> queryModel = jdbcTemplate.queryForMap(
            "SELECT sql_text FROM lc_query_model WHERE query_code = :queryCode",
            modelParams
        );
        
        String sqlText = (String) queryModel.get("sql_text");
        
        long start = System.currentTimeMillis();
        boolean success = false;
        String errMsg = null;
        List<Map<String, Object>> rows = null;
        try {
            rows = jdbcTemplate.queryForList(sqlText, requestParams);
            success = true;
            return rows;
        } catch (Exception e) {
            errMsg = e.getMessage();
            throw e;
        } finally {
            long duration = System.currentTimeMillis() - start;
            // Write audit query log
            Map<String, Object> logParams = new HashMap<>();
            logParams.put("queryCode", queryCode);
            logParams.put("success", success);
            logParams.put("duration", (int) duration);
            logParams.put("errMsg", errMsg);
            // We can serialize params to JSON in a real app, here we just insert basic info
            jdbcTemplate.update(
                "INSERT INTO lc_query_log(query_code, success, duration_ms, error_message) VALUES (:queryCode, :success, :duration, :errMsg)",
                logParams
            );
        }
    }
}
