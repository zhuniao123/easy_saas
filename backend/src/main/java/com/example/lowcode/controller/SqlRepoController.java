package com.example.lowcode.controller;

import com.example.lowcode.service.SqlRepoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/sql-repo")
public class SqlRepoController {
    @Autowired
    private SqlRepoService sqlRepoService;

    @GetMapping
    public List<Map<String, Object>> list() {
        return sqlRepoService.listAssets();
    }

    @GetMapping("/{queryCode}")
    public Map<String, Object> get(@PathVariable String queryCode) {
        try {
            return sqlRepoService.getAsset(queryCode);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "SQL asset not found: " + queryCode, ex);
        }
    }

    @PutMapping("/{queryCode}")
    public Map<String, Object> save(@PathVariable String queryCode, @RequestBody Map<String, Object> body) {
        try {
            sqlRepoService.saveAsset(queryCode, body);
            Map<String, Object> res = new HashMap<>();
            res.put("status", "success");
            res.put("queryCode", queryCode);
            return res;
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
    }

    @PostMapping("/{queryCode}/try")
    public Map<String, Object> tryRun(@PathVariable String queryCode, @RequestBody(required = false) Map<String, Object> body) {
        try {
            Map<String, Object> result = sqlRepoService.tryRun(queryCode, body == null ? Map.of() : body);
            if ("error".equals(result.get("status"))) {
                // still 200 with error payload for playground UX, or 400
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, String.valueOf(result.get("error")));
            }
            return result;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage(), ex);
        }
    }
}
