package com.example.lowcode.controller;

import com.example.lowcode.service.DataSourceAdminService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * Encrypted JDBC catalog admin. Authz: /api/v1/admin/** → perm:config.
 */
@RestController
@RequestMapping("/api/v1/admin/data-sources")
public class DataSourceAdminController {
    @Autowired
    private DataSourceAdminService dataSourceAdminService;

    @GetMapping
    public List<Map<String, Object>> list() {
        return dataSourceAdminService.list();
    }

    @GetMapping("/crypto-status")
    public Map<String, Object> cryptoStatus() {
        return dataSourceAdminService.cryptoStatus();
    }

    @GetMapping("/{dsCode}")
    public Map<String, Object> get(@PathVariable String dsCode) {
        try {
            return dataSourceAdminService.get(dsCode);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, ex.getMessage(), ex);
        }
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        try {
            return dataSourceAdminService.create(body);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
    }

    @PutMapping("/{dsCode}")
    public Map<String, Object> update(@PathVariable String dsCode, @RequestBody Map<String, Object> body) {
        try {
            return dataSourceAdminService.update(dsCode, body);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
    }

    @DeleteMapping("/{dsCode}")
    public Map<String, Object> delete(@PathVariable String dsCode) {
        try {
            dataSourceAdminService.delete(dsCode);
            return Map.of("status", "success");
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, ex.getMessage(), ex);
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, ex.getMessage(), ex);
        }
    }

    @PostMapping("/{dsCode}/test")
    public Map<String, Object> test(@PathVariable String dsCode, @RequestBody(required = false) Map<String, Object> body) {
        try {
            return dataSourceAdminService.testConnection(dsCode, body);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, ex.getMessage(), ex);
        }
    }
}
