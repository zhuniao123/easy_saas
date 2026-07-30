package com.example.lowcode.datatable;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Unified tabular result for SQL, static, and future cache data sources.
 * Smart Grid and later chart components consume this shape only.
 */
public final class DataTable {
    private final List<Map<String, Object>> columns;
    private final List<Map<String, Object>> rows;
    private final Long total;
    private final Map<String, Object> metadata;

    public DataTable(
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            Long total,
            Map<String, Object> metadata
    ) {
        this.columns = columns == null ? List.of() : List.copyOf(columns);
        this.rows = rows == null ? List.of() : List.copyOf(rows);
        this.total = total;
        this.metadata = metadata == null
                ? Map.of()
                : Collections.unmodifiableMap(new LinkedHashMap<>(metadata));
    }

    public static DataTable empty() {
        return new DataTable(List.of(), List.of(), 0L, Map.of());
    }

    public static DataTable of(
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            Long total
    ) {
        return new DataTable(columns, rows, total, Map.of());
    }

    @SuppressWarnings("unchecked")
    public static DataTable fromMap(Map<String, Object> map) {
        if (map == null) {
            return empty();
        }
        List<Map<String, Object>> columns = map.get("columns") instanceof List
                ? (List<Map<String, Object>>) map.get("columns")
                : List.of();
        List<Map<String, Object>> rows = map.get("rows") instanceof List
                ? (List<Map<String, Object>>) map.get("rows")
                : List.of();
        Long total = null;
        Object totalRaw = map.get("total");
        if (totalRaw instanceof Number number) {
            total = number.longValue();
        }
        Map<String, Object> metadata = map.get("metadata") instanceof Map
                ? (Map<String, Object>) map.get("metadata")
                : Map.of();
        return new DataTable(columns, rows, total, metadata);
    }

    public List<Map<String, Object>> getColumns() {
        return columns;
    }

    public List<Map<String, Object>> getRows() {
        return rows;
    }

    public Long getTotal() {
        return total;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    /**
     * Wire-compatible map for existing REST clients (columns/rows/total + optional metadata).
     */
    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("columns", new ArrayList<>(columns));
        map.put("rows", new ArrayList<>(rows));
        if (total != null) {
            map.put("total", total);
        }
        if (!metadata.isEmpty()) {
            map.put("metadata", new LinkedHashMap<>(metadata));
        }
        return map;
    }

    public DataTable withMetadata(Map<String, Object> extra) {
        if (extra == null || extra.isEmpty()) {
            return this;
        }
        Map<String, Object> merged = new LinkedHashMap<>(this.metadata);
        merged.putAll(extra);
        return new DataTable(columns, rows, total, merged);
    }
}
