package com.example.lowcode.controller;

import com.example.lowcode.config.AuthProperties;
import com.example.lowcode.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    @Autowired
    private AuthService authService;
    @Autowired
    private AuthProperties authProperties;

    @GetMapping("/status")
    public Map<String, Object> status() {
        Map<String, Object> m = new HashMap<>();
        m.put("enabled", authProperties.isEnabled());
        return m;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> body) {
        try {
            String loginName = body.get("loginName") == null ? String.valueOf(body.get("username")) : String.valueOf(body.get("loginName"));
            String password = body.get("password") == null ? null : String.valueOf(body.get("password"));
            return authService.login(loginName, password);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, ex.getMessage(), ex);
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, ex.getMessage(), ex);
        }
    }

    @PostMapping("/logout")
    public Map<String, Object> logout() {
        authService.logout();
        return Map.of("status", "success");
    }

    @GetMapping("/me")
    public Map<String, Object> me() {
        try {
            return authService.me();
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not logged in", ex);
        }
    }

    /** Admin helper: re-sync permission catalog after installing demos. */
    @PostMapping("/refresh-permissions")
    public Map<String, Object> refreshPermissions() {
        authService.ensureLoginIfEnabled();
        authService.requirePermission("perm:config");
        authService.refreshRoleGrants();
        return Map.of("status", "success");
    }
}
