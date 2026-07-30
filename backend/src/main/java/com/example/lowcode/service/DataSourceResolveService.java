package com.example.lowcode.service;

import com.example.lowcode.datasource.DataSourceProviderRegistry;
import com.example.lowcode.datasource.DataSourceSpec;
import com.example.lowcode.datatable.DataTable;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.Set;

/**
 * Facade for component data loading. Smart Grid / future charts call this instead of
 * branching on provider type.
 */
@Service
public class DataSourceResolveService {
    private final DataSourceProviderRegistry registry;

    public DataSourceResolveService(DataSourceProviderRegistry registry) {
        this.registry = registry;
    }

    public DataTable resolve(DataSourceSpec spec) {
        return registry.resolve(spec);
    }

    public DataTable resolve(Map<String, Object> specMap) {
        return registry.resolve(DataSourceSpec.fromMap(specMap));
    }

    public DataTable resolveSql(String queryCode, Map<String, Object> params, Map<String, Object> options) {
        return registry.resolve(DataSourceSpec.sql(queryCode, params, options));
    }

    public Set<String> registeredTypes() {
        return registry.registeredTypes();
    }
}
