package com.example.lowcode.datasource;

import com.example.lowcode.datatable.DataTable;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Resolves {@code type=static} from options.rows (and optional options.columns / options.total).
 * Useful for demos, fixtures, and later offline slices without touching Smart Grid.
 */
@Component
public class StaticDataSourceProvider implements DataSourceProvider {
    @Override
    public String type() {
        return "static";
    }

    @Override
    @SuppressWarnings("unchecked")
    public DataTable resolve(DataSourceSpec spec) {
        Map<String, Object> options = spec.getOptions();
        List<Map<String, Object>> rows = options.get("rows") instanceof List
                ? (List<Map<String, Object>>) options.get("rows")
                : List.of();

        List<Map<String, Object>> columns;
        if (options.get("columns") instanceof List rawColumns) {
            columns = new ArrayList<>();
            for (Object col : rawColumns) {
                if (col instanceof Map) {
                    columns.add(normalizeColumn((Map<String, Object>) col));
                }
            }
        } else {
            columns = inferColumns(rows);
        }

        Long total = null;
        Object totalRaw = options.get("total");
        if (totalRaw instanceof Number number) {
            total = number.longValue();
        } else {
            total = (long) rows.size();
        }

        // Optional client-style paging via params
        Map<String, Object> params = spec.getParams();
        Integer page = intParam(params.get("_page"));
        Integer pageSize = intParam(params.get("_pageSize"));
        List<Map<String, Object>> pageRows = rows;
        if (pageSize != null && pageSize > 0) {
            int p = page == null || page < 1 ? 1 : page;
            int from = Math.min((p - 1) * pageSize, rows.size());
            int to = Math.min(from + pageSize, rows.size());
            pageRows = rows.subList(from, to);
        }

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("provider", "static");
        if (spec.getCacheKey() != null) {
            metadata.put("cacheKey", spec.getCacheKey());
        }
        return new DataTable(columns, pageRows, total, metadata);
    }

    private static Integer intParam(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (Exception e) {
            return null;
        }
    }

    private static Map<String, Object> normalizeColumn(Map<String, Object> col) {
        Map<String, Object> out = new LinkedHashMap<>();
        String field = col.get("field") != null
                ? String.valueOf(col.get("field"))
                : (col.get("name") != null ? String.valueOf(col.get("name")) : "");
        out.put("field", field);
        out.put("label", col.get("label") != null ? String.valueOf(col.get("label")) : field);
        out.put("type", col.get("type") != null ? String.valueOf(col.get("type")) : "string");
        return out;
    }

    private static List<Map<String, Object>> inferColumns(List<Map<String, Object>> rows) {
        Set<String> fields = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            if (row != null) {
                fields.addAll(row.keySet());
            }
        }
        List<Map<String, Object>> columns = new ArrayList<>();
        for (String field : fields) {
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("field", field);
            col.put("label", field);
            col.put("type", "string");
            columns.add(col);
        }
        return columns;
    }
}
