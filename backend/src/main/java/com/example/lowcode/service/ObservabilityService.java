package com.example.lowcode.service;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-side observability: query/action logs for ops console.
 * Write path stays in QueryLogService / ActionService / ErrorLogService.
 */
@Service
public class ObservabilityService {
    private final NamedParameterJdbcTemplate jdbcTemplate;

    public ObservabilityService(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Map<String, Object>> listQueryLogs(int limit, String queryCode, Boolean successOnly) {
        int safe = Math.max(1, Math.min(500, limit));
        Map<String, Object> p = new HashMap<>();
        p.put("limit", safe);
        StringBuilder sql = new StringBuilder(
                """
                SELECT id, query_code AS "queryCode", ds_code AS "dsCode",
                       success, duration_ms AS "durationMs", error_message AS "errorMessage",
                       created_at AS "createdAt"
                FROM lc_query_log
                WHERE 1=1
                """
        );
        if (queryCode != null && !queryCode.isBlank()) {
            sql.append(" AND query_code = :queryCode ");
            p.put("queryCode", queryCode.trim());
        }
        if (successOnly != null) {
            sql.append(" AND success = :success ");
            p.put("success", successOnly);
        }
        sql.append(" ORDER BY id DESC LIMIT :limit ");
        return jdbcTemplate.query(sql.toString(), p, (rs, i) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("queryCode", rs.getString("queryCode"));
            m.put("dsCode", rs.getString("dsCode"));
            m.put("success", rs.getBoolean("success"));
            m.put("durationMs", rs.getObject("durationMs"));
            m.put("errorMessage", rs.getString("errorMessage"));
            m.put("createdAt", rs.getTimestamp("createdAt"));
            return m;
        });
    }

    public List<Map<String, Object>> listActionLogs(int limit, String actionCode, Boolean successOnly) {
        int safe = Math.max(1, Math.min(500, limit));
        Map<String, Object> p = new HashMap<>();
        p.put("limit", safe);
        StringBuilder sql = new StringBuilder(
                """
                SELECT id, action_code AS "actionCode", page_code AS "pageCode", ds_code AS "dsCode",
                       success, duration_ms AS "durationMs", error_message AS "errorMessage",
                       created_at AS "createdAt"
                FROM lc_action_log
                WHERE 1=1
                """
        );
        if (actionCode != null && !actionCode.isBlank()) {
            sql.append(" AND action_code = :actionCode ");
            p.put("actionCode", actionCode.trim());
        }
        if (successOnly != null) {
            sql.append(" AND success = :success ");
            p.put("success", successOnly);
        }
        sql.append(" ORDER BY id DESC LIMIT :limit ");
        return jdbcTemplate.query(sql.toString(), p, (rs, i) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("actionCode", rs.getString("actionCode"));
            m.put("pageCode", rs.getString("pageCode"));
            m.put("dsCode", rs.getString("dsCode"));
            m.put("success", rs.getBoolean("success"));
            m.put("durationMs", rs.getObject("durationMs"));
            m.put("errorMessage", rs.getString("errorMessage"));
            m.put("createdAt", rs.getTimestamp("createdAt"));
            return m;
        });
    }

    public List<Map<String, Object>> slowQueries(int limit, int minDurationMs) {
        int safe = Math.max(1, Math.min(200, limit));
        int minMs = Math.max(0, minDurationMs);
        return jdbcTemplate.query(
                """
                SELECT id, query_code AS "queryCode", ds_code AS "dsCode",
                       success, duration_ms AS "durationMs", error_message AS "errorMessage",
                       created_at AS "createdAt"
                FROM lc_query_log
                WHERE duration_ms IS NOT NULL AND duration_ms >= :minMs
                ORDER BY duration_ms DESC, id DESC
                LIMIT :limit
                """,
                Map.of("limit", safe, "minMs", minMs),
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", rs.getLong("id"));
                    m.put("queryCode", rs.getString("queryCode"));
                    m.put("dsCode", rs.getString("dsCode"));
                    m.put("success", rs.getBoolean("success"));
                    m.put("durationMs", rs.getObject("durationMs"));
                    m.put("errorMessage", rs.getString("errorMessage"));
                    m.put("createdAt", rs.getTimestamp("createdAt"));
                    return m;
                }
        );
    }
}
