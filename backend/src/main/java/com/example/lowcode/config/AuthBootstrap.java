package com.example.lowcode.config;

import com.example.lowcode.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class AuthBootstrap implements ApplicationRunner {
    @Autowired
    private AuthService authService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            authService.ensureSeedData();
            authService.refreshRoleGrants();
            authService.applyClerkDefaultsIfNeeded();
        } catch (Exception ex) {
            System.err.println("[AuthBootstrap] seed failed: " + ex.getMessage());
        }
    }
}
