package com.example.lowcode.controller;

import com.example.lowcode.service.SnapshotService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/snapshots")
public class SnapshotController {
    private final SnapshotService snapshotService;

    public SnapshotController(SnapshotService snapshotService) {
        this.snapshotService = snapshotService;
    }

    @GetMapping("/schema")
    public Map<String, Object> schema() {
        return snapshotService.schemaSnapshot();
    }

    @GetMapping("/dsl")
    public Map<String, Object> dsl() {
        return snapshotService.dslSnapshot();
    }

    @GetMapping("/sql-repo")
    public Map<String, Object> sqlRepo() {
        return snapshotService.sqlRepoSnapshot();
    }

    @PostMapping("/validate-spec")
    public Map<String, Object> validateSpec(@RequestBody Map<String, Object> spec) {
        return snapshotService.validatePageSpec(spec == null ? Map.of() : spec);
    }
}
