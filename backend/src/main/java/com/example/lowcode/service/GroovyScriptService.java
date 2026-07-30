package com.example.lowcode.service;

import com.example.lowcode.interceptor.IGroovyActionInterceptor;
import com.example.lowcode.script.ScriptRuntimeService;
import org.springframework.stereotype.Service;

/**
 * Compatibility facade over unified {@link ScriptRuntimeService}.
 */
@Service
public class GroovyScriptService {
    private final ScriptRuntimeService scriptRuntimeService;

    public GroovyScriptService(ScriptRuntimeService scriptRuntimeService) {
        this.scriptRuntimeService = scriptRuntimeService;
    }

    public IGroovyActionInterceptor getInterceptor(String scriptCode) {
        return scriptRuntimeService.loadHook(scriptCode);
    }

    public void invalidate(String scriptCode) {
        scriptRuntimeService.invalidate(scriptCode);
    }
}
