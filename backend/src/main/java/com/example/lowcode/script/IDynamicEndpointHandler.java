package com.example.lowcode.script;

/**
 * Groovy dynamic endpoint contract.
 * Implement in BACKEND_GROOVY scripts referenced by lc_dynamic_endpoint.script_code.
 */
public interface IDynamicEndpointHandler {
    Object handle(DynamicContext ctx) throws Exception;
}
