package com.example.lowcode.controller;

import com.example.lowcode.datatable.DataTable;
import com.example.lowcode.service.DataSourceResolveService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Component-facing data source resolution. Existing /queries/{code}/execute remains supported;
 * new components should prefer POST /api/v1/datasources/resolve with a DataSourceSpec body.
 */
@RestController
@RequestMapping("/api/v1/datasources")
public class DataSourceController {
    private final DataSourceResolveService dataSourceResolveService;

    public DataSourceController(DataSourceResolveService dataSourceResolveService) {
        this.dataSourceResolveService = dataSourceResolveService;
    }

    @PostMapping("/resolve")
    public Map<String, Object> resolve(@RequestBody Map<String, Object> body) {
        DataTable table = dataSourceResolveService.resolve(body);
        return table.toMap();
    }

    @GetMapping("/types")
    public Map<String, Object> types() {
        Set<String> types = new TreeSet<>(dataSourceResolveService.registeredTypes());
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("types", types);
        return res;
    }
}
