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

    private void wipeQueryEntity(String queryCode, String entityCode) {
        jdbcTemplate.execute("DELETE FROM lc_page_model WHERE query_code = '" + queryCode + "' OR entity_code = '" + entityCode + "'");
        jdbcTemplate.execute("DELETE FROM lc_query_model WHERE query_code = '" + queryCode + "'");
        jdbcTemplate.execute("DELETE FROM lc_entity_model WHERE entity_code = '" + entityCode + "'");
    }

    @Test
    public void testExecuteQuery() throws Exception {
        wipeQueryEntity("q_user", "entity_t_users");
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) VALUES ('entity_t_users', 'lc_entity_model', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text, params_json) VALUES ('q_user', 'entity_t_users', 'SELECT 1 as val FROM lc_entity_model WHERE entity_code = :code', '[\"code\"]'::jsonb)");

        mockMvc.perform(post("/api/v1/queries/q_user/execute")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"params\":{\"code\":\"entity_t_users\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].val").value(1));
    }

    @Test
    public void testExecuteQueryWithDynamicSchema() throws Exception {
        wipeQueryEntity("q_users_score", "entity_t_users2");
        jdbcTemplate.execute("DROP TABLE IF EXISTS t_users_score CASCADE");
        jdbcTemplate.execute("CREATE TABLE t_users_score (username VARCHAR(50))");
        jdbcTemplate.execute("INSERT INTO t_users_score(username) VALUES ('alice')");

        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) " +
                "VALUES ('entity_t_users2', 't_users_score', '[{\"field\":\"username\",\"label\":\"用户名\",\"type\":\"string\"}]'::jsonb)");

        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text) " +
                "VALUES ('q_users_score', 'entity_t_users2', 'SELECT username, 100 AS total_score FROM t_users_score WHERE username = :code')");

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
                .andExpect(jsonPath("$.columns[1].label").value("total_score"))
                .andExpect(jsonPath("$.columns[1].type").value("integer"));
    }

    @Test
    public void testQueryAndEntityConfiguration() throws Exception {
        wipeQueryEntity("q_users_score_cfg", "entity_t_users3");

        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) " +
                "VALUES ('entity_t_users3', 'lc_entity_model', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text) " +
                "VALUES ('q_users_score_cfg', 'entity_t_users3', 'SELECT 1 as val')");

        mockMvc.perform(get("/api/v1/queries/q_users_score_cfg"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sqlText").value("SELECT 1 as val"));

        mockMvc.perform(post("/api/v1/queries/q_users_score_cfg/configure")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sqlText\":\"SELECT 2 as val\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/queries/q_users_score_cfg"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sqlText").value("SELECT 2 as val"));

        mockMvc.perform(get("/api/v1/pages/entities/entity_t_users3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entityCode").value("entity_t_users3"));

        mockMvc.perform(post("/api/v1/pages/entities/entity_t_users3/configure")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"fieldsJson\":\"[{\\\"field\\\":\\\"username\\\",\\\"label\\\":\\\"用户名\\\",\\\"type\\\":\\\"string\\\"}]\"}"))
                .andExpect(status().isOk());
    }

    @Test
    public void testExecuteRawSql() throws Exception {
        jdbcTemplate.execute("DROP TABLE IF EXISTS test_raw CASCADE");

        mockMvc.perform(post("/api/v1/queries/execute-raw")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sql\":\"CREATE TABLE test_raw (id INT, val TEXT); INSERT INTO test_raw VALUES (1, 'RawData')\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM test_raw", Integer.class);
        assertThat(count).isEqualTo(1);
    }

    @Test
    public void testExecuteQueryWithFiltersAndBlankParams() throws Exception {
        wipeQueryEntity("q_supplier_filter", "entity_t_supplier");
        jdbcTemplate.execute("DROP TABLE IF EXISTS biz_supplier CASCADE");
        jdbcTemplate.execute("CREATE TABLE biz_supplier (id BIGSERIAL PRIMARY KEY, supplier_code VARCHAR(50), supplier_name VARCHAR(100), status VARCHAR(20))");
        jdbcTemplate.execute("INSERT INTO biz_supplier(supplier_code, supplier_name, status) VALUES ('S001', 'Acme', 'enabled'), ('S002', 'Bravo', 'disabled')");
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, primary_key, fields_json) VALUES ('entity_t_supplier', 'biz_supplier', 'id', '[{\"field\":\"supplier_code\",\"label\":\"Code\",\"type\":\"string\"},{\"field\":\"supplier_name\",\"label\":\"Name\",\"type\":\"string\"},{\"field\":\"status\",\"label\":\"Status\",\"type\":\"string\"}]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text, params_json) VALUES ('q_supplier_filter', 'entity_t_supplier', 'SELECT id, supplier_code, supplier_name, status FROM biz_supplier WHERE (CAST(:status AS VARCHAR) IS NULL OR status = :status)', '[\"status\"]'::jsonb)");

        mockMvc.perform(post("/api/v1/queries/q_supplier_filter/execute")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"params\":{\"status\":null},\"filters\":[{\"field\":\"supplier_code\",\"type\":\"text\",\"value\":\"S001\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].supplier_code").value("S001"));
    }

    @Test
    public void testQueryIntrospectionSuggestsPageAndEntityConfig() throws Exception {
        wipeQueryEntity("q_t_customer", "entity_t_customer");
        jdbcTemplate.execute("DROP TABLE IF EXISTS biz_customer CASCADE");
        jdbcTemplate.execute("CREATE TABLE biz_customer (customer_id BIGSERIAL PRIMARY KEY, customer_code VARCHAR(50), customer_name VARCHAR(100), active BOOLEAN)");
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, primary_key, fields_json) VALUES ('entity_t_customer', 'biz_customer', 'customer_id', '[{\"field\":\"customer_name\",\"label\":\"Customer Name\",\"format\":\"text\"}]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text) VALUES ('q_t_customer', 'entity_t_customer', 'SELECT customer_id, customer_code, customer_name, active FROM biz_customer')");

        mockMvc.perform(post("/api/v1/queries/q_t_customer/introspect")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.primaryKey").value("customer_id"))
                .andExpect(jsonPath("$.pageConfig.table.columns[0].field").value("customer_id"))
                .andExpect(jsonPath("$.pageConfig.table.filters[0].field").value("customer_id"))
                .andExpect(jsonPath("$.entityFields[2].field").value("customer_name"))
                .andExpect(jsonPath("$.entityFields[2].label").value("Customer Name"));
    }

    @Test
    public void testProvideOptionsEndpoint() throws Exception {
        wipeQueryEntity("q_t_get_ops", "entity_t_op");
        jdbcTemplate.execute("DROP TABLE IF EXISTS test_options CASCADE");
        jdbcTemplate.execute("CREATE TABLE test_options (op_code VARCHAR(20), op_name VARCHAR(50))");
        jdbcTemplate.execute("INSERT INTO test_options VALUES ('A', 'Alpha'), ('B', 'Beta')");
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) VALUES ('entity_t_op', 'test_options', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text) VALUES ('q_t_get_ops', 'entity_t_op', 'SELECT op_code, op_name FROM test_options')");

        mockMvc.perform(get("/api/v1/queries/options/provide")
                .param("queryCode", "q_t_get_ops")
                .param("labelField", "op_name")
                .param("valueField", "op_code"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].label").value("Alpha"))
                .andExpect(jsonPath("$[0].value").value("A"))
                .andExpect(jsonPath("$[1].label").value("Beta"))
                .andExpect(jsonPath("$[1].value").value("B"));
    }

    @Test
    public void testSuggestOptionsEndpoint() throws Exception {
        wipeQueryEntity("q_t_sug", "entity_t_sug");
        jdbcTemplate.execute("DROP TABLE IF EXISTS test_suggest CASCADE");
        jdbcTemplate.execute("CREATE TABLE test_suggest (code VARCHAR(20), name VARCHAR(50))");
        jdbcTemplate.execute("INSERT INTO test_suggest VALUES ('C1', 'China'), ('US', 'USA')");
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) VALUES ('entity_t_sug', 'test_suggest', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text, params_json) VALUES ('q_t_sug', 'entity_t_sug', 'SELECT code, name FROM test_suggest WHERE name ILIKE :kw', '[\"kw\"]'::jsonb)");

        mockMvc.perform(get("/api/v1/queries/options/suggest")
                .param("queryCode", "q_t_sug")
                .param("labelField", "name")
                .param("valueField", "code")
                .param("keyword", "China")
                .param("keywordParam", "kw"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].label").value("China"))
                .andExpect(jsonPath("$[0].value").value("C1"));
    }
}
