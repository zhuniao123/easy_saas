package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class ConfigValidationAndDictTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testDictOptions() throws Exception {
        mockMvc.perform(get("/api/v1/dicts/common.enabled_status/options"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].value").exists())
                .andExpect(jsonPath("$[0].label").exists());
    }

    @Test
    public void testPageConfigRejectsMissingQuery() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_page_model WHERE page_code = 'val_page'");
        jdbcTemplate.execute(
                "INSERT INTO lc_page_model(page_code, title, route_path, config_json) VALUES ('val_page','V','/val','{}'::jsonb)");

        mockMvc.perform(post("/api/v1/pages/val_page/configure")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"configJson\":\"{\\\"dataSource\\\":{\\\"queryCode\\\":\\\"q_does_not_exist_xyz\\\"},\\\"table\\\":{\\\"columns\\\":[],\\\"filters\\\":[],\\\"actions\\\":[]}}\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void testSqlRepoRejectsSemicolon() throws Exception {
        mockMvc.perform(put("/api/v1/sql-repo/q_val_bad")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sqlText\":\"SELECT 1; DROP TABLE x\",\"queryMode\":\"rawSql\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void testActionSaveValidationAndErrorLog() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_action WHERE action_code = 'act_val_ok'");
        jdbcTemplate.execute("DELETE FROM lc_query_model WHERE query_code = 'sql_val_ok'");
        jdbcTemplate.execute(
                "INSERT INTO lc_query_model(query_code, sql_text, query_mode) VALUES ('sql_val_ok','UPDATE shop_product SET status=1 WHERE id=:id','dml')");

        mockMvc.perform(put("/api/v1/actions/act_val_ok")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "label": "OK",
                              "actionType": "sqlTransaction",
                              "config": {
                                "bind": {"id": {"from": "row", "field": "id", "required": true}},
                                "statements": [{"kind": "write", "sqlAssetCode": "sql_val_ok"}]
                              }
                            }
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        mockMvc.perform(put("/api/v1/actions/act_val_bad")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                              "label": "BAD",
                              "config": {
                                "statements": [{"kind": "write", "sqlAssetCode": "missing_asset_zzz"}]
                              }
                            }
                            """))
                .andExpect(status().isBadRequest());

        Integer errors = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM lc_error_log", Integer.class);
        assertThat(errors).isNotNull();
        assertThat(errors).isGreaterThanOrEqualTo(1);
    }
}
