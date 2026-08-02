package com.example.lowcode.controller;

import com.example.lowcode.service.ConfigAuditService;
import com.example.lowcode.service.ErrorLogService;
import com.example.lowcode.service.MetadataCacheService;
import com.example.lowcode.service.ObservabilityService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Ops read APIs (perm:config via /api/v1/admin/** or error-logs already config-gated).
 * Mounted under /api/v1/ops for a clear ops surface.
 */
@RestController
@RequestMapping("/api/v1/ops")
public class ObservabilityController {
    private final ObservabilityService observabilityService;
    private final ErrorLogService errorLogService;
    private final ConfigAuditService configAuditService;
    private final MetadataCacheService metadataCacheService;

    public ObservabilityController(
            ObservabilityService observabilityService,
            ErrorLogService errorLogService,
            ConfigAuditService configAuditService,
            MetadataCacheService metadataCacheService
    ) {
        this.observabilityService = observabilityService;
        this.errorLogService = errorLogService;
        this.configAuditService = configAuditService;
        this.metadataCacheService = metadataCacheService;
    }

    @GetMapping("/query-logs")
    public List<Map<String, Object>> queryLogs(
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(required = false) String queryCode,
            @RequestParam(required = false) Boolean success
    ) {
        return observabilityService.listQueryLogs(limit, queryCode, success);
    }

    @GetMapping("/action-logs")
    public List<Map<String, Object>> actionLogs(
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(required = false) String actionCode,
            @RequestParam(required = false) Boolean success
    ) {
        return observabilityService.listActionLogs(limit, actionCode, success);
    }

    @GetMapping("/slow-queries")
    public List<Map<String, Object>> slowQueries(
            @RequestParam(defaultValue = "30") int limit,
            @RequestParam(defaultValue = "200") int minDurationMs
    ) {
        return observabilityService.slowQueries(limit, minDurationMs);
    }

    @GetMapping("/error-logs")
    public List<Map<String, Object>> errorLogs(@RequestParam(defaultValue = "50") int limit) {
        return errorLogService.recent(limit);
    }

    @GetMapping("/summary")
    public Map<String, Object> summary() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("recentQueryErrors", observabilityService.listQueryLogs(10, null, false));
        m.put("slowQueries", observabilityService.slowQueries(10, 100));
        m.put("recentErrors", errorLogService.recent(10));
        m.put("configAudit", configAuditService.recent(10));
        m.put("cache", metadataCacheService.stats());
        return m;
    }

    @GetMapping("/config-audit")
    public List<Map<String, Object>> configAudit(@RequestParam(defaultValue = "50") int limit) {
        return configAuditService.recent(limit);
    }
}
