package com.example.lowcode.datasource;

import com.example.lowcode.datatable.DataTable;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Contract placeholder for {@code type=cache}. Full cache middleware is out of Slice 2 scope.
 * Callers receive a clear error; metadata documents the reserved type.
 */
@Component
public class CacheDataSourceProvider implements DataSourceProvider {
    @Override
    public String type() {
        return "cache";
    }

    @Override
    public DataTable resolve(DataSourceSpec spec) {
        throw new UnsupportedOperationException(
                "cache data source is reserved but not implemented yet"
                        + (spec.getCacheKey() == null ? "" : " (cacheKey=" + spec.getCacheKey() + ")")
        );
    }

    /**
     * Reserved metadata keys for future cache providers (documentation / smoke only).
     */
    public static Map<String, Object> reservedMetadata(String cacheKey) {
        return Map.of(
                "provider", "cache",
                "implemented", false,
                "cacheKey", cacheKey == null ? "" : cacheKey
        );
    }
}
