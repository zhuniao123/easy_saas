package com.example.lowcode.controller;

import com.example.lowcode.service.DynamicEndpointService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/dynamic")
public class DynamicEndpointController {
    private final DynamicEndpointService dynamicEndpointService;

    public DynamicEndpointController(DynamicEndpointService dynamicEndpointService) {
        this.dynamicEndpointService = dynamicEndpointService;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return dynamicEndpointService.list();
    }

    @GetMapping("/{endpointCode}")
    public Map<String, Object> get(@PathVariable String endpointCode) {
        return dynamicEndpointService.get(endpointCode);
    }

    @PutMapping("/{endpointCode}")
    public Map<String, Object> save(
            @PathVariable String endpointCode,
            @RequestBody Map<String, Object> body
    ) {
        return dynamicEndpointService.save(endpointCode, body == null ? Map.of() : body);
    }

    @PostMapping("/{endpointCode}/publish")
    public Map<String, Object> publish(@PathVariable String endpointCode) {
        return dynamicEndpointService.publish(endpointCode);
    }

    @PostMapping("/{endpointCode}/disable")
    public Map<String, Object> disable(@PathVariable String endpointCode) {
        return dynamicEndpointService.disable(endpointCode);
    }

    /**
     * Unified governed dynamic endpoint entry.
     * Body is validated against request schema; response optionally against response schema.
     */
    @PostMapping("/{endpointCode}")
    public Object invoke(
            @PathVariable String endpointCode,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        Object result = dynamicEndpointService.invoke(endpointCode, body == null ? Map.of() : body);
        if (result instanceof Map<?, ?> map) {
            return map;
        }
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("status", "success");
        envelope.put("data", result);
        return envelope;
    }
}
