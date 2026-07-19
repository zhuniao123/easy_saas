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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class ActionControllerTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testSqlTransactionFromCatalogCommits() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_action_log WHERE action_code = 'act_disable_item'");
        jdbcTemplate.execute("DELETE FROM lc_action WHERE action_code = 'act_disable_item'");
        jdbcTemplate.execute("DROP TABLE IF EXISTS act_demo_item CASCADE");
        jdbcTemplate.execute("CREATE TABLE act_demo_item (id BIGSERIAL PRIMARY KEY, name VARCHAR(50), status INT NOT NULL DEFAULT 1)");
        jdbcTemplate.execute("INSERT INTO act_demo_item(name, status) VALUES ('alpha', 1)");

        jdbcTemplate.execute("""
            INSERT INTO lc_action(action_code, action_type, label, config_json, enabled)
            VALUES (
              'act_disable_item',
              'sqlTransaction',
              'Disable',
              '{
                "type":"sqlTransaction",
                "successMessage":"disabled",
                "refresh":true,
                "bind":{"id":{"from":"row","field":"id","required":true},"status":{"from":"fixed","value":0}},
                "statements":[{"kind":"write","sql":"UPDATE act_demo_item SET status = :status WHERE id = :id"}]
              }'::jsonb,
              true
            )
            """);

        Long id = jdbcTemplate.queryForObject("SELECT id FROM act_demo_item WHERE name = 'alpha'", Long.class);

        mockMvc.perform(post("/api/v1/actions/act_disable_item/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pageCode\":\"any\",\"row\":{\"id\":" + id + ",\"status\":1}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.message").value("disabled"))
                .andExpect(jsonPath("$.refresh").value(true));

        Integer status = jdbcTemplate.queryForObject("SELECT status FROM act_demo_item WHERE id = " + id, Integer.class);
        assertThat(status).isEqualTo(0);

        Integer logs = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM lc_action_log WHERE action_code = 'act_disable_item' AND success = true",
                Integer.class);
        assertThat(logs).isGreaterThanOrEqualTo(1);
    }

    @Test
    public void testAssertFailureRollsBack() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_action WHERE action_code = 'act_assert_fail'");
        jdbcTemplate.execute("DROP TABLE IF EXISTS act_demo_stock CASCADE");
        jdbcTemplate.execute("CREATE TABLE act_demo_stock (id BIGSERIAL PRIMARY KEY, qty INT NOT NULL)");
        jdbcTemplate.execute("INSERT INTO act_demo_stock(qty) VALUES (1)");

        jdbcTemplate.execute("""
            INSERT INTO lc_action(action_code, action_type, label, config_json, enabled)
            VALUES (
              'act_assert_fail',
              'sqlTransaction',
              'Consume',
              '{
                "bind":{"id":{"from":"row","field":"id","required":true}},
                "statements":[
                  {"kind":"assert","sql":"SELECT (qty >= 5) AS ok FROM act_demo_stock WHERE id = :id"},
                  {"kind":"write","sql":"UPDATE act_demo_stock SET qty = qty - 5 WHERE id = :id"}
                ]
              }'::jsonb,
              true
            )
            """);

        Long id = jdbcTemplate.queryForObject("SELECT id FROM act_demo_stock LIMIT 1", Long.class);

        mockMvc.perform(post("/api/v1/actions/act_assert_fail/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"row\":{\"id\":" + id + "}}"))
                .andExpect(status().isConflict());

        Integer qty = jdbcTemplate.queryForObject("SELECT qty FROM act_demo_stock WHERE id = " + id, Integer.class);
        assertThat(qty).isEqualTo(1);
    }

    @Test
    public void testClientCannotInjectSqlBody() throws Exception {
        mockMvc.perform(post("/api/v1/actions/does_not_exist/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sql\":\"DELETE FROM act_demo_item\",\"row\":{}}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void testSqlAssetCodeResolvedFromRepository() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_action WHERE action_code = 'act_from_asset'");
        jdbcTemplate.execute("DELETE FROM lc_query_model WHERE query_code = 'sql_act_bump'");
        jdbcTemplate.execute("DROP TABLE IF EXISTS act_asset_t CASCADE");
        jdbcTemplate.execute("CREATE TABLE act_asset_t (id BIGSERIAL PRIMARY KEY, n INT NOT NULL DEFAULT 0)");
        jdbcTemplate.execute("INSERT INTO act_asset_t(n) VALUES (0)");
        jdbcTemplate.execute(
                "INSERT INTO lc_query_model(query_code, sql_text, query_mode) VALUES ("
                        + "'sql_act_bump', 'UPDATE act_asset_t SET n = n + 1 WHERE id = :id', 'dml')");
        jdbcTemplate.execute("""
            INSERT INTO lc_action(action_code, action_type, label, config_json, enabled)
            VALUES (
              'act_from_asset',
              'sqlTransaction',
              'Bump',
              '{
                "bind":{"id":{"from":"row","field":"id","required":true}},
                "statements":[{"kind":"write","sqlAssetCode":"sql_act_bump"}]
              }'::jsonb,
              true
            )
            """);

        Long id = jdbcTemplate.queryForObject("SELECT id FROM act_asset_t LIMIT 1", Long.class);
        mockMvc.perform(post("/api/v1/actions/act_from_asset/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"row\":{\"id\":" + id + "}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        Integer n = jdbcTemplate.queryForObject("SELECT n FROM act_asset_t WHERE id = " + id, Integer.class);
        assertThat(n).isEqualTo(1);
    }

    @Test
    public void testPageEmbeddedAction() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_page_model WHERE page_code = 'act_embed_page'");
        jdbcTemplate.execute("DROP TABLE IF EXISTS act_embed_t CASCADE");
        jdbcTemplate.execute("CREATE TABLE act_embed_t (id BIGSERIAL PRIMARY KEY, flag INT DEFAULT 0)");
        jdbcTemplate.execute("INSERT INTO act_embed_t(flag) VALUES (0)");
        Long id = jdbcTemplate.queryForObject("SELECT id FROM act_embed_t LIMIT 1", Long.class);

        String config = """
            {
              "table": {
                "actions": [
                  {
                    "code": "flip_flag",
                    "type": "sqlTransaction",
                    "sqlTransaction": {
                      "successMessage": "flipped",
                      "bind": {"id": {"from": "row", "field": "id", "required": true}},
                      "statements": [
                        {"sql": "UPDATE act_embed_t SET flag = 1 WHERE id = :id"}
                      ]
                    }
                  }
                ]
              }
            }
            """;

        jdbcTemplate.update(
                "INSERT INTO lc_page_model(page_code, title, route_path, config_json) VALUES (?,?,?,?::jsonb)",
                "act_embed_page", "Embed", "/act-embed", config);

        mockMvc.perform(post("/api/v1/actions/flip_flag/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pageCode\":\"act_embed_page\",\"row\":{\"id\":" + id + "}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("flipped"));

        Integer flag = jdbcTemplate.queryForObject("SELECT flag FROM act_embed_t WHERE id = " + id, Integer.class);
        assertThat(flag).isEqualTo(1);
    }
}
