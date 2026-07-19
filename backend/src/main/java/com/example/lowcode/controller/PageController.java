package com.example.lowcode.controller;

import com.example.lowcode.service.PageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/pages")
public class PageController {
    @Autowired
    private PageService pageService;
    @Autowired
    private ObjectMapper objectMapper;

    @GetMapping
    public java.util.List<Map<String, Object>> listPages() {
        return pageService.listPages();
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
        String configJsonStr = (String) requestBody.get("configJson");
        pageService.updatePageConfig(pageCode, configJsonStr);
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }

    @PostMapping
    public Map<String, Object> createPage(@RequestBody Map<String, Object> requestBody) {
        String pageCode = (String) requestBody.get("pageCode");
        String title = (String) requestBody.get("title");
        String routePath = (String) requestBody.get("routePath");
        pageService.createPage(pageCode, title, routePath);
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
        pageService.insertRow(pageCode, rowData);
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }

    @PutMapping("/{pageCode}/data/{id}")
    public Map<String, Object> updateData(
            @PathVariable String pageCode,
            @PathVariable Object id,
            @RequestBody Map<String, Object> rowData) {
        pageService.updateRow(pageCode, id, rowData);
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }

    @DeleteMapping("/{pageCode}/data/{id}")
    public Map<String, Object> deleteData(
            @PathVariable String pageCode,
            @PathVariable Object id) {
        pageService.deleteRow(pageCode, id);
        Map<String, Object> res = new java.util.HashMap<>();
        res.put("status", "success");
        return res;
    }
}
