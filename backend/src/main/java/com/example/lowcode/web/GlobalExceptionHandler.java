package com.example.lowcode.web;

import cn.dev33.satoken.exception.NotLoginException;
import cn.dev33.satoken.exception.NotPermissionException;
import com.example.lowcode.service.ErrorLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @Autowired
    private ErrorLogService errorLogService;

    @ExceptionHandler(NotLoginException.class)
    public ResponseEntity<Map<String, Object>> handleNotLogin(NotLoginException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorBody("UNAUTHORIZED", "Not logged in"));
    }

    @ExceptionHandler(NotPermissionException.class)
    public ResponseEntity<Map<String, Object>> handleNotPerm(NotPermissionException ex, HttpServletRequest req) {
        errorLogService.log("api", req.getRequestURI(), req.getMethod(),
                "NotPermissionException", ex.getMessage(), ex, null);
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorBody("FORBIDDEN", ex.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex, HttpServletRequest req) {
        errorLogService.log("api", req.getRequestURI(), req.getMethod(),
                ex.getClass().getSimpleName(), ex.getMessage(), ex, null);
        return ResponseEntity.badRequest().body(errorBody("BAD_REQUEST", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleConflict(IllegalStateException ex, HttpServletRequest req) {
        errorLogService.log("api", req.getRequestURI(), req.getMethod(),
                ex.getClass().getSimpleName(), ex.getMessage(), ex, null);
        return ResponseEntity.status(HttpStatus.CONFLICT).body(errorBody("CONFLICT", ex.getMessage()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleStatus(ResponseStatusException ex, HttpServletRequest req) {
        String msg = ex.getReason() != null ? ex.getReason() : ex.getMessage();
        if (ex.getStatusCode().is5xxServerError() || ex.getStatusCode().value() >= 400) {
            errorLogService.log("api", req.getRequestURI(), req.getMethod(),
                    "ResponseStatusException", msg, ex, null);
        }
        return ResponseEntity.status(ex.getStatusCode()).body(errorBody(ex.getStatusCode().toString(), msg));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleOther(Exception ex, HttpServletRequest req) {
        errorLogService.log("api", req.getRequestURI(), req.getMethod(),
                ex.getClass().getName(), ex.getMessage(), ex, null);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(errorBody("INTERNAL_ERROR", ex.getMessage() != null ? ex.getMessage() : "Unexpected error"));
    }

    private Map<String, Object> errorBody(String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "error");
        body.put("code", code);
        body.put("message", message);
        body.put("error", message);
        return body;
    }
}
