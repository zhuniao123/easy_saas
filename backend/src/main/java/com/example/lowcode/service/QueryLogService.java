package com.example.lowcode.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

@Service
public class QueryLogService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String queryCode, boolean success, int durationMs, String errorMessage) {
        record(queryCode, null, success, durationMs, errorMessage);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String queryCode, String dsCode, boolean success, int durationMs, String errorMessage) {
        Map<String, Object> params = new HashMap<>();
        params.put("queryCode", queryCode);
        params.put("dsCode", dsCode);
        params.put("success", success);
        params.put("duration", durationMs);
        params.put("errMsg", errorMessage);
        try {
            jdbcTemplate.update(
                    "INSERT INTO lc_query_log(query_code, ds_code, success, duration_ms, error_message) " +
                            "VALUES (:queryCode, :dsCode, :success, :duration, :errMsg)",
                    params
            );
        } catch (Exception fallback) {
            // Older DBs without ds_code column
            jdbcTemplate.update(
                    "INSERT INTO lc_query_log(query_code, success, duration_ms, error_message) " +
                            "VALUES (:queryCode, :success, :duration, :errMsg)",
                    params
            );
        }
    }
}
