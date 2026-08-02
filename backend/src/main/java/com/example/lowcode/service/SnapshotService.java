package com.example.lowcode.service;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only snapshots for AI / CLI quality gates (schema, DSL catalog, SQL repo).
 */
@Service
public class SnapshotService {
    private final NamedParameterJdbcTemplate jdbcTemplate;
    private final SqlRepoService sqlRepoService;

    public SnapshotService(NamedParameterJdbcTemplate jdbcTemplate, SqlRepoService sqlRepoService) {
        this.jdbcTemplate = jdbcTemplate;
        this.sqlRepoService = sqlRepoService;
    }

    public Map<String, Object> schemaSnapshot() {
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> tables = jdbcTemplate.query(
                """
                SELECT table_name AS "tableName"
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                Map.of(),
                (rs, i) -> Map.of("tableName", rs.getString("tableName"))
        );
        List<Map<String, Object>> columns = jdbcTemplate.query(
                """
                SELECT table_name AS "tableName", column_name AS "columnName",
                       data_type AS "dataType", is_nullable AS "isNullable"
                FROM information_schema.columns
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position
                """,
                Map.of(),
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("tableName", rs.getString("tableName"));
                    m.put("columnName", rs.getString("columnName"));
                    m.put("dataType", rs.getString("dataType"));
                    m.put("isNullable", rs.getString("isNullable"));
                    return m;
                }
        );
        out.put("tables", tables);
        out.put("columns", columns);
        out.put("kind", "schema");
        return out;
    }

    public Map<String, Object> dslSnapshot() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "dsl");
        out.put("pages", jdbcTemplate.query(
                """
                SELECT page_code AS "pageCode", title, route_path AS "routePath",
                       query_code AS "queryCode", entity_code AS "entityCode",
                       data_source_code AS "dataSourceCode"
                FROM lc_page_model ORDER BY page_code
                """,
                Map.of(),
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("pageCode", rs.getString("pageCode"));
                    m.put("title", rs.getString("title"));
                    m.put("routePath", rs.getString("routePath"));
                    m.put("queryCode", rs.getString("queryCode"));
                    m.put("entityCode", rs.getString("entityCode"));
                    m.put("dataSourceCode", rs.getString("dataSourceCode"));
                    return m;
                }
        ));
        out.put("entities", jdbcTemplate.query(
                """
                SELECT entity_code AS "entityCode", table_name AS "tableName", primary_key AS "primaryKey"
                FROM lc_entity_model ORDER BY entity_code
                """,
                Map.of(),
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("entityCode", rs.getString("entityCode"));
                    m.put("tableName", rs.getString("tableName"));
                    m.put("primaryKey", rs.getString("primaryKey"));
                    return m;
                }
        ));
        out.put("actions", jdbcTemplate.query(
                """
                SELECT action_code AS "actionCode", action_type AS "actionType", label, enabled
                FROM lc_action ORDER BY action_code
                """,
                Map.of(),
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("actionCode", rs.getString("actionCode"));
                    m.put("actionType", rs.getString("actionType"));
                    m.put("label", rs.getString("label"));
                    m.put("enabled", rs.getBoolean("enabled"));
                    return m;
                }
        ));
        out.put("dicts", jdbcTemplate.query(
                """
                SELECT dict_code AS "dictCode", name FROM lc_dict_type ORDER BY dict_code
                """,
                Map.of(),
                (rs, i) -> Map.of("dictCode", rs.getString("dictCode"), "name", rs.getString("name"))
        ));
        return out;
    }

    public Map<String, Object> sqlRepoSnapshot() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", "sql-repo");
        out.put("assets", sqlRepoService.listAssets());
        return out;
    }

    /**
     * Lightweight PageSpec dry-run validation without writes.
     */
    public Map<String, Object> validatePageSpec(Map<String, Object> spec) {
        Map<String, Object> report = new LinkedHashMap<>();
        List<String> errors = new java.util.ArrayList<>();
        List<String> warnings = new java.util.ArrayList<>();
        if (spec == null || spec.isEmpty()) {
            errors.add("spec is empty");
            report.put("ok", false);
            report.put("errors", errors);
            return report;
        }
        String pageCode = str(spec.get("pageCode"));
        if (pageCode.isBlank()) {
            errors.add("pageCode is required");
        }
        Object query = spec.get("query");
        if (query instanceof Map<?, ?> q) {
            String sql = str(q.get("sqlText"));
            if (sql.isBlank()) {
                warnings.add("query.sqlText empty");
            } else {
                String lower = sql.toLowerCase();
                if (!(lower.contains("select") || lower.trim().startsWith("with"))) {
                    errors.add("query.sqlText should be SELECT/WITH for list pages");
                }
            }
        } else if (spec.get("queryCode") == null) {
            warnings.add("no query / queryCode in spec");
        }
        Object entity = spec.get("entity");
        if (entity instanceof Map<?, ?> e) {
            if (str(e.get("primaryKey")).isBlank()) {
                warnings.add("entity.primaryKey missing — CRUD may be read-only");
            }
        }
        report.put("ok", errors.isEmpty());
        report.put("errors", errors);
        report.put("warnings", warnings);
        report.put("pageCode", pageCode.isBlank() ? null : pageCode);
        return report;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }
}
