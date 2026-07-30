package com.example.lowcode.service;

import com.example.lowcode.script.ScriptRuntimeService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Governance for frontend page controllers and other script assets.
 * Runtime delivery only serves PUBLISHED scripts.
 */
@Service
public class ScriptService {
    public static final String TYPE_FRONTEND_JS = "FRONTEND_JS";
    public static final String TYPE_PAGE_CONTROLLER = "PAGE_CONTROLLER";
    public static final String TYPE_BACKEND_GROOVY = "BACKEND_GROOVY";

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_PUBLISHED = "PUBLISHED";
    public static final String STATUS_DISABLED = "DISABLED";

    private static final Set<String> ALLOWED_TYPES = Set.of(
            TYPE_FRONTEND_JS, TYPE_PAGE_CONTROLLER, TYPE_BACKEND_GROOVY
    );
    private static final Set<String> ALLOWED_STATUS = Set.of(
            STATUS_DRAFT, STATUS_PUBLISHED, STATUS_DISABLED
    );
    private static final Set<String> RUNTIME_TYPES = Set.of(TYPE_FRONTEND_JS, TYPE_PAGE_CONTROLLER);

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final ScriptRuntimeService scriptRuntimeService;

    public ScriptService(NamedParameterJdbcTemplate jdbcTemplate, ScriptRuntimeService scriptRuntimeService) {
        this.jdbcTemplate = jdbcTemplate;
        this.scriptRuntimeService = scriptRuntimeService;
    }

    public List<Map<String, Object>> list(String typeFilter) {
        if (typeFilter != null && !typeFilter.isBlank()) {
            return jdbcTemplate.query(
                    """
                    SELECT script_code AS "scriptCode",
                           script_type AS "scriptType",
                           status,
                           version,
                           page_code AS "pageCode",
                           remark,
                           created_at AS "createdAt",
                           updated_at AS "updatedAt"
                    FROM lc_script
                    WHERE script_type = :type
                    ORDER BY script_code
                    """,
                    Map.of("type", typeFilter.trim()),
                    (rs, i) -> rowMeta(rs)
            );
        }
        return jdbcTemplate.query(
                """
                SELECT script_code AS "scriptCode",
                       script_type AS "scriptType",
                       status,
                       version,
                       page_code AS "pageCode",
                       remark,
                       created_at AS "createdAt",
                       updated_at AS "updatedAt"
                FROM lc_script
                ORDER BY script_code
                """,
                Map.of(),
                (rs, i) -> rowMeta(rs)
        );
    }

    public Map<String, Object> get(String scriptCode, boolean includeContent) {
        Map<String, Object> params = Map.of("code", scriptCode);
        List<Map<String, Object>> rows = jdbcTemplate.query(
                """
                SELECT script_code AS "scriptCode",
                       script_type AS "scriptType",
                       status,
                       version,
                       page_code AS "pageCode",
                       remark,
                       script_content AS "scriptContent",
                       created_at AS "createdAt",
                       updated_at AS "updatedAt"
                FROM lc_script
                WHERE script_code = :code
                """,
                params,
                (rs, i) -> {
                    Map<String, Object> m = rowMeta(rs);
                    if (includeContent) {
                        m.put("scriptContent", rs.getString("scriptContent"));
                    }
                    return m;
                }
        );
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Script not found: " + scriptCode);
        }
        return rows.get(0);
    }

    /**
     * Runtime body for ES module load — only PUBLISHED frontend controllers.
     */
    public Map<String, Object> getPublishedRuntime(String scriptCode) {
        Map<String, Object> params = Map.of("code", scriptCode);
        List<Map<String, Object>> rows = jdbcTemplate.query(
                """
                SELECT script_code AS "scriptCode",
                       script_type AS "scriptType",
                       status,
                       version,
                       page_code AS "pageCode",
                       script_content AS "scriptContent"
                FROM lc_script
                WHERE script_code = :code
                """,
                params,
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("scriptCode", rs.getString("scriptCode"));
                    m.put("scriptType", rs.getString("scriptType"));
                    m.put("status", rs.getString("status"));
                    m.put("version", rs.getInt("version"));
                    m.put("pageCode", rs.getString("pageCode"));
                    m.put("scriptContent", rs.getString("scriptContent"));
                    return m;
                }
        );
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Script not found: " + scriptCode);
        }
        Map<String, Object> script = rows.get(0);
        String type = String.valueOf(script.get("scriptType"));
        String status = String.valueOf(script.get("status"));
        if (!RUNTIME_TYPES.contains(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Script type is not a frontend controller: " + type);
        }
        if (!STATUS_PUBLISHED.equalsIgnoreCase(status)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Script is not published (status=" + status + ")"
            );
        }
        return script;
    }

    public Map<String, Object> save(String scriptCode, Map<String, Object> body) {
        if (scriptCode == null || scriptCode.isBlank()) {
            throw new IllegalArgumentException("scriptCode is required");
        }
        String type = body.get("scriptType") != null
                ? String.valueOf(body.get("scriptType")).trim().toUpperCase(Locale.ROOT)
                : TYPE_PAGE_CONTROLLER;
        if (!ALLOWED_TYPES.contains(type)) {
            throw new IllegalArgumentException("Unsupported scriptType: " + type);
        }
        String content = body.get("scriptContent") == null ? "" : String.valueOf(body.get("scriptContent"));
        String pageCode = body.get("pageCode") == null || String.valueOf(body.get("pageCode")).isBlank()
                ? null
                : String.valueOf(body.get("pageCode"));
        String remark = body.get("remark") == null ? null : String.valueOf(body.get("remark"));
        // Save keeps status unless explicitly provided; default DRAFT for new rows.
        String status = body.get("status") == null
                ? null
                : String.valueOf(body.get("status")).trim().toUpperCase(Locale.ROOT);
        if (status != null && !ALLOWED_STATUS.contains(status)) {
            throw new IllegalArgumentException("Unsupported status: " + status);
        }

        Integer existing = jdbcTemplate.query(
                "SELECT 1 FROM lc_script WHERE script_code = :code",
                Map.of("code", scriptCode),
                rs -> rs.next() ? 1 : null
        );

        Map<String, Object> params = new HashMap<>();
        params.put("code", scriptCode);
        params.put("type", type);
        params.put("content", content);
        params.put("pageCode", pageCode);
        params.put("remark", remark);

        if (existing == null) {
            params.put("status", status != null ? status : STATUS_DRAFT);
            jdbcTemplate.update(
                    """
                    INSERT INTO lc_script(script_code, script_type, script_content, status, version, page_code, remark, updated_at)
                    VALUES (:code, :type, :content, :status, 1, :pageCode, :remark, now())
                    """,
                    params
            );
        } else {
            if (status != null) {
                params.put("status", status);
                jdbcTemplate.update(
                        """
                        UPDATE lc_script
                        SET script_type = :type,
                            script_content = :content,
                            page_code = :pageCode,
                            remark = :remark,
                            status = :status,
                            updated_at = now()
                        WHERE script_code = :code
                        """,
                        params
                );
            } else {
                jdbcTemplate.update(
                        """
                        UPDATE lc_script
                        SET script_type = :type,
                            script_content = :content,
                            page_code = :pageCode,
                            remark = :remark,
                            updated_at = now()
                        WHERE script_code = :code
                        """,
                        params
                );
            }
        }
        scriptRuntimeService.invalidate(scriptCode);
        return get(scriptCode, true);
    }

    public Map<String, Object> publish(String scriptCode) {
        Map<String, Object> existing = get(scriptCode, true);
        // compile-check for backend groovy before publish
        if (TYPE_BACKEND_GROOVY.equalsIgnoreCase(String.valueOf(existing.get("scriptType")))) {
            String content = String.valueOf(existing.get("scriptContent"));
            ScriptRuntimeService.CompileResult compile = scriptRuntimeService.compileCheck(content);
            if (!compile.ok()) {
                throw new IllegalArgumentException("Groovy compile failed: " + compile.error());
            }
        }
        jdbcTemplate.update(
                """
                UPDATE lc_script
                SET status = 'PUBLISHED',
                    version = version + 1,
                    updated_at = now()
                WHERE script_code = :code
                """,
                Map.of("code", scriptCode)
        );
        scriptRuntimeService.invalidate(scriptCode);
        return get(scriptCode, true);
    }

    public Map<String, Object> disable(String scriptCode) {
        get(scriptCode, false);
        jdbcTemplate.update(
                """
                UPDATE lc_script
                SET status = 'DISABLED',
                    updated_at = now()
                WHERE script_code = :code
                """,
                Map.of("code", scriptCode)
        );
        scriptRuntimeService.invalidate(scriptCode);
        return get(scriptCode, false);
    }

    public void delete(String scriptCode) {
        int n = jdbcTemplate.update(
                "DELETE FROM lc_script WHERE script_code = :code",
                Map.of("code", scriptCode)
        );
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Script not found: " + scriptCode);
        }
        scriptRuntimeService.invalidate(scriptCode);
    }

    private static Map<String, Object> rowMeta(java.sql.ResultSet rs) throws java.sql.SQLException {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("scriptCode", rs.getString("scriptCode"));
        m.put("scriptType", rs.getString("scriptType"));
        m.put("status", rs.getString("status"));
        m.put("version", rs.getObject("version"));
        m.put("pageCode", rs.getString("pageCode"));
        m.put("remark", rs.getString("remark"));
        m.put("createdAt", rs.getObject("createdAt"));
        m.put("updatedAt", rs.getObject("updatedAt"));
        return m;
    }
}
