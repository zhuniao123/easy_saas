package com.example.lowcode.script;

import com.example.lowcode.service.ActionService;
import com.example.lowcode.service.QueryEngineService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Controlled context for dynamic Groovy endpoints.
 * Does not expose Spring ApplicationContext, raw DataSource passwords, or filesystem.
 */
public final class DynamicContext {
    private static final Logger log = LoggerFactory.getLogger(DynamicContext.class);

    private final String endpointCode;
    private final String scriptCode;
    private final Map<String, Object> body;
    private final Map<String, Object> attrs;
    private final QueryEngineService queryEngineService;
    private final ActionService actionService;
    private final String dataSourceCode;

    public DynamicContext(
            String endpointCode,
            String scriptCode,
            Map<String, Object> body,
            QueryEngineService queryEngineService,
            ActionService actionService,
            String dataSourceCode
    ) {
        this.endpointCode = endpointCode;
        this.scriptCode = scriptCode;
        this.body = body == null
                ? Map.of()
                : Collections.unmodifiableMap(new LinkedHashMap<>(body));
        this.attrs = new LinkedHashMap<>();
        this.queryEngineService = queryEngineService;
        this.actionService = actionService;
        this.dataSourceCode = dataSourceCode;
    }

    public String getEndpointCode() {
        return endpointCode;
    }

    public String getScriptCode() {
        return scriptCode;
    }

    /** Single data-source code for this endpoint (null/blank = platform default). */
    public String getDataSourceCode() {
        return dataSourceCode;
    }

    public Map<String, Object> getBody() {
        return body;
    }

    public Object get(String key) {
        return body.get(key);
    }

    public Object require(String key) {
        Object value = body.get(key);
        if (value == null || (value instanceof String s && s.isBlank())) {
            throw new IllegalArgumentException("Missing required field: " + key);
        }
        return value;
    }

    public String requireString(String key) {
        return String.valueOf(require(key));
    }

    public void put(String key, Object value) {
        attrs.put(key, value);
    }

    public Object attr(String key) {
        return attrs.get(key);
    }

    public Map<String, Object> getAttrs() {
        return Collections.unmodifiableMap(attrs);
    }

    /**
     * Execute a registered query (read path). Same single data-source boundary as the endpoint.
     */
    public Map<String, Object> query(String queryCode, Map<String, Object> params) {
        return queryEngineService.executeSql(queryCode, params == null ? Map.of() : params);
    }

    public Map<String, Object> query(String queryCode, Map<String, Object> params, List<Map<String, Object>> filters) {
        return queryEngineService.executeSql(
                queryCode,
                params == null ? Map.of() : params,
                filters == null ? List.of() : filters
        );
    }

    /**
     * Execute a registered action (write path) on the platform data source.
     */
    public Map<String, Object> action(String actionCode, Map<String, Object> requestBody) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (requestBody != null) {
            body.putAll(requestBody);
        }
        return actionService.execute(actionCode, body);
    }

    public void info(String message) {
        log.info("[dynamic:{}] {}", endpointCode, message);
    }

    public void warn(String message) {
        log.warn("[dynamic:{}] {}", endpointCode, message);
    }

    public void error(String message) {
        log.error("[dynamic:{}] {}", endpointCode, message);
    }
}
