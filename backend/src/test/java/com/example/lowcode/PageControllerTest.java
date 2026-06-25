package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

@SpringBootTest
@AutoConfigureMockMvc
public class PageControllerTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testGetPageConfig() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_page_model");
        jdbcTemplate.execute("INSERT INTO lc_page_model (page_code, title, route_path, config_json) VALUES ('test_page', 'Test Title', '/test', '{\"filters\":[]}'::jsonb)");

        mockMvc.perform(get("/api/v1/pages/test_page"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pageCode").value("test_page"))
                .andExpect(jsonPath("$.title").value("Test Title"))
                .andExpect(jsonPath("$.config.filters").isEmpty());
    }
}
