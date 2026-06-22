package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

@SpringBootTest
@AutoConfigureMockMvc
public class QueryControllerTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testExecuteQuery() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_query_model");
        jdbcTemplate.execute("DELETE FROM lc_entity_model");
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) VALUES ('users', 'users', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text, params_json) VALUES ('q_user', 'users', 'SELECT 1 as val FROM lc_entity_model WHERE entity_code = :code', '[\"code\"]'::jsonb)");

        mockMvc.perform(post("/api/v1/queries/q_user/execute")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"params\":{\"code\":\"users\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].val").value(1));
    }

    @Test
    public void testExecuteQueryWithDynamicSchema() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_query_model");
        jdbcTemplate.execute("DELETE FROM lc_entity_model");
        jdbcTemplate.execute("DROP TABLE IF EXISTS users CASCADE");
        jdbcTemplate.execute("CREATE TABLE users (username VARCHAR(50))");
        jdbcTemplate.execute("INSERT INTO users(username) VALUES ('alice')");
        
        // 1. Insert entity model for table "users"
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) " +
                "VALUES ('users', 'users', '[{\"field\":\"username\",\"label\":\"用户名\",\"type\":\"string\"}]'::jsonb)");
        
        // 2. Insert query model that has a mapped column (username) and a calculated/unrecognized fallback column (alias: total_score)
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text) " +
                "VALUES ('q_users_score', 'users', 'SELECT username, 100 AS total_score FROM users WHERE username = :code')");
        
        mockMvc.perform(post("/api/v1/queries/q_users_score/execute")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"params\":{\"code\":\"alice\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].username").value("alice"))
                .andExpect(jsonPath("$.rows[0].total_score").value(100))
                .andExpect(jsonPath("$.columns[0].field").value("username"))
                .andExpect(jsonPath("$.columns[0].label").value("用户名"))
                .andExpect(jsonPath("$.columns[0].type").value("string"))
                .andExpect(jsonPath("$.columns[1].field").value("total_score"))
                .andExpect(jsonPath("$.columns[1].label").value("total_score")) // Fallback to alias name!
                .andExpect(jsonPath("$.columns[1].type").value("integer")); // Deduced from JDBC type
    }

    @Test
    public void testQueryAndEntityConfiguration() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_query_model");
        jdbcTemplate.execute("DELETE FROM lc_entity_model");
        
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) " +
                "VALUES ('users', 'users', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text) " +
                "VALUES ('q_users_score', 'users', 'SELECT 1 as val')");

        // 1. Get query config
        mockMvc.perform(get("/api/v1/queries/q_users_score"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sqlText").value("SELECT 1 as val"));

        // 2. Post new query config
        mockMvc.perform(post("/api/v1/queries/q_users_score/configure")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sqlText\":\"SELECT 2 as val\"}"))
                .andExpect(status().isOk());

        // Verify query updated
        mockMvc.perform(get("/api/v1/queries/q_users_score"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sqlText").value("SELECT 2 as val"));

        // 3. Get entity config
        mockMvc.perform(get("/api/v1/pages/entities/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entityCode").value("users"));

        // 4. Post entity schema config
        mockMvc.perform(post("/api/v1/pages/entities/users/configure")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"fieldsJson\":\"[{\\\"field\\\":\\\"username\\\",\\\"label\\\":\\\"用户名\\\",\\\"type\\\":\\\"string\\\"}]\"}"))
                .andExpect(status().isOk());
    }

    @Test
    public void testExecuteRawSql() throws Exception {
        jdbcTemplate.execute("DROP TABLE IF EXISTS test_raw CASCADE");

        // Execute DDL statement via raw API
        mockMvc.perform(post("/api/v1/queries/execute-raw")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sql\":\"CREATE TABLE test_raw (id INT, val TEXT); INSERT INTO test_raw VALUES (1, 'RawData')\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        // Query database to verify table was created and data inserted
        Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM test_raw", Integer.class);
        assertThat(count).isEqualTo(1);
    }
}

