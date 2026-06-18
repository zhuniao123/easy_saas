package com.example.lowcode.service;

import com.example.lowcode.interceptor.IGroovyActionInterceptor;
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
    @Autowired
    private GroovyScriptService groovyScriptService;

    public List<Map<String, Object>> executeSql(String queryCode, Map<String, Object> requestParams) {
        Map<String, Object> modelParams = new HashMap<>();
        modelParams.put("queryCode", queryCode);
        
        Map<String, Object> queryModel = jdbcTemplate.queryForMap(
            "SELECT sql_text, groovy_script_code FROM lc_query_model WHERE query_code = :queryCode",
            modelParams
        );
        
        String sqlText = (String) queryModel.get("sql_text");
        String groovyCode = (String) queryModel.get("groovy_script_code");

        IGroovyActionInterceptor interceptor = groovyScriptService.getInterceptor(groovyCode);
        
        if (interceptor != null) {
            interceptor.beforeQuery(requestParams);
        }

        long start = System.currentTimeMillis();
        boolean success = false;
        String errMsg = null;
        List<Map<String, Object>> rows = null;
        try {
            rows = jdbcTemplate.queryForList(sqlText, requestParams);
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

        if (interceptor != null) {
            rows = interceptor.afterQuery(rows);
        }

        return rows;
    }
}
