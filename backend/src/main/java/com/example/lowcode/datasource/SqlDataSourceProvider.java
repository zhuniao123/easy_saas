package com.example.lowcode.datasource;

import com.example.lowcode.datatable.DataTable;
import com.example.lowcode.service.QueryEngineService;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * Resolves {@code type=sql} via QueryEngine (read-only rawSql / singleTableTemplate).
 */
@Component
public class SqlDataSourceProvider implements DataSourceProvider {
    private final QueryEngineService queryEngineService;

    public SqlDataSourceProvider(QueryEngineService queryEngineService) {
        this.queryEngineService = queryEngineService;
    }

    @Override
    public String type() {
        return "sql";
    }

    @Override
    public DataTable resolve(DataSourceSpec spec) {
        if (spec.getQueryCode() == null || spec.getQueryCode().isBlank()) {
            throw new IllegalArgumentException("sql data source requires queryCode");
        }
        Map<String, Object> params = new HashMap<>(spec.getParams());
        Object pageCodeObj = spec.getOptions().get("pageCode");
        String pageCode = pageCodeObj == null || String.valueOf(pageCodeObj).isBlank()
                ? null
                : String.valueOf(pageCodeObj);
        Map<String, Object> raw = queryEngineService.executeSql(
                spec.getQueryCode(),
                params,
                spec.filters(),
                pageCode
        );
        DataTable table = DataTable.fromMap(raw);
        Map<String, Object> meta = new HashMap<>(table.getMetadata());
        meta.put("provider", "sql");
        meta.put("queryCode", spec.getQueryCode());
        if (raw.get("dataSourceCode") != null) {
            meta.put("dataSourceCode", raw.get("dataSourceCode"));
        }
        return table.withMetadata(meta);
    }
}
