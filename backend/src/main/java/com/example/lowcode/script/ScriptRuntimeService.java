package com.example.lowcode.script;

import com.example.lowcode.interceptor.IGroovyActionInterceptor;
import com.example.lowcode.service.ScriptService;
import groovy.lang.GroovyClassLoader;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Unified Groovy ScriptRuntime: compile/cache/invalidate, hooks, and execution logging.
 */
@Service
public class ScriptRuntimeService {
    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final TransactionTemplate requiresNewTx;
    private final GroovyClassLoader classLoader = new GroovyClassLoader();
    /** Cache key: scriptCode@version */
    private final Map<String, Class<?>> compiledCache = new ConcurrentHashMap<>();

    public ScriptRuntimeService(
            NamedParameterJdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.requiresNewTx = new TransactionTemplate(transactionManager);
        this.requiresNewTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public void invalidate(String scriptCode) {
        if (scriptCode == null) {
            return;
        }
        compiledCache.keySet().removeIf(k -> k.startsWith(scriptCode + "@") || k.equals(scriptCode));
    }

    public void invalidateAll() {
        compiledCache.clear();
    }

    public CompileResult compileCheck(String source) {
        long start = System.currentTimeMillis();
        try {
            classLoader.parseClass(source == null ? "" : source);
            return new CompileResult(true, null, (int) (System.currentTimeMillis() - start));
        } catch (Exception ex) {
            return new CompileResult(false, ex.getMessage(), (int) (System.currentTimeMillis() - start));
        }
    }

    public IGroovyActionInterceptor loadHook(String scriptCode) {
        if (scriptCode == null || scriptCode.isBlank()) {
            return null;
        }
        Class<?> clazz = loadClass(scriptCode, false);
        if (clazz == null) {
            return null;
        }
        try {
            Object instance = clazz.getDeclaredConstructor().newInstance();
            if (instance instanceof IGroovyActionInterceptor interceptor) {
                return interceptor;
            }
            throw new IllegalStateException(
                    "Script " + scriptCode + " does not implement IGroovyActionInterceptor"
            );
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to instantiate hook " + scriptCode + ": " + ex.getMessage(), ex);
        }
    }

    public IDynamicEndpointHandler loadEndpointHandler(String scriptCode) {
        return loadEndpointHandler(scriptCode, true);
    }

    /**
     * @param requirePublished when false, DRAFT scripts may be compiled (e.g. pre-publish check)
     */
    public IDynamicEndpointHandler loadEndpointHandler(String scriptCode, boolean requirePublished) {
        Class<?> clazz = loadClass(scriptCode, requirePublished);
        if (clazz == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Script not found: " + scriptCode);
        }
        try {
            Object instance = clazz.getDeclaredConstructor().newInstance();
            if (instance instanceof IDynamicEndpointHandler handler) {
                return handler;
            }
            throw new IllegalStateException(
                    "Script " + scriptCode + " does not implement IDynamicEndpointHandler"
            );
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException(
                    "Failed to instantiate endpoint handler " + scriptCode + ": " + ex.getMessage(),
                    ex
            );
        }
    }

    /** Compile (and cache) without requiring PUBLISHED status. */
    public void ensureCompiles(String scriptCode) {
        Class<?> clazz = loadClass(scriptCode, false);
        if (clazz == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Script not found: " + scriptCode);
        }
    }

    /**
     * Always write in a fresh transaction so query/action read-only TX is not aborted.
     * Uses programmatic REQUIRES_NEW (self-invocation safe).
     */
    public void recordExec(
            String scriptCode,
            String endpointCode,
            String phase,
            boolean success,
            int durationMs,
            String errorMessage
    ) {
        Map<String, Object> params = new HashMap<>();
        params.put("scriptCode", scriptCode);
        params.put("endpointCode", endpointCode);
        params.put("phase", phase);
        params.put("success", success);
        params.put("durationMs", durationMs);
        params.put("error", errorMessage);
        try {
            requiresNewTx.executeWithoutResult(status -> jdbcTemplate.update(
                    """
                    INSERT INTO lc_script_exec_log(script_code, endpoint_code, phase, success, duration_ms, error_message)
                    VALUES (:scriptCode, :endpointCode, :phase, :success, :durationMs, :error)
                    """,
                    params
            ));
        } catch (Exception ignored) {
            // logging must not break main path
        }
    }

    private Class<?> loadClass(String scriptCode, boolean requirePublished) {
        ScriptRow row = loadScriptRow(scriptCode);
        if (row == null) {
            return null;
        }
        if (!ScriptService.TYPE_BACKEND_GROOVY.equalsIgnoreCase(row.scriptType)) {
            throw new IllegalArgumentException("Script is not BACKEND_GROOVY: " + scriptCode);
        }
        if (ScriptService.STATUS_DISABLED.equalsIgnoreCase(row.status)) {
            throw new IllegalStateException("Script is DISABLED: " + scriptCode);
        }
        if (requirePublished && !ScriptService.STATUS_PUBLISHED.equalsIgnoreCase(row.status)) {
            throw new IllegalStateException("Script is not PUBLISHED: " + scriptCode + " (status=" + row.status + ")");
        }
        String cacheKey = scriptCode + "@" + row.version;
        Class<?> cached = compiledCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }
        long start = System.currentTimeMillis();
        try {
            Class<?> parsed = classLoader.parseClass(row.content, scriptCode + ".groovy");
            compiledCache.put(cacheKey, parsed);
            recordExec(scriptCode, null, "compile", true, (int) (System.currentTimeMillis() - start), null);
            return parsed;
        } catch (Exception ex) {
            recordExec(scriptCode, null, "compile", false, (int) (System.currentTimeMillis() - start), ex.getMessage());
            throw new IllegalStateException("Compile failed for " + scriptCode + ": " + ex.getMessage(), ex);
        }
    }

    private ScriptRow loadScriptRow(String scriptCode) {
        List<ScriptRow> rows = jdbcTemplate.query(
                """
                SELECT script_code, script_type, status, version, script_content
                FROM lc_script
                WHERE script_code = :code
                """,
                Map.of("code", scriptCode),
                (rs, i) -> new ScriptRow(
                        rs.getString("script_code"),
                        rs.getString("script_type"),
                        rs.getString("status"),
                        rs.getInt("version"),
                        rs.getString("script_content")
                )
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    public record CompileResult(boolean ok, String error, int durationMs) {}

    private record ScriptRow(String scriptCode, String scriptType, String status, int version, String content) {}
}
