package com.example.lowcode.controller;

import com.example.lowcode.service.RbacAdminService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * Owner/admin RBAC console APIs. AuthzInterceptor requires perm:config on /api/v1/admin/**.
 */
@RestController
@RequestMapping("/api/v1/admin/rbac")
public class RbacAdminController {
    @Autowired
    private RbacAdminService rbacAdminService;

    @GetMapping("/users")
    public List<Map<String, Object>> listUsers() {
        return rbacAdminService.listUsers();
    }

    @PostMapping("/users")
    public Map<String, Object> createUser(@RequestBody Map<String, Object> body) {
        try {
            return rbacAdminService.createUser(body);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, ex.getMessage(), ex);
        }
    }

    @PutMapping("/users/{userId}")
    public Map<String, Object> updateUser(@PathVariable long userId, @RequestBody Map<String, Object> body) {
        try {
            return rbacAdminService.updateUser(userId, body);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, ex.getMessage(), ex);
        }
    }

    @GetMapping("/roles")
    public List<Map<String, Object>> listRoles() {
        return rbacAdminService.listRoles();
    }

    @GetMapping("/permissions")
    public List<Map<String, Object>> listPermissions(@RequestParam(required = false) String type) {
        return rbacAdminService.listPermissions(type);
    }

    @GetMapping("/roles/{roleCode}/permissions")
    public Map<String, Object> getRolePermissions(@PathVariable String roleCode) {
        try {
            return rbacAdminService.getRolePermissions(roleCode);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, ex.getMessage(), ex);
        }
    }

    @PutMapping("/roles/{roleCode}/permissions")
    public Map<String, Object> setRolePermissions(
            @PathVariable String roleCode,
            @RequestBody Map<String, Object> body) {
        try {
            return rbacAdminService.setRolePermissions(roleCode, body);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
    }

    @PostMapping("/refresh-catalog")
    public Map<String, Object> refreshCatalog() {
        return rbacAdminService.refreshCatalog();
    }
}
