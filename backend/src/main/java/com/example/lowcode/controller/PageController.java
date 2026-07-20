package com.example.lowcode.controller;

import com.example.lowcode.service.AuthService;
import com.example.lowcode.service.PageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/pages")
public class PageController {
    @Autowired
    private PageService pageService;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private AuthService authService;

    @GetMapping
    public List<Map<String, Object>> listPages() {
        List<Map<String, Object>> all = pageService.listPages();
        if (!authService.isAuthEnabled()) {
            return all;
        }
        return all.stream()
                .filter(p -> {
                    Object code = p.get("pageCode");
                    return code != null && authService.hasPermission("page:" + code);
                })
                .collect(Collectors.toList());
    }

    @GetMapping("/{pageCode}")
    public Map<String, Object> getPage(@PathVariable String pageCode) throws Exception {
        Map<String, Object> config = pageService.getPageConfig(pageCode);
        String configJsonStr = (String) config.get("config");
        config.put("config", objectMapper.readValue(configJsonStr, Map.class));
        config.put("writable", pageService.isPageWritable(pageCode));
        return config;
    }

    @GetMapping("/entities/{entityCode}")
    public Map<String, Object> getEntity(@PathVariable String entityCode) throws Exception {
        Map<String, Object> config = pageService.getEntityConfig(entityCode);
        config.put("fields", pageService.resolveEntityFields(entityCode));
        return config;
    }

    @PostMapping("/entities/{entityCode}/configure")
    public Map<String, Object> configureEntity(
            @PathVariable String entityCode,
            @RequestBody Map<String, Object> requestBody) throws Exception {
        String fieldsJsonStr = (String) requestBody.get("fieldsJson");
        String primaryKey = requestBody.get("primaryKey") == null ? null : String.valueOf(requestBody.get("primaryKey"));
        pageService.updateEntityConfig(entityCode, fieldsJsonStr, primaryKey);
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }

    @PostMapping("/{pageCode}/configure")
    public Map<String, Object> configurePage(
            @PathVariable String pageCode,
            @RequestBody Map<String, Object> requestBody) {
        try {
            String configJsonStr = (String) requestBody.get("configJson");
            pageService.updatePageConfig(pageCode, configJsonStr);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }

    @PostMapping
    public Map<String, Object> createPage(@RequestBody Map<String, Object> requestBody) {
        try {
            String pageCode = (String) requestBody.get("pageCode");
            String title = (String) requestBody.get("title");
            String routePath = (String) requestBody.get("routePath");
            pageService.createPage(pageCode, title, routePath);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }

    @DeleteMapping("/{pageCode}")
    public Map<String, Object> deletePage(@PathVariable String pageCode) {
        pageService.deletePage(pageCode);
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }

    @PostMapping("/{pageCode}/data")
    public Map<String, Object> insertData(
            @PathVariable String pageCode,
            @RequestBody Map<String, Object> rowData) {
        try {
            pageService.insertRow(pageCode, rowData);
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, ex.getMessage(), ex);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }

    @PutMapping("/{pageCode}/data/{id}")
    public Map<String, Object> updateData(
            @PathVariable String pageCode,
            @PathVariable Object id,
            @RequestBody Map<String, Object> rowData) {
        try {
            pageService.updateRow(pageCode, id, rowData);
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, ex.getMessage(), ex);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }

    @DeleteMapping("/{pageCode}/data/{id}")
    public Map<String, Object> deleteData(
            @PathVariable String pageCode,
            @PathVariable Object id) {
        try {
            pageService.deleteRow(pageCode, id);
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, ex.getMessage(), ex);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }

    @PostMapping("/{pageCode}/logs")
    public Map<String, Object> logClientEvent(
            @PathVariable String pageCode,
            @RequestBody Map<String, Object> payload) {
        String eventType = (String) payload.get("eventType");
        String elementCode = (String) payload.get("elementCode");
        String message = (String) payload.get("message");
        Object details = payload.get("details");

        pageService.logClientEvent(pageCode, eventType, elementCode, message, details);

        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }
}
