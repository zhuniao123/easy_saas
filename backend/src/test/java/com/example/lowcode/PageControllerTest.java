package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.assertj.core.api.Assertions.assertThat;

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

    @Test
    public void testUpdatePageConfig() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_page_model");
        jdbcTemplate.execute("INSERT INTO lc_page_model (page_code, title, route_path, config_json) VALUES ('cfg_page', 'Config Page', '/cfg', '{\"filters\":[],\"columns\":[],\"actions\":[]}'::jsonb)");

        mockMvc.perform(post("/api/v1/pages/cfg_page/configure")
                .contentType(APPLICATION_JSON)
                .content("{\"configJson\":\"{\\\"filters\\\":[{\\\"field\\\":\\\"username\\\",\\\"label\\\":\\\"Username\\\"}],\\\"columns\\\":[],\\\"actions\\\":[]}\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        mockMvc.perform(get("/api/v1/pages/cfg_page"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.config.filters[0].field").value("username"))
                .andExpect(jsonPath("$.config.filters[0].label").value("Username"));
    }

    @Test
    public void testCrudUsesConfiguredPrimaryKey() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_page_model");
        jdbcTemplate.execute("DELETE FROM lc_query_model");
        jdbcTemplate.execute("DELETE FROM lc_entity_model");
        jdbcTemplate.execute("DROP TABLE IF EXISTS biz_supplier CASCADE");
        jdbcTemplate.execute("CREATE TABLE biz_supplier (supplier_id BIGSERIAL PRIMARY KEY, supplier_code VARCHAR(50), supplier_name VARCHAR(100))");
        jdbcTemplate.execute("INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json) VALUES ('supplier', 'biz_supplier', 'supplier_id', '[{\"field\":\"supplier_id\",\"label\":\"ID\",\"type\":\"integer\"},{\"field\":\"supplier_code\",\"label\":\"Code\",\"type\":\"string\"},{\"field\":\"supplier_name\",\"label\":\"Name\",\"type\":\"string\"}]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode) VALUES ('q_supplier', 'supplier', 'SELECT supplier_id, supplier_code, supplier_name FROM biz_supplier ORDER BY supplier_id', 'singleTableTemplate')");
        jdbcTemplate.execute("INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES ('supplier_page', 'Suppliers', '/suppliers', 'q_supplier', 'supplier', '{}'::jsonb)");

        mockMvc.perform(get("/api/v1/pages/supplier_page"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.writable").value(true));

        mockMvc.perform(post("/api/v1/pages/supplier_page/data")
                .contentType(APPLICATION_JSON)
                .content("{\"supplier_code\":\"S001\",\"supplier_name\":\"Acme\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        Long supplierId = jdbcTemplate.queryForObject("SELECT supplier_id FROM biz_supplier WHERE supplier_code = 'S001'", Long.class);
        assertThat(supplierId).isNotNull();

        mockMvc.perform(put("/api/v1/pages/supplier_page/data/" + supplierId)
                .contentType(APPLICATION_JSON)
                .content("{\"supplier_id\":" + supplierId + ",\"supplier_code\":\"S001\",\"supplier_name\":\"Acme Updated\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        String updatedName = jdbcTemplate.queryForObject("SELECT supplier_name FROM biz_supplier WHERE supplier_id = " + supplierId, String.class);
        assertThat(updatedName).isEqualTo("Acme Updated");

        mockMvc.perform(delete("/api/v1/pages/supplier_page/data/" + supplierId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM biz_supplier WHERE supplier_id = " + supplierId, Integer.class);
        assertThat(count).isEqualTo(0);
    }

    @Test
    public void testRawSqlPageIsNotWritable() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_page_model WHERE page_code = 'raw_page'");
        jdbcTemplate.execute("DELETE FROM lc_query_model WHERE query_code = 'q_raw'");
        jdbcTemplate.execute("DELETE FROM lc_entity_model WHERE entity_code = 'entity_raw_ro'");
        jdbcTemplate.execute("INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json) VALUES ('entity_raw_ro', 'lc_entity_model', 'entity_code', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode) VALUES ('q_raw', 'entity_raw_ro', 'SELECT entity_code, table_name FROM lc_entity_model', 'rawSql')");
        jdbcTemplate.execute("INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES ('raw_page', 'Raw', '/raw-readonly', 'q_raw', 'entity_raw_ro', '{}'::jsonb)");

        mockMvc.perform(get("/api/v1/pages/raw_page"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.writable").value(false));

        mockMvc.perform(post("/api/v1/pages/raw_page/data")
                .contentType(APPLICATION_JSON)
                .content("{\"entity_code\":\"x\",\"table_name\":\"y\"}"))
                .andExpect(status().isForbidden());

        // cleanup so other test classes are not blocked by FK
        jdbcTemplate.execute("DELETE FROM lc_page_model WHERE page_code = 'raw_page'");
        jdbcTemplate.execute("DELETE FROM lc_query_model WHERE query_code = 'q_raw'");
        jdbcTemplate.execute("DELETE FROM lc_entity_model WHERE entity_code = 'entity_raw_ro'");
    }
}
