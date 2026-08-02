package com.example.lowcode.service;

import cn.dev33.satoken.stp.StpUtil;
import com.example.lowcode.config.AuthProperties;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Lightweight config change audit trail (not full JSON versioning).
 * Table created via schema.sql; failures never break primary write path.
 */
@Service
public class ConfigAuditService {
    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final AuthProperties authProperties;

    public ConfigAuditService(NamedParameterJdbcTemplate jdbcTemplate, AuthProperties authProperties) {
        this.jdbcTemplate = jdbcTemplate;
        this.authProperties = authProperties;
    }

    public void record(String resourceType, String resourceCode, String op, String summary) {
        try {
            Map<String, Object> p = new HashMap<>();
            p.put("resourceType", resourceType == null ? "unknown" : resourceType);
            p.put("resourceCode", resourceCode);
            p.put("op", op == null ? "update" : op);
            p.put("summary", summary == null ? null : (summary.length() > 500 ? summary.substring(0, 500) : summary));
            String actor = null;
            if (authProperties.isEnabled()) {
                try {
                    if (StpUtil.isLogin()) {
                        actor = String.valueOf(StpUtil.getLoginId());
                    }
                } catch (Exception ignore) {
                    /* no session */
                }
            }
            p.put("actor", actor);
            jdbcTemplate.update(
                    """
                    INSERT INTO lc_config_audit(resource_type, resource_code, op, actor, summary)
                    VALUES (:resourceType, :resourceCode, :op, :actor, :summary)
                    """,
                    p
            );
        } catch (Exception ignore) {
            // audit must not fail primary path (table may be missing on old DBs)
        }
    }

    public List<Map<String, Object>> recent(int limit) {
        int safe = Math.max(1, Math.min(200, limit));
        try {
            return jdbcTemplate.query(
                    """
                    SELECT id, resource_type AS "resourceType", resource_code AS "resourceCode",
                           op, actor, summary, created_at AS "createdAt"
                    FROM lc_config_audit
                    ORDER BY id DESC
                    LIMIT :limit
                    """,
                    Map.of("limit", safe),
                    (rs, i) -> {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", rs.getLong("id"));
                        m.put("resourceType", rs.getString("resourceType"));
                        m.put("resourceCode", rs.getString("resourceCode"));
                        m.put("op", rs.getString("op"));
                        m.put("actor", rs.getString("actor"));
                        m.put("summary", rs.getString("summary"));
                        m.put("createdAt", rs.getTimestamp("createdAt"));
                        return m;
                    }
            );
        } catch (Exception ex) {
            return List.of();
        }
    }
}
