package com.example.lowcode.config;

import cn.dev33.satoken.interceptor.SaInterceptor;
import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpUtil;
import com.example.lowcode.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
public class SaTokenConfig implements WebMvcConfigurer {

    @Autowired
    private AuthProperties authProperties;
    @Autowired
    private AuthzInterceptor authzInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        if (!authProperties.isEnabled()) {
            return;
        }
        registry.addInterceptor(new SaInterceptor(handle -> StpUtil.checkLogin()))
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/v1/auth/login",
                        "/api/v1/auth/status"
                );
        registry.addInterceptor(authzInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/v1/auth/login",
                        "/api/v1/auth/status"
                );
    }

    @Bean
    public StpInterface stpInterface(AuthService authService) {
        return new StpInterface() {
            @Override
            public List<String> getPermissionList(Object loginId, String loginType) {
                long uid = Long.parseLong(String.valueOf(loginId));
                return authService.getPermissionList(uid);
            }

            @Override
            public List<String> getRoleList(Object loginId, String loginType) {
                long uid = Long.parseLong(String.valueOf(loginId));
                return authService.getRoleList(uid);
            }
        };
    }
}
