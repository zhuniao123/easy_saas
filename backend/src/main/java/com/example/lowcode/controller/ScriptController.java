package com.example.lowcode.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/scripts")
public class ScriptController {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    @GetMapping("/{scriptCode}.js")
    public ResponseEntity<String> getScript(@PathVariable String scriptCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("code", scriptCode);
        
        String jsContent = jdbcTemplate.queryForObject(
            "SELECT script_content FROM lc_script WHERE script_code = :code AND script_type = 'FRONTEND_JS'",
            params,
            String.class
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.valueOf("application/javascript"));
        return new ResponseEntity<>(jsContent, headers, HttpStatus.OK);
    }
}
