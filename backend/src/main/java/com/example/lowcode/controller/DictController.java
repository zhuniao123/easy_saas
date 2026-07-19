package com.example.lowcode.controller;

import com.example.lowcode.service.DictService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/dicts")
public class DictController {
    @Autowired
    private DictService dictService;

    @GetMapping
    public List<Map<String, Object>> listTypes() {
        return dictService.listTypes();
    }

    @GetMapping("/{dictCode}/items")
    public List<Map<String, Object>> listItems(
            @PathVariable String dictCode,
            @RequestParam(defaultValue = "true") boolean enabledOnly) {
        return dictService.listItems(dictCode, enabledOnly);
    }

    @GetMapping("/{dictCode}/options")
    public List<Map<String, Object>> listOptions(@PathVariable String dictCode) {
        return dictService.listOptions(dictCode);
    }
}
