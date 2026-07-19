package com.example.lowcode.controller;

import com.example.lowcode.service.ActionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/actions")
public class ActionController {
    @Autowired
    private ActionService actionService;

    @PutMapping("/{actionCode}")
    public Map<String, Object> save(
            @PathVariable String actionCode,
            @RequestBody Map<String, Object> body) {
        try {
            actionService.saveAction(actionCode, body == null ? Map.of() : body);
            return Map.of("status", "success", "actionCode", actionCode);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }
    }

    @PostMapping("/{actionCode}/execute")
    public Map<String, Object> execute(
            @PathVariable String actionCode,
            @RequestBody(required = false) Map<String, Object> requestBody) {
        try {
            return actionService.execute(actionCode, requestBody == null ? Map.of() : requestBody);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, ex.getMessage(), ex);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, ex.getMessage(), ex);
        }
    }
}
