package com.example.lowcode.controller;

import com.example.lowcode.service.QueryEngineService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/queries")
public class QueryController {
    @Autowired
    private QueryEngineService queryEngineService;

    @PostMapping("/{queryCode}/execute")
    public Map<String, Object> execute(@PathVariable String queryCode, @RequestBody Map<String, Object> requestBody) {
        Map<String, Object> params = (Map<String, Object>) requestBody.get("params");
        return queryEngineService.executeSql(queryCode, params);
    }

    @GetMapping("/{queryCode}")
    public Map<String, Object> getQuery(@PathVariable String queryCode) {
        return queryEngineService.getQueryConfig(queryCode);
    }

    @PostMapping("/{queryCode}/configure")
    public Map<String, Object> configure(
            @PathVariable String queryCode,
            @RequestBody Map<String, Object> requestBody) {
        String sqlText = (String) requestBody.get("sqlText");
        queryEngineService.updateQueryConfig(queryCode, sqlText);
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }
}
