package com.example.lowcode;

import com.example.lowcode.service.QueryEngineService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
public class FilterOperatorTest {

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private QueryEngineService queryEngineService;

    @BeforeEach
    void seed() {
        jdbcTemplate.update("DELETE FROM lc_query_model WHERE query_code = 'q_filter_ops'", Map.of());
        jdbcTemplate.update(
                """
                INSERT INTO lc_query_model(query_code, sql_text, query_mode)
                VALUES (
                  'q_filter_ops',
                  'SELECT * FROM (VALUES
                     (1, ''alpha'', 10, DATE ''2024-01-01''),
                     (2, ''beta'', 20, DATE ''2024-06-15''),
                     (3, ''gamma'', 30, DATE ''2024-12-01'')
                   ) AS t(id, name, score, d)',
                  'rawSql'
                )
                """,
                Map.of()
        );
    }

    @Test
    @SuppressWarnings("unchecked")
    void ilikeAndEqAndBetweenAndIn() {
        Map<String, Object> r1 = queryEngineService.executeSql(
                "q_filter_ops",
                Map.of(),
                List.of(Map.of("field", "name", "type", "text", "operator", "ilike", "value", "alp"))
        );
        List<Map<String, Object>> rows1 = (List<Map<String, Object>>) r1.get("rows");
        assertEquals(1, rows1.size()); // alpha only (beta also contains 'a')

        Map<String, Object> r2 = queryEngineService.executeSql(
                "q_filter_ops",
                Map.of(),
                List.of(Map.of("field", "score", "type", "number", "operator", "eq", "value", 20))
        );
        List<Map<String, Object>> rows2 = (List<Map<String, Object>>) r2.get("rows");
        assertEquals(1, rows2.size());
        assertEquals(2, ((Number) rows2.get(0).get("id")).intValue());

        Map<String, Object> r3 = queryEngineService.executeSql(
                "q_filter_ops",
                Map.of(),
                List.of(Map.of(
                        "field", "score",
                        "type", "number",
                        "operator", "between",
                        "valueFrom", 15,
                        "valueTo", 25
                ))
        );
        List<Map<String, Object>> rows3 = (List<Map<String, Object>>) r3.get("rows");
        assertEquals(1, rows3.size());

        Map<String, Object> r4 = queryEngineService.executeSql(
                "q_filter_ops",
                Map.of(),
                List.of(Map.of("field", "id", "operator", "in", "value", "1,3"))
        );
        List<Map<String, Object>> rows4 = (List<Map<String, Object>>) r4.get("rows");
        assertEquals(2, rows4.size());
    }

    @Test
    @SuppressWarnings("unchecked")
    void legacySelectTypeStillEquals() {
        Map<String, Object> r = queryEngineService.executeSql(
                "q_filter_ops",
                Map.of(),
                List.of(Map.of("field", "name", "type", "select", "value", "beta"))
        );
        List<Map<String, Object>> rows = (List<Map<String, Object>>) r.get("rows");
        assertEquals(1, rows.size());
        assertTrue(String.valueOf(rows.get(0).get("name")).contains("beta"));
    }
}
