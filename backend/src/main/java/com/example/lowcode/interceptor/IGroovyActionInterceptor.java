package com.example.lowcode.interceptor;

import java.util.List;
import java.util.Map;

/**
 * Unified Groovy hook contract for query/action lifecycle (Slice 5 ScriptRuntime).
 * Existing scripts only need beforeQuery/afterQuery; new hooks have default no-ops.
 */
public interface IGroovyActionInterceptor {
    void beforeQuery(Map<String, Object> params);

    List<Map<String, Object>> afterQuery(List<Map<String, Object>> rows);

    default void beforeAction(String actionCode, Map<String, Object> params) {
        // optional
    }

    default Map<String, Object> afterAction(String actionCode, Map<String, Object> result) {
        return result;
    }

    default void onError(String phase, Exception error, Map<String, Object> context) {
        // optional isolation hook — do not rethrow unless intentional
    }
}
