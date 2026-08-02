package com.example.lowcode;

import com.example.lowcode.service.QueryEngineService;
import com.example.lowcode.service.SnapshotService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
public class ObservabilityAndSnapshotTest {

    @Autowired
    private SnapshotService snapshotService;
    @Autowired
    private QueryEngineService queryEngineService;
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    @Test
    void snapshotsAndValidateSpec() {
        Map<String, Object> schema = snapshotService.schemaSnapshot();
        assertNotNull(schema.get("tables"));
        Map<String, Object> dsl = snapshotService.dslSnapshot();
        assertNotNull(dsl.get("pages"));
        Map<String, Object> sql = snapshotService.sqlRepoSnapshot();
        assertNotNull(sql.get("assets"));

        Map<String, Object> bad = snapshotService.validatePageSpec(Map.of());
        assertFalse(Boolean.TRUE.equals(bad.get("ok")));

        Map<String, Object> ok = snapshotService.validatePageSpec(Map.of(
                "pageCode", "demo_x",
                "query", Map.of("sqlText", "SELECT 1 AS id")
        ));
        assertTrue(Boolean.TRUE.equals(ok.get("ok")));
    }

    @Test
    void queryLogWritten() {
        jdbcTemplate.update(
                """
                INSERT INTO lc_query_model(query_code, sql_text, query_mode)
                VALUES ('q_obs_smoke', 'SELECT 1 AS ok', 'rawSql')
                ON CONFLICT (query_code) DO UPDATE SET sql_text = EXCLUDED.sql_text
                """,
                Map.of()
        );
        queryEngineService.executeSql("q_obs_smoke", Map.of(), List.of());
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM lc_query_log WHERE query_code = 'q_obs_smoke'",
                Map.of(),
                Integer.class
        );
        assertNotNull(n);
        assertTrue(n > 0);
    }
}
