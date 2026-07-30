package com.example.lowcode.service;

import com.example.lowcode.config.AuthProperties;
import com.example.lowcode.script.DynamicContext;
import com.example.lowcode.script.IDynamicEndpointHandler;
import com.example.lowcode.script.SchemaValidator;
import com.example.lowcode.script.ScriptRuntimeService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class DynamicEndpointService {
    public static final String TX_NONE = "NONE";
    public static final String TX_READ_ONLY = "READ_ONLY";
    public static final String TX_REQUIRED = "REQUIRED";

    private static final Set<String> TX_MODES = Set.of(TX_NONE, TX_READ_ONLY, TX_REQUIRED);
    private static final Set<String> STATUSES = Set.of(
            ScriptService.STATUS_DRAFT,
            ScriptService.STATUS_PUBLISHED,
            ScriptService.STATUS_DISABLED
    );

    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final ScriptRuntimeService scriptRuntimeService;
    private final QueryEngineService queryEngineService;
    private final ActionService actionService;
    private final AuthService authService;
    private final AuthProperties authProperties;
    private final PlatformTransactionManager transactionManager;

    public DynamicEndpointService(
            NamedParameterJdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            ScriptRuntimeService scriptRuntimeService,
            QueryEngineService queryEngineService,
            ActionService actionService,
            AuthService authService,
            AuthProperties authProperties,
            PlatformTransactionManager transactionManager
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.scriptRuntimeService = scriptRuntimeService;
        this.queryEngineService = queryEngineService;
        this.actionService = actionService;
        this.authService = authService;
        this.authProperties = authProperties;
        this.transactionManager = transactionManager;
    }

    public List<Map<String, Object>> list() {
        return jdbcTemplate.query(
                """
                SELECT endpoint_code AS "endpointCode",
                       script_code AS "scriptCode",
                       perm_code AS "permCode",
                       tx_mode AS "txMode",
                       data_source_code AS "dataSourceCode",
                       timeout_ms AS "timeoutMs",
                       enabled,
                       status,
                       remark,
                       created_at AS "createdAt",
                       updated_at AS "updatedAt"
                FROM lc_dynamic_endpoint
                ORDER BY endpoint_code
                """,
                Map.of(),
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("endpointCode", rs.getString("endpointCode"));
                    m.put("scriptCode", rs.getString("scriptCode"));
                    m.put("permCode", rs.getString("permCode"));
                    m.put("txMode", rs.getString("txMode"));
                    m.put("dataSourceCode", rs.getString("dataSourceCode"));
                    m.put("timeoutMs", rs.getObject("timeoutMs"));
                    m.put("enabled", rs.getBoolean("enabled"));
                    m.put("status", rs.getString("status"));
                    m.put("remark", rs.getString("remark"));
                    m.put("createdAt", rs.getObject("createdAt"));
                    m.put("updatedAt", rs.getObject("updatedAt"));
                    return m;
                }
        );
    }

    public Map<String, Object> get(String endpointCode) {
        List<Map<String, Object>> rows = jdbcTemplate.query(
                """
                SELECT endpoint_code AS "endpointCode",
                       script_code AS "scriptCode",
                       perm_code AS "permCode",
                       request_schema_json::text AS "requestSchemaJson",
                       response_schema_json::text AS "responseSchemaJson",
                       tx_mode AS "txMode",
                       data_source_code AS "dataSourceCode",
                       timeout_ms AS "timeoutMs",
                       enabled,
                       status,
                       remark,
                       created_at AS "createdAt",
                       updated_at AS "updatedAt"
                FROM lc_dynamic_endpoint
                WHERE endpoint_code = :code
                """,
                Map.of("code", endpointCode),
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("endpointCode", rs.getString("endpointCode"));
                    m.put("scriptCode", rs.getString("scriptCode"));
                    m.put("permCode", rs.getString("permCode"));
                    m.put("requestSchemaJson", rs.getString("requestSchemaJson"));
                    m.put("responseSchemaJson", rs.getString("responseSchemaJson"));
                    m.put("txMode", rs.getString("txMode"));
                    m.put("dataSourceCode", rs.getString("dataSourceCode"));
                    m.put("timeoutMs", rs.getObject("timeoutMs"));
                    m.put("enabled", rs.getBoolean("enabled"));
                    m.put("status", rs.getString("status"));
                    m.put("remark", rs.getString("remark"));
                    m.put("createdAt", rs.getObject("createdAt"));
                    m.put("updatedAt", rs.getObject("updatedAt"));
                    return m;
                }
        );
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Dynamic endpoint not found: " + endpointCode);
        }
        return rows.get(0);
    }

    public Map<String, Object> save(String endpointCode, Map<String, Object> body) {
        if (endpointCode == null || endpointCode.isBlank()) {
            throw new IllegalArgumentException("endpointCode is required");
        }
        String scriptCode = requiredString(body.get("scriptCode"), "scriptCode");
        String permCode = body.get("permCode") == null || String.valueOf(body.get("permCode")).isBlank()
                ? null
                : String.valueOf(body.get("permCode"));
        String txMode = body.get("txMode") == null
                ? TX_REQUIRED
                : String.valueOf(body.get("txMode")).trim().toUpperCase(Locale.ROOT);
        if (!TX_MODES.contains(txMode)) {
            throw new IllegalArgumentException("Unsupported txMode: " + txMode);
        }
        String dataSourceCode = body.get("dataSourceCode") == null || String.valueOf(body.get("dataSourceCode")).isBlank()
                ? null
                : String.valueOf(body.get("dataSourceCode"));
        // Slice 5: single platform data source only; non-null codes reserved for multi-ds routing later.
        if (dataSourceCode != null && !"default".equalsIgnoreCase(dataSourceCode)) {
            throw new IllegalArgumentException(
                    "Cross data-source dynamic endpoints are not supported yet; use platform default or dataSourceCode=default"
            );
        }
        int timeoutMs = 10_000;
        if (body.get("timeoutMs") instanceof Number n) {
            timeoutMs = Math.max(500, Math.min(60_000, n.intValue()));
        }
        boolean enabled = body.get("enabled") == null
                || Boolean.TRUE.equals(body.get("enabled"))
                || "true".equalsIgnoreCase(String.valueOf(body.get("enabled")));
        String status = body.get("status") == null
                ? ScriptService.STATUS_DRAFT
                : String.valueOf(body.get("status")).trim().toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(status)) {
            throw new IllegalArgumentException("Unsupported status: " + status);
        }
        String remark = body.get("remark") == null ? null : String.valueOf(body.get("remark"));
        String requestSchema = toJsonText(body.get("requestSchema"), body.get("requestSchemaJson"));
        String responseSchema = toJsonText(body.get("responseSchema"), body.get("responseSchemaJson"));

        Map<String, Object> params = new HashMap<>();
        params.put("code", endpointCode);
        params.put("scriptCode", scriptCode);
        params.put("permCode", permCode);
        params.put("requestSchema", requestSchema == null ? "{}" : requestSchema);
        params.put("responseSchema", responseSchema == null ? "{}" : responseSchema);
        params.put("txMode", txMode);
        params.put("dataSourceCode", dataSourceCode);
        params.put("timeoutMs", timeoutMs);
        params.put("enabled", enabled);
        params.put("status", status);
        params.put("remark", remark);

        Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM lc_dynamic_endpoint WHERE endpoint_code = :code",
                params,
                Integer.class
        );
        if (exists != null && exists > 0) {
            jdbcTemplate.update(
                    """
                    UPDATE lc_dynamic_endpoint
                    SET script_code = :scriptCode,
                        perm_code = :permCode,
                        request_schema_json = :requestSchema::jsonb,
                        response_schema_json = :responseSchema::jsonb,
                        tx_mode = :txMode,
                        data_source_code = :dataSourceCode,
                        timeout_ms = :timeoutMs,
                        enabled = :enabled,
                        status = :status,
                        remark = :remark,
                        updated_at = now()
                    WHERE endpoint_code = :code
                    """,
                    params
            );
        } else {
            jdbcTemplate.update(
                    """
                    INSERT INTO lc_dynamic_endpoint(
                      endpoint_code, script_code, perm_code, request_schema_json, response_schema_json,
                      tx_mode, data_source_code, timeout_ms, enabled, status, remark
                    ) VALUES (
                      :code, :scriptCode, :permCode, :requestSchema::jsonb, :responseSchema::jsonb,
                      :txMode, :dataSourceCode, :timeoutMs, :enabled, :status, :remark
                    )
                    """,
                    params
            );
        }
        return get(endpointCode);
    }

    public Map<String, Object> publish(String endpointCode) {
        Map<String, Object> ep = get(endpointCode);
        String scriptCode = String.valueOf(ep.get("scriptCode"));
        // Ensure groovy compiles and is publishable
        Map<String, Object> script = loadScriptMeta(scriptCode);
        if (!ScriptService.TYPE_BACKEND_GROOVY.equalsIgnoreCase(String.valueOf(script.get("scriptType")))) {
            throw new IllegalArgumentException("Dynamic endpoint script must be BACKEND_GROOVY");
        }
        CompileAndCache(scriptCode);
        jdbcTemplate.update(
                """
                UPDATE lc_dynamic_endpoint
                SET status = 'PUBLISHED', enabled = true, updated_at = now()
                WHERE endpoint_code = :code
                """,
                Map.of("code", endpointCode)
        );
        // also publish script if still draft
        if (!ScriptService.STATUS_PUBLISHED.equalsIgnoreCase(String.valueOf(script.get("status")))) {
            jdbcTemplate.update(
                    """
                    UPDATE lc_script
                    SET status = 'PUBLISHED', version = version + 1, updated_at = now()
                    WHERE script_code = :code
                    """,
                    Map.of("code", scriptCode)
            );
            scriptRuntimeService.invalidate(scriptCode);
        }
        return get(endpointCode);
    }

    public Map<String, Object> disable(String endpointCode) {
        get(endpointCode);
        jdbcTemplate.update(
                """
                UPDATE lc_dynamic_endpoint
                SET status = 'DISABLED', enabled = false, updated_at = now()
                WHERE endpoint_code = :code
                """,
                Map.of("code", endpointCode)
        );
        return get(endpointCode);
    }

    public Object invoke(String endpointCode, Map<String, Object> requestBody) {
        Map<String, Object> ep = get(endpointCode);
        if (!Boolean.TRUE.equals(ep.get("enabled"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Dynamic endpoint is disabled");
        }
        if (!ScriptService.STATUS_PUBLISHED.equalsIgnoreCase(String.valueOf(ep.get("status")))) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Dynamic endpoint is not published (status=" + ep.get("status") + ")"
            );
        }

        String permCode = ep.get("permCode") == null ? null : String.valueOf(ep.get("permCode"));
        if (authProperties.isEnabled() && permCode != null && !permCode.isBlank()) {
            if (!authService.hasPermission("perm:config")) {
                authService.requirePermission(permCode);
            }
        }

        Map<String, Object> body = requestBody == null ? Map.of() : requestBody;
        Object requestSchema = parseJson(ep.get("requestSchemaJson"));
        List<String> reqErrors = SchemaValidator.validate(requestSchema, body, "request");
        if (!reqErrors.isEmpty()) {
            throw new IllegalArgumentException("Request schema validation failed: " + String.join("; ", reqErrors));
        }

        String scriptCode = String.valueOf(ep.get("scriptCode"));
        String txMode = String.valueOf(ep.get("txMode"));
        String dataSourceCode = ep.get("dataSourceCode") == null ? null : String.valueOf(ep.get("dataSourceCode"));
        int timeoutMs = ep.get("timeoutMs") instanceof Number n ? n.intValue() : 10_000;

        long start = System.currentTimeMillis();
        boolean success = false;
        String err = null;
        try {
            Object result = runWithTx(txMode, timeoutMs, () -> {
                IDynamicEndpointHandler handler = scriptRuntimeService.loadEndpointHandler(scriptCode);
                DynamicContext ctx = new DynamicContext(
                        endpointCode,
                        scriptCode,
                        body,
                        queryEngineService,
                        actionService,
                        dataSourceCode
                );
                return handler.handle(ctx);
            });

            Object responseSchema = parseJson(ep.get("responseSchemaJson"));
            if (responseSchema instanceof Map<?, ?> schemaMap && !schemaMap.isEmpty()) {
                List<String> resErrors = SchemaValidator.validate(responseSchema, result, "response");
                if (!resErrors.isEmpty()) {
                    throw new IllegalStateException("Response schema validation failed: " + String.join("; ", resErrors));
                }
            }
            success = true;
            return result;
        } catch (RuntimeException ex) {
            err = ex.getMessage();
            throw ex;
        } catch (Exception ex) {
            err = ex.getMessage();
            throw new IllegalStateException(ex.getMessage(), ex);
        } finally {
            scriptRuntimeService.recordExec(
                    scriptCode,
                    endpointCode,
                    "dynamic",
                    success,
                    (int) (System.currentTimeMillis() - start),
                    err
            );
        }
    }

    private Object runWithTx(String txMode, int timeoutMs, CallableEx<Object> work) throws Exception {
        if (TX_NONE.equalsIgnoreCase(txMode)) {
            return work.call();
        }
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setReadOnly(TX_READ_ONLY.equalsIgnoreCase(txMode));
        template.setTimeout(Math.max(1, timeoutMs / 1000));
        try {
            return template.execute(status -> {
                try {
                    return work.call();
                } catch (RuntimeException ex) {
                    throw ex;
                } catch (Exception ex) {
                    throw new IllegalStateException(ex.getMessage(), ex);
                }
            });
        } catch (RuntimeException ex) {
            throw ex;
        }
    }

    private void CompileAndCache(String scriptCode) {
        scriptRuntimeService.invalidate(scriptCode);
        // Allow DRAFT during publish pre-check; runtime invoke still requires PUBLISHED.
        scriptRuntimeService.loadEndpointHandler(scriptCode, false);
    }

    private Map<String, Object> loadScriptMeta(String scriptCode) {
        List<Map<String, Object>> rows = jdbcTemplate.query(
                """
                SELECT script_code AS "scriptCode", script_type AS "scriptType", status, version
                FROM lc_script WHERE script_code = :code
                """,
                Map.of("code", scriptCode),
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("scriptCode", rs.getString("scriptCode"));
                    m.put("scriptType", rs.getString("scriptType"));
                    m.put("status", rs.getString("status"));
                    m.put("version", rs.getInt("version"));
                    return m;
                }
        );
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Script not found: " + scriptCode);
        }
        return rows.get(0);
    }

    private String toJsonText(Object schemaObj, Object schemaJson) {
        try {
            if (schemaObj != null) {
                if (schemaObj instanceof String s) {
                    return s;
                }
                return objectMapper.writeValueAsString(schemaObj);
            }
            if (schemaJson != null) {
                return String.valueOf(schemaJson);
            }
            return "{}";
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid schema JSON: " + ex.getMessage());
        }
    }

    private Object parseJson(Object raw) {
        if (raw == null) {
            return Map.of();
        }
        String text = String.valueOf(raw);
        if (text.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(text, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private static String requiredString(Object value, String field) {
        if (value == null || String.valueOf(value).isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return String.valueOf(value);
    }

    @FunctionalInterface
    private interface CallableEx<T> {
        T call() throws Exception;
    }
}
