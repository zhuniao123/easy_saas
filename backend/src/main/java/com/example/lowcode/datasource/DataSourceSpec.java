package com.example.lowcode.datasource;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Declarative component data source. Resolved by {@link DataSourceProviderRegistry}
 * via the registered provider for {@link #getType()}.
 */
public final class DataSourceSpec {
    private final String type;
    private final String queryCode;
    private final String cacheKey;
    private final Map<String, Object> params;
    private final Map<String, Object> options;

    public DataSourceSpec(
            String type,
            String queryCode,
            String cacheKey,
            Map<String, Object> params,
            Map<String, Object> options
    ) {
        this.type = type == null || type.isBlank() ? "sql" : type.trim();
        this.queryCode = queryCode;
        this.cacheKey = cacheKey;
        this.params = params == null
                ? Map.of()
                : Collections.unmodifiableMap(new LinkedHashMap<>(params));
        this.options = options == null
                ? Map.of()
                : Collections.unmodifiableMap(new LinkedHashMap<>(options));
    }

    public static DataSourceSpec sql(String queryCode, Map<String, Object> params, Map<String, Object> options) {
        return new DataSourceSpec("sql", queryCode, null, params, options);
    }

    public static DataSourceSpec fromMap(Map<String, Object> map) {
        if (map == null) {
            return new DataSourceSpec("sql", null, null, Map.of(), Map.of());
        }
        String type = map.get("type") == null ? null : String.valueOf(map.get("type"));
        String queryCode = map.get("queryCode") == null ? null : String.valueOf(map.get("queryCode"));
        String cacheKey = map.get("cacheKey") == null ? null : String.valueOf(map.get("cacheKey"));
        @SuppressWarnings("unchecked")
        Map<String, Object> params = map.get("params") instanceof Map
                ? (Map<String, Object>) map.get("params")
                : Map.of();
        @SuppressWarnings("unchecked")
        Map<String, Object> options = map.get("options") instanceof Map
                ? (Map<String, Object>) map.get("options")
                : Map.of();
        return new DataSourceSpec(type, queryCode, cacheKey, params, options);
    }

    public String getType() {
        return type;
    }

    public String getQueryCode() {
        return queryCode;
    }

    public String getCacheKey() {
        return cacheKey;
    }

    public Map<String, Object> getParams() {
        return params;
    }

    public Map<String, Object> getOptions() {
        return options;
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> filters() {
        Object filters = options.get("filters");
        if (filters instanceof List) {
            return (List<Map<String, Object>>) filters;
        }
        return List.of();
    }
}
