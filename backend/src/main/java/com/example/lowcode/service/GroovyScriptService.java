package com.example.lowcode.service;

import com.example.lowcode.interceptor.IGroovyActionInterceptor;
import groovy.lang.GroovyClassLoader;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GroovyScriptService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    
    private final GroovyClassLoader classLoader = new GroovyClassLoader();
    private final Map<String, Class<?>> compiledCache = new ConcurrentHashMap<>();

    public IGroovyActionInterceptor getInterceptor(String scriptCode) {
        if (scriptCode == null) return null;
        
        Class<?> cachedClass = compiledCache.get(scriptCode);
        if (cachedClass == null) {
            Map<String, Object> params = new HashMap<>();
            params.put("code", scriptCode);
            String source = jdbcTemplate.queryForObject(
                "SELECT script_content FROM lc_script WHERE script_code = :code AND script_type = 'BACKEND_GROOVY'",
                params,
                String.class
            );
            cachedClass = classLoader.parseClass(source);
            compiledCache.put(scriptCode, cachedClass);
        }
        
        try {
            return (IGroovyActionInterceptor) cachedClass.getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            throw new RuntimeException("Failed to instantiate Groovy hook: " + scriptCode, e);
        }
    }
}
