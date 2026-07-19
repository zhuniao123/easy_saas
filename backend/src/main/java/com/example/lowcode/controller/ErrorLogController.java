package com.example.lowcode.controller;

import com.example.lowcode.service.ErrorLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/error-logs")
public class ErrorLogController {
    @Autowired
    private ErrorLogService errorLogService;

    @GetMapping
    public List<Map<String, Object>> recent(@RequestParam(defaultValue = "50") int limit) {
        return errorLogService.recent(limit);
    }
}
