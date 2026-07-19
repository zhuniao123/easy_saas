package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class SqlRepoControllerTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testListSaveAndTrySelect() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_page_model WHERE query_code = 'q_repo_try'");
        jdbcTemplate.execute("DELETE FROM lc_query_model WHERE query_code = 'q_repo_try'");

        mockMvc.perform(put("/api/v1/sql-repo/q_repo_try")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "sqlText": "SELECT CAST(:n AS INTEGER) AS n, 'ok' AS label",
                              "queryMode": "rawSql",
                              "paramsJson": "[]"
                            }
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        mockMvc.perform(get("/api/v1/sql-repo"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.queryCode=='q_repo_try')]").exists());

        mockMvc.perform(post("/api/v1/sql-repo/q_repo_try/try")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"params\":{\"n\":7}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.rows[0].n").value(7));
    }

    @Test
    public void testTryRejectsDml() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_query_model WHERE query_code = 'q_repo_dml'");
        jdbcTemplate.execute(
                "INSERT INTO lc_query_model(query_code, sql_text, query_mode) VALUES ('q_repo_dml', 'SELECT 1', 'rawSql')");

        mockMvc.perform(post("/api/v1/sql-repo/q_repo_dml/try")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sqlText\":\"DELETE FROM lc_query_model\"}"))
                .andExpect(status().isBadRequest());
    }
}
