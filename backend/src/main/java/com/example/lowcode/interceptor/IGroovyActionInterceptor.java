package com.example.lowcode.interceptor;

import java.util.List;
import java.util.Map;

public interface IGroovyActionInterceptor {
    void beforeQuery(Map<String, Object> params);
    List<Map<String, Object>> afterQuery(List<Map<String, Object>> rows);
}
