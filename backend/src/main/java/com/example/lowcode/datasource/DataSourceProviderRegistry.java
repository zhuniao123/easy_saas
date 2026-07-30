package com.example.lowcode.datasource;

import com.example.lowcode.datatable.DataTable;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class DataSourceProviderRegistry {
    private final Map<String, DataSourceProvider> providers = new LinkedHashMap<>();

    public DataSourceProviderRegistry(List<DataSourceProvider> providerList) {
        if (providerList != null) {
            for (DataSourceProvider provider : providerList) {
                register(provider);
            }
        }
    }

    public synchronized void register(DataSourceProvider provider) {
        if (provider == null || provider.type() == null || provider.type().isBlank()) {
            throw new IllegalArgumentException("DataSourceProvider type is required");
        }
        providers.put(provider.type().trim().toLowerCase(), provider);
    }

    public DataSourceProvider getRequired(String type) {
        String key = type == null || type.isBlank() ? "sql" : type.trim().toLowerCase();
        DataSourceProvider provider = providers.get(key);
        if (provider == null) {
            throw new IllegalArgumentException(
                    "Unknown data source type '" + key + "'. Registered: " + providers.keySet()
            );
        }
        return provider;
    }

    public DataTable resolve(DataSourceSpec spec) {
        if (spec == null) {
            throw new IllegalArgumentException("DataSourceSpec is required");
        }
        return getRequired(spec.getType()).resolve(spec);
    }

    public Set<String> registeredTypes() {
        return Set.copyOf(providers.keySet());
    }

    public Collection<DataSourceProvider> providers() {
        return List.copyOf(providers.values());
    }
}
