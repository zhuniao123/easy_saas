package com.example.lowcode.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ErrorLogService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private ObjectMapper objectMapper;

    public void log(
            String source,
            String path,
            String method,
            String errorType,
            String message,
            Throwable ex,
            Object requestPayload
    ) {
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("source", source == null ? "api" : source);
            params.put("path", path);
            params.put("method", method);
            params.put("errorType", errorType);
            params.put("message", message);
            params.put("stack", stackTrace(ex));
            String reqJson = "{}";
            if (requestPayload != null) {
                try {
                    reqJson = objectMapper.writeValueAsString(requestPayload);
                } catch (Exception ignore) {
                    reqJson = "{\"raw\":\"" + String.valueOf(requestPayload).replace("\"", "'") + "\"}";
                }
            }
            params.put("requestJson", reqJson);
            jdbcTemplate.update(
                    """
                    INSERT INTO lc_error_log(source, path, http_method, error_type, message, stack_trace, request_json)
                    VALUES (:source, :path, :method, :errorType, :message, :stack, :requestJson::jsonb)
                    """,
                    params
            );
        } catch (Exception ignore) {
            // never break primary flow
        }
    }

    public List<Map<String, Object>> recent(int limit) {
        int safe = Math.max(1, Math.min(200, limit));
        Map<String, Object> params = new HashMap<>();
        params.put("limit", safe);
        return jdbcTemplate.query(
                """
                SELECT id, source, path, http_method AS "httpMethod", error_type AS "errorType",
                       message, created_at AS "createdAt"
                FROM lc_error_log
                ORDER BY id DESC
                LIMIT :limit
                """,
                params,
                (rs, rowNum) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("source", rs.getString("source"));
                    m.put("path", rs.getString("path"));
                    m.put("httpMethod", rs.getString("httpMethod"));
                    m.put("errorType", rs.getString("errorType"));
                    m.put("message", rs.getString("message"));
                    m.put("createdAt", rs.getTimestamp("createdAt"));
                    return m;
                }
        );
    }

    private String stackTrace(Throwable ex) {
        if (ex == null) {
            return null;
        }
        StringWriter sw = new StringWriter();
        ex.printStackTrace(new PrintWriter(sw));
        String s = sw.toString();
        return s.length() > 8000 ? s.substring(0, 8000) : s;
    }
}
