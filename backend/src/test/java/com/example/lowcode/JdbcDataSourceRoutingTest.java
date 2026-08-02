package com.example.lowcode;

import com.example.lowcode.service.JdbcDataSourceRegistry;
import com.example.lowcode.service.QueryEngineService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class JdbcDataSourceRoutingTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private JdbcDataSourceRegistry registry;
    @Autowired
    private QueryEngineService queryEngineService;

    private String ownerToken() throws Exception {
        MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginName\":\"owner\",\"password\":\"owner123\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String body = login.getResponse().getContentAsString();
        int i = body.indexOf("\"token\":\"");
        assertTrue(i >= 0, body);
        int start = i + 9;
        int end = body.indexOf('"', start);
        return body.substring(start, end);
    }

    @Test
    void defaultResolveAndPlatformTemplate() {
        assertEquals("default", registry.resolveDsCode(null, null));
        assertNotNull(registry.getTemplate("default"));
        assertNotNull(registry.platform());
    }

    @Test
    void unknownDsThrows() {
        assertThrows(Exception.class, () -> registry.getTemplate("ds_does_not_exist_xyz"));
    }

    @Test
    void queryBindingAndPageOverride() {
        jdbcTemplate.update("DELETE FROM lc_page_model WHERE page_code = 'pg_ds_route_test'", Map.of());
        jdbcTemplate.update("DELETE FROM lc_query_model WHERE query_code = 'q_ds_route_test'", Map.of());

        jdbcTemplate.update(
                """
                INSERT INTO lc_query_model(query_code, anchor_entity, sql_text, query_mode, data_source_code)
                VALUES ('q_ds_route_test', NULL, 'SELECT 1 AS ok', 'rawSql', NULL)
                """,
                Map.of()
        );
        assertEquals("default", registry.resolveDsCode(null, "q_ds_route_test"));

        // When query has no binding, default
        jdbcTemplate.update(
                "UPDATE lc_query_model SET data_source_code = NULL WHERE query_code = 'q_ds_route_test'",
                Map.of()
        );

        jdbcTemplate.update(
                """
                INSERT INTO lc_page_model(page_code, title, route_path, query_code, entity_code, config_json, data_source_code)
                VALUES ('pg_ds_route_test', 'DS Route', '/test/ds-route', 'q_ds_route_test', NULL, '{}'::jsonb, NULL)
                """,
                Map.of()
        );
        assertEquals("default", registry.resolveDsCode("pg_ds_route_test", "q_ds_route_test"));

        Map<String, Object> result = queryEngineService.executeSql("q_ds_route_test", Map.of(), java.util.List.of(), null);
        assertNotNull(result.get("rows"));
        assertEquals("default", result.get("dataSourceCode"));
    }

    @Test
    void disabledSecondaryDatasourceRejected() throws Exception {
        String token = ownerToken();
        // Create a secondary DS pointing at same platform URL but disabled after create
        mockMvc.perform(post("/api/v1/admin/data-sources")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "dsCode":"ds_route_disabled",
                                  "name":"Disabled route",
                                  "jdbcUrl":"jdbc:postgresql://127.0.0.1:5432/lowcode",
                                  "username":"lowcode",
                                  "password":"lowcode",
                                  "enabled":true
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/v1/admin/data-sources/ds_route_disabled")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false}"))
                .andExpect(status().isOk());

        jdbcTemplate.update(
                """
                INSERT INTO lc_query_model(query_code, sql_text, query_mode, data_source_code)
                VALUES ('q_ds_disabled', 'SELECT 1 AS ok', 'rawSql', 'ds_route_disabled')
                ON CONFLICT (query_code) DO UPDATE
                  SET data_source_code = EXCLUDED.data_source_code, sql_text = EXCLUDED.sql_text
                """,
                Map.of()
        );

        assertThrows(Exception.class, () ->
                queryEngineService.executeSql("q_ds_disabled", Map.of(), java.util.List.of(), null)
        );

        // cleanup
        jdbcTemplate.update("DELETE FROM lc_query_model WHERE query_code = 'q_ds_disabled'", Map.of());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/v1/admin/data-sources/ds_route_disabled")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }
}
