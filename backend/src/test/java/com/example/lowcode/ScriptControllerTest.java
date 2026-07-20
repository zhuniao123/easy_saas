package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class ScriptControllerTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testGetJsScript() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_script WHERE script_code = 'test_act'");
        jdbcTemplate.execute("INSERT INTO lc_script(script_code, script_type, script_content) VALUES ('test_act', 'FRONTEND_JS', 'console.log(\"hello\");')");

        mockMvc.perform(get("/api/v1/scripts/test_act.js"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/javascript"))
                .andExpect(content().string("console.log(\"hello\");"));
    }
}
