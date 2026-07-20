package com.example.lowcode.config;

import com.example.lowcode.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Maps HTTP routes to permission codes: page: / action: / query: / perm:config
 */
@Component
public class AuthzInterceptor implements HandlerInterceptor {
    @Autowired
    private AuthService authService;
    @Autowired
    private AuthProperties authProperties;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!authProperties.isEnabled()) {
            return true;
        }
        String path = request.getRequestURI();
        String method = request.getMethod();

        try {
            authService.ensureLoginIfEnabled();
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not logged in", ex);
        }

        try {
            String perm = resolvePermission(path, method, request);
            if (perm != null) {
                authService.requirePermission(perm);
            }
            return true;
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, ex.getMessage(), ex);
        }
    }

    private String resolvePermission(String path, String method, HttpServletRequest request) {
        if (path.endsWith("/") && path.length() > 1) {
            path = path.substring(0, path.length() - 1);
        }

        if (path.startsWith("/api/v1/auth/")) {
            return null;
        }

        if (path.startsWith("/api/v1/admin/")
                || path.startsWith("/api/v1/sql-repo")
                || path.startsWith("/api/v1/error-logs")
                || path.contains("/configure")
                || ("POST".equalsIgnoreCase(method) && path.equals("/api/v1/pages"))
                || ("DELETE".equalsIgnoreCase(method) && path.matches("/api/v1/pages/[^/]+$"))
                || ("PUT".equalsIgnoreCase(method) && path.matches("/api/v1/actions/[^/]+$"))
                || path.startsWith("/api/v1/scripts")) {
            return "perm:config";
        }

        if ("GET".equalsIgnoreCase(method) && path.matches("/api/v1/pages/[^/]+$")) {
            String pageCode = path.substring("/api/v1/pages/".length());
            return "page:" + pageCode;
        }
        if ("GET".equalsIgnoreCase(method) && path.equals("/api/v1/pages")) {
            return null;
        }

        if (path.matches("/api/v1/pages/[^/]+/entities/.*")) {
            return null; // entity meta: allow if logged in (page already checked when loading)
        }

        if (path.matches("/api/v1/pages/[^/]+/data.*") || path.matches("/api/v1/pages/[^/]+/logs")) {
            String pageCode = path.substring("/api/v1/pages/".length());
            pageCode = pageCode.substring(0, pageCode.indexOf('/'));
            return "page:" + pageCode;
        }

        if (path.matches("/api/v1/queries/[^/]+/execute")) {
            String q = path.substring("/api/v1/queries/".length());
            q = q.substring(0, q.indexOf('/'));
            return "query:" + q;
        }
        if (path.startsWith("/api/v1/queries/options/")) {
            String qc = request.getParameter("queryCode");
            if (qc != null && !qc.isBlank()) {
                return "query:" + qc;
            }
            return null;
        }
        if (path.matches("/api/v1/queries/[^/]+/introspect")
                || path.matches("/api/v1/queries/[^/]+/configure")
                || path.equals("/api/v1/queries/execute-raw")) {
            return "perm:config";
        }
        if (path.matches("/api/v1/queries/[^/]+$") && "GET".equalsIgnoreCase(method)) {
            String q = path.substring("/api/v1/queries/".length());
            return "query:" + q;
        }

        if (path.matches("/api/v1/actions/[^/]+/execute")) {
            String a = path.substring("/api/v1/actions/".length());
            a = a.substring(0, a.indexOf('/'));
            return "action:" + a;
        }

        if (path.startsWith("/api/v1/dicts")) {
            return null;
        }

        return null;
    }
}
