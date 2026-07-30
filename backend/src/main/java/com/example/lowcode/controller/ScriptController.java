package com.example.lowcode.controller;

import com.example.lowcode.service.ScriptService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/scripts")
public class ScriptController {
    private final ScriptService scriptService;

    public ScriptController(ScriptService scriptService) {
        this.scriptService = scriptService;
    }

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(required = false) String type) {
        return scriptService.list(type);
    }

    @GetMapping("/{scriptCode}")
    public Map<String, Object> get(@PathVariable String scriptCode) {
        return scriptService.get(scriptCode, true);
    }

    /**
     * Published ES module source for runtime import.
     * Only PUBLISHED FRONTEND_JS / PAGE_CONTROLLER scripts are served.
     */
    @GetMapping("/{scriptCode}.js")
    public ResponseEntity<String> getPublishedJs(@PathVariable String scriptCode) {
        Map<String, Object> runtime = scriptService.getPublishedRuntime(scriptCode);
        String content = String.valueOf(runtime.get("scriptContent"));
        Object version = runtime.get("version");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.valueOf("application/javascript"));
        headers.setCacheControl("no-cache");
        if (version != null) {
            headers.setETag("\"" + scriptCode + "-v" + version + "\"");
        }
        return new ResponseEntity<>(content, headers, HttpStatus.OK);
    }

    /** Metadata + content for runtime loaders (JSON envelope with version). */
    @GetMapping("/{scriptCode}/runtime")
    public Map<String, Object> getRuntime(@PathVariable String scriptCode) {
        return scriptService.getPublishedRuntime(scriptCode);
    }

    @PutMapping("/{scriptCode}")
    public Map<String, Object> save(@PathVariable String scriptCode, @RequestBody Map<String, Object> body) {
        return scriptService.save(scriptCode, body != null ? body : Map.of());
    }

    @PostMapping("/{scriptCode}/publish")
    public Map<String, Object> publish(@PathVariable String scriptCode) {
        return scriptService.publish(scriptCode);
    }

    @PostMapping("/{scriptCode}/disable")
    public Map<String, Object> disable(@PathVariable String scriptCode) {
        return scriptService.disable(scriptCode);
    }

    @DeleteMapping("/{scriptCode}")
    public Map<String, Object> delete(@PathVariable String scriptCode) {
        scriptService.delete(scriptCode);
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("status", "success");
        return res;
    }
}
