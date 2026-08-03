package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Requires demo tables when present; otherwise creates ephemeral schema for the test.
 */
@SpringBootTest
@AutoConfigureMockMvc
public class MasterDetailServiceTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void saveDraftAndSubmitInOneTransaction() throws Exception {
        ensureSchema();
        String pageCode = "md_test_" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        seedPage(pageCode);

        String orderNo = "T-" + System.currentTimeMillis();
        String body = """
            {
              "mode": "draft",
              "header": {
                "order_no": "%s",
                "member_name": "Tester",
                "remark": "unit",
                "status": "draft",
                "version": 1
              },
              "lines": [
                {
                  "_rowState": "added",
                  "service_name": "A",
                  "staff_name": "S1",
                  "qty": 2,
                  "unit_price": 50,
                  "amount": 100
                },
                {
                  "_rowState": "added",
                  "service_name": "B",
                  "staff_name": "S2",
                  "qty": 1,
                  "unit_price": 30,
                  "amount": 30
                }
              ]
            }
            """.formatted(orderNo);

        MvcResult created = mockMvc.perform(
                        post("/api/v1/pages/" + pageCode + "/master-detail/save")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andExpect(status().isOk())
                .andReturn();

        String resp = created.getResponse().getContentAsString();
        assertTrue(resp.contains("\"status\":\"success\"") || resp.contains("success"));

        Integer headerId = jdbcTemplate.queryForObject(
                "SELECT id FROM md_order WHERE order_no = ?", Integer.class, orderNo);
        assertTrue(headerId != null && headerId > 0);

        Integer lineCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM md_order_line WHERE order_id = ?", Integer.class, headerId);
        assertEquals(2, lineCount);

        // submit
        Integer version = jdbcTemplate.queryForObject(
                "SELECT version FROM md_order WHERE id = ?", Integer.class, headerId);
        String submitBody = """
            {
              "mode": "submit",
              "header": {
                "id": %d,
                "order_no": "%s",
                "member_name": "Tester",
                "remark": "unit",
                "status": "draft",
                "version": %d
              },
              "lines": [
                { "_rowState": "unchanged", "id": %d }
              ]
            }
            """.formatted(
                headerId,
                orderNo,
                version,
                jdbcTemplate.queryForObject(
                        "SELECT id FROM md_order_line WHERE order_id = ? ORDER BY id LIMIT 1",
                        Integer.class,
                        headerId));

        // need at least one non-deleted line — include both as unchanged
        Integer line1 = jdbcTemplate.queryForObject(
                "SELECT id FROM md_order_line WHERE order_id = ? ORDER BY id LIMIT 1", Integer.class, headerId);
        Integer line2 = jdbcTemplate.queryForObject(
                "SELECT id FROM md_order_line WHERE order_id = ? ORDER BY id DESC LIMIT 1", Integer.class, headerId);
        submitBody = """
            {
              "mode": "submit",
              "header": {
                "id": %d,
                "order_no": "%s",
                "member_name": "Tester",
                "version": %d
              },
              "lines": [
                { "_rowState": "unchanged", "id": %d },
                { "_rowState": "unchanged", "id": %d }
              ]
            }
            """.formatted(headerId, orderNo, version, line1, line2);

        mockMvc.perform(
                        post("/api/v1/pages/" + pageCode + "/master-detail/save")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(submitBody))
                .andExpect(status().isOk());

        String statusVal = jdbcTemplate.queryForObject(
                "SELECT status FROM md_order WHERE id = ?", String.class, headerId);
        assertEquals("submitted", statusVal);
        Integer v2 = jdbcTemplate.queryForObject(
                "SELECT version FROM md_order WHERE id = ?", Integer.class, headerId);
        assertEquals(version + 1, v2);

        // cleanup page meta only
        jdbcTemplate.update("DELETE FROM lc_page_model WHERE page_code = ?", pageCode);
        jdbcTemplate.update("DELETE FROM lc_query_model WHERE query_code LIKE ?", "q_" + pageCode + "%");
        jdbcTemplate.update("DELETE FROM md_order_line WHERE order_id = ?", headerId);
        jdbcTemplate.update("DELETE FROM md_order WHERE id = ?", headerId);
    }

    private void ensureSchema() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS md_order (
              id SERIAL PRIMARY KEY,
              order_no VARCHAR(40) NOT NULL,
              member_name VARCHAR(100) NOT NULL DEFAULT '',
              status VARCHAR(30) NOT NULL DEFAULT 'draft',
              remark VARCHAR(500),
              version INTEGER NOT NULL DEFAULT 1,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS md_order_line (
              id SERIAL PRIMARY KEY,
              order_id INTEGER NOT NULL REFERENCES md_order(id) ON DELETE CASCADE,
              service_name VARCHAR(120) NOT NULL DEFAULT '',
              staff_name VARCHAR(80) NOT NULL DEFAULT '',
              qty NUMERIC(12,2) NOT NULL DEFAULT 1,
              unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
              amount NUMERIC(12,2) NOT NULL DEFAULT 0
            )
            """);

        jdbcTemplate.update("""
            INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json)
            VALUES ('entity_md_order', 'md_order', 'id',
              '[{"field":"id"},{"field":"order_no"},{"field":"member_name"},{"field":"status"},{"field":"remark"},{"field":"version"}]'::jsonb)
            ON CONFLICT (entity_code) DO NOTHING
            """);
        jdbcTemplate.update("""
            INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json)
            VALUES ('entity_md_order_line', 'md_order_line', 'id',
              '[{"field":"id"},{"field":"order_id"},{"field":"service_name"},{"field":"staff_name"},{"field":"qty"},{"field":"unit_price"},{"field":"amount"}]'::jsonb)
            ON CONFLICT (entity_code) DO NOTHING
            """);
    }

    private void seedPage(String pageCode) {
        String config = """
            {
              "masterDetail": {
                "enabled": true,
                "draftStatus": "draft",
                "submitStatus": "submitted",
                "header": {
                  "entityCode": "entity_md_order",
                  "primaryKey": "id",
                  "versionField": "version",
                  "statusField": "status",
                  "requiredMemberField": "member_name",
                  "fields": ["order_no","member_name","status","remark","version"]
                },
                "lines": {
                  "entityCode": "entity_md_order_line",
                  "primaryKey": "id",
                  "fkField": "order_id",
                  "fields": ["service_name","staff_name","qty","unit_price","amount"]
                }
              },
              "features": { "create": false, "edit": false, "delete": false },
              "table": { "columns": [], "filters": [], "actions": [] }
            }
            """;
        jdbcTemplate.update(
                """
                INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json)
                VALUES (?, ?, ?, NULL, 'entity_md_order', ?::jsonb)
                ON CONFLICT (page_code) DO UPDATE SET config_json = EXCLUDED.config_json
                """,
                pageCode, "MD Test", "/t/" + pageCode, config);
        // grant open auth bypass in tests if auth off; Authz may allow when auth disabled
    }
}
