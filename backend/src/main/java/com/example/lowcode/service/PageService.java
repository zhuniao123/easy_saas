package com.example.lowcode.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class PageService {
    private static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private JdbcDataSourceRegistry jdbcDataSourceRegistry;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private ConfigValidationService configValidationService;
    @Autowired
    private AuthService authService;
    @Autowired
    private AuthzRuntimeService authzRuntimeService;
    @Autowired
    private ConfigAuditService configAuditService;
    @Autowired
    private MetadataCacheService metadataCacheService;

    private String requireSafeIdentifier(String value, String fieldName) {
        if (value == null || !SAFE_IDENTIFIER.matcher(value).matches()) {
            throw new IllegalArgumentException(fieldName + " must be a safe SQL identifier");
        }
        return value;
    }

    public Map<String, Object> getPageConfig(String pageCode) {
        return metadataCacheService.getOrLoad("page:" + pageCode, 20_000L, () -> {
            Map<String, Object> params = new HashMap<>();
            params.put("pageCode", pageCode);
            return jdbcTemplate.queryForObject(
                """
                SELECT page_code as "pageCode", title, route_path as "routePath",
                       query_code as "queryCode", entity_code as "entityCode",
                       config_json::text as "config",
                       data_source_code as "dataSourceCode"
                FROM lc_page_model WHERE page_code = :pageCode
                """,
                params,
                (rs, rowNum) -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("pageCode", rs.getString("pageCode"));
                    map.put("title", rs.getString("title"));
                    map.put("routePath", rs.getString("routePath"));
                    map.put("queryCode", rs.getString("queryCode"));
                    map.put("entityCode", rs.getString("entityCode"));
                    map.put("config", rs.getString("config"));
                    map.put("dataSourceCode", rs.getString("dataSourceCode"));
                    return map;
                }
            );
        });
    }

    public void updatePageDataSource(String pageCode, String dataSourceCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("pageCode", pageCode);
        params.put("ds", dataSourceCode == null || dataSourceCode.isBlank() ? null : dataSourceCode.trim());
        if (params.get("ds") != null) {
            // ensure catalog entry exists (or default)
            String ds = String.valueOf(params.get("ds"));
            if (!JdbcDataSourceRegistry.DEFAULT_DS.equalsIgnoreCase(ds)) {
                Integer n = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM lc_data_source WHERE ds_code = :code",
                        Map.of("code", ds),
                        Integer.class
                );
                if (n == null || n == 0) {
                    throw new IllegalArgumentException("Unknown data source: " + ds);
                }
            }
        }
        jdbcTemplate.update(
                "UPDATE lc_page_model SET data_source_code = :ds WHERE page_code = :pageCode",
                params
        );
    }

    public Map<String, Object> getEntityConfig(String entityCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("entityCode", entityCode);
        return jdbcTemplate.queryForObject(
            "SELECT entity_code as \"entityCode\", table_name as \"tableName\", primary_key as \"primaryKey\", fields_json::text as \"fieldsJson\" FROM lc_entity_model WHERE entity_code = :entityCode",
            params,
            (rs, rowNum) -> {
                Map<String, Object> map = new HashMap<>();
                map.put("entityCode", rs.getString("entityCode"));
                map.put("tableName", rs.getString("tableName"));
                map.put("primaryKey", rs.getString("primaryKey"));
                map.put("fieldsJson", rs.getString("fieldsJson"));
                return map;
            }
        );
    }

    public void updateEntityConfig(String entityCode, String fieldsJsonStr) {
        updateEntityConfig(entityCode, fieldsJsonStr, null);
    }

    public void updateEntityConfig(String entityCode, String fieldsJsonStr, String primaryKey) {
        Map<String, Object> params = new HashMap<>();
        params.put("entityCode", entityCode);
        params.put("fieldsJson", fieldsJsonStr);
        params.put("primaryKey", primaryKey);
        jdbcTemplate.update(
            "UPDATE lc_entity_model SET fields_json = :fieldsJson::jsonb, primary_key = COALESCE(:primaryKey, primary_key) WHERE entity_code = :entityCode",
            params
        );
    }

    public void updatePageConfig(String pageCode, String configJsonStr) {
        configValidationService.validatePageConfigJson(configJsonStr);
        Map<String, Object> params = new HashMap<>();
        params.put("pageCode", pageCode);
        params.put("configJson", configJsonStr);
        jdbcTemplate.update(
            "UPDATE lc_page_model SET config_json = :configJson::jsonb WHERE page_code = :pageCode",
            params
        );
        metadataCacheService.invalidate("page:" + pageCode);
        configAuditService.record("page", pageCode, "configure", "page config_json updated");
    }

    public java.util.List<Map<String, Object>> listPages() {
        return jdbcTemplate.query(
            "SELECT page_code as \"pageCode\", title, route_path as \"routePath\", query_code as \"queryCode\", entity_code as \"entityCode\" FROM lc_page_model ORDER BY page_code",
            new HashMap<>(),
            (rs, rowNum) -> {
                Map<String, Object> map = new HashMap<>();
                map.put("pageCode", rs.getString("pageCode"));
                map.put("title", rs.getString("title"));
                map.put("routePath", rs.getString("routePath"));
                map.put("queryCode", rs.getString("queryCode"));
                map.put("entityCode", rs.getString("entityCode"));
                return map;
            }
        );
    }

    public List<Map<String, Object>> listPageTemplates() {
        List<Map<String, Object>> list = new ArrayList<>();
        list.add(templateMeta("crud_grid", "CRUD 表格", "可写单表：id/name/时间戳，完整增删改查", true, "singleTableTemplate"));
        list.add(templateMeta("status_board", "状态看板", "可写单表 + status 字段与筛选，适合待办/工单", true, "singleTableTemplate"));
        list.add(templateMeta("readonly_sql", "只读 SQL 视图", "rawSql 只读页，不建业务表，适合报表/预警", false, "rawSql"));
        list.add(templateMeta(
                "dashboard_lite",
                "Dashboard Lite",
                "固定 Row/Column 栅格 + KPI/图表/明细；不建业务表，替换 query SQL 即可",
                false,
                "rawSql"));
        list.add(templateMeta(
                "workspace_lite",
                "Workspace 三栏",
                "左列表 / 中主表 / 右指标；替换 companion SQL 即可联调业务",
                false,
                "rawSql"));
        list.add(templateMeta(
                "wizard_lite",
                "Wizard 向导",
                "分步 Stepper；完成可挂 Action。适合开卡/建档流程骨架",
                false,
                "rawSql"));
        list.add(templateMeta("blank", "空白页", "最小骨架：占位 SQL + 空列配置，自行在配置态完善", false, "rawSql"));
        return list;
    }

    private Map<String, Object> templateMeta(String code, String name, String description, boolean createsTable, String queryMode) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", code);
        m.put("name", name);
        m.put("description", description);
        m.put("createsTable", createsTable);
        m.put("queryMode", queryMode);
        return m;
    }

    public void createPage(String pageCode, String title, String routePath) {
        createPage(pageCode, title, routePath, "crud_grid");
    }

    public void createPage(String pageCode, String title, String routePath, String templateCode) {
        requireSafeIdentifier(pageCode, "Page code");
        if (title == null || title.trim().isEmpty()) {
            throw new IllegalArgumentException("Title is required");
        }
        configValidationService.validateRoutePath(routePath);
        String template = templateCode == null || templateCode.isBlank() ? "crud_grid" : templateCode.trim();
        String safeTitle = title.replace("\"", "\\\"");
        String entityCode = pageCode + "_entity";
        String queryCode = "q_" + pageCode;

        String sqlText;
        String queryMode;
        String fieldsJson;
        String configJson;
        boolean createPhysicalTable = false;
        String createTableSql = null;
        // Extra rawSql queries for multi-component templates (e.g. dashboard KPI/chart).
        List<Map<String, String>> extraQueries = new ArrayList<>();

        switch (template) {
            case "status_board" -> {
                createPhysicalTable = true;
                createTableSql = "CREATE TABLE IF NOT EXISTS \"" + pageCode + "\" (" +
                        "id SERIAL PRIMARY KEY, " +
                        "name VARCHAR(200), " +
                        "status VARCHAR(50) NOT NULL DEFAULT 'draft', " +
                        "created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), " +
                        "updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()" +
                        ")";
                queryMode = "singleTableTemplate";
                sqlText = "SELECT id, name, status, created_at, updated_at FROM \"" + pageCode + "\"";
                fieldsJson = """
                    [{"field":"id","label":"ID","type":"integer"},{"field":"name","label":"名称","type":"string"},{"field":"status","label":"状态","type":"string"},{"field":"created_at","label":"创建时间","type":"datetime"},{"field":"updated_at","label":"更新时间","type":"datetime"}]
                    """.trim();
                configJson = """
                    {
                      "presentation": {
                        "title": "%s",
                        "description": "Status board — filter and maintain records by status.",
                        "badge": "Status Board",
                        "emptyState": "No rows yet."
                      },
                      "dataSource": { "queryCode": "%s", "pageSize": 20, "pageSizeOptions": [20, 50, 100] },
                      "table": {
                        "columns": [
                          {"field":"id","label":"ID","width":72},
                          {"field":"name","label":"名称","width":200},
                          {"field":"status","label":"状态","width":120,"format":"badge"},
                          {"field":"created_at","label":"创建时间","width":160,"format":"datetime"},
                          {"field":"updated_at","label":"更新时间","width":160,"format":"datetime"}
                        ],
                        "filters": [
                          {"field":"status","label":"状态","type":"text","placeholder":"draft / done"}
                        ],
                        "actions": [
                          {"code":"refresh_grid","label":"刷新","dsl":"grid.refresh","scope":"page","variant":"primary"},
                          {"code":"create","label":"新增","dsl":"record.create","scope":"page","variant":"success"}
                        ]
                      },
                      "features": {
                        "pagination": true, "create": true, "edit": true, "delete": true,
                        "export": true, "density": "comfortable"
                      }
                    }
                    """.formatted(safeTitle, queryCode);
            }
            case "readonly_sql" -> {
                queryMode = "rawSql";
                sqlText = "SELECT 1 AS tip, 'Edit SQL in config mode to build a read-only view' AS message";
                fieldsJson = "[]";
                entityCode = null;
                configJson = """
                    {
                      "presentation": {
                        "title": "%s",
                        "description": "Read-only SQL view. Bind a report query in the SQL studio.",
                        "badge": "Read-only SQL",
                        "emptyState": "No rows. Update the query SQL."
                      },
                      "dataSource": { "queryCode": "%s", "pageSize": 50, "pageSizeOptions": [20, 50, 100] },
                      "table": {
                        "columns": [
                          {"field":"tip","label":"Tip","width":80},
                          {"field":"message","label":"Message","width":420}
                        ],
                        "filters": [],
                        "actions": [
                          {"code":"refresh_grid","label":"刷新","dsl":"grid.refresh","scope":"page","variant":"primary"},
                          {"code":"export_grid","label":"导出","dsl":"grid.exportCsv","scope":"page","variant":"secondary"}
                        ]
                      },
                      "features": {
                        "pagination": true, "create": false, "edit": false, "delete": false,
                        "export": true, "density": "comfortable"
                      }
                    }
                    """.formatted(safeTitle, queryCode);
            }
            case "blank" -> {
                queryMode = "rawSql";
                sqlText = "SELECT now() AS ts, 'blank template — configure SQL and columns' AS note";
                fieldsJson = "[]";
                entityCode = null;
                configJson = """
                    {
                      "presentation": {
                        "title": "%s",
                        "description": "Blank workspace. Configure SQL, entity, and page model next.",
                        "badge": "Blank",
                        "emptyState": "Empty page model."
                      },
                      "dataSource": { "queryCode": "%s", "pageSize": 20, "pageSizeOptions": [20, 50, 100] },
                      "table": { "columns": [], "filters": [], "actions": [
                        {"code":"refresh_grid","label":"刷新","dsl":"grid.refresh","scope":"page","variant":"primary"}
                      ]},
                      "features": {
                        "pagination": true, "create": false, "edit": false, "delete": false,
                        "export": false, "density": "comfortable"
                      }
                    }
                    """.formatted(safeTitle, queryCode);
            }
            case "crud_grid" -> {
                createPhysicalTable = true;
                createTableSql = "CREATE TABLE IF NOT EXISTS \"" + pageCode + "\" (" +
                        "id SERIAL PRIMARY KEY, " +
                        "name VARCHAR(200), " +
                        "created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), " +
                        "updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()" +
                        ")";
                queryMode = "singleTableTemplate";
                sqlText = "SELECT id, name, created_at, updated_at FROM \"" + pageCode + "\"";
                fieldsJson = """
                    [{"field":"id","label":"ID","type":"integer"},{"field":"name","label":"Name","type":"string"},{"field":"created_at","label":"Created At","type":"datetime"},{"field":"updated_at","label":"Updated At","type":"datetime"}]
                    """.trim();
                configJson = """
                    {
                      "presentation": {
                        "title": "%s",
                        "description": "SQL-driven workspace generated from page metadata.",
                        "badge": "CRUD Grid",
                        "emptyState": "No rows yet. Click Add or seed test data."
                      },
                      "dataSource": { "queryCode": "%s", "pageSize": 20, "pageSizeOptions": [20, 50, 100] },
                      "table": {
                        "columns": [
                          {"field":"id","label":"ID","width":80},
                          {"field":"name","label":"Name","width":200},
                          {"field":"created_at","label":"Created At","width":180,"format":"datetime"},
                          {"field":"updated_at","label":"Updated At","width":180,"format":"datetime"}
                        ],
                        "filters": [],
                        "actions": [
                          {"code":"refresh_grid","label":"Refresh","dsl":"grid.refresh","scope":"page","variant":"primary"},
                          {"code":"export_grid","label":"Export CSV","dsl":"grid.exportCsv","scope":"page","variant":"secondary"}
                        ]
                      },
                      "features": {
                        "pagination": true, "create": true, "edit": true, "delete": true,
                        "export": true, "density": "comfortable"
                      }
                    }
                    """.formatted(safeTitle, queryCode);
            }
            case "dashboard_lite" -> {
                // No physical table. Scaffold layout + sample KPI/chart/detail SQL (rawSql).
                queryMode = "rawSql";
                entityCode = null;
                String kpiQueryCode = queryCode + "_kpi";
                String seriesQueryCode = queryCode + "_series";
                sqlText = """
                    SELECT * FROM (VALUES
                      (1, '示例行 A', 100),
                      (2, '示例行 B', 200),
                      (3, '替换 q_%s 的 SQL 即可接入真实明细', 0)
                    ) AS t(id, name, amount)
                    ORDER BY id
                    """.formatted(pageCode).trim();
                fieldsJson = "[]";
                Map<String, String> kpiQ = new LinkedHashMap<>();
                kpiQ.put("queryCode", kpiQueryCode);
                kpiQ.put("sqlText", "SELECT 42::int AS metric_a, 1280.5::numeric AS metric_b, 7::int AS metric_c");
                kpiQ.put("queryMode", "rawSql");
                extraQueries.add(kpiQ);
                Map<String, String> seriesQ = new LinkedHashMap<>();
                seriesQ.put("queryCode", seriesQueryCode);
                seriesQ.put("sqlText", """
                    SELECT d::text AS category, (10 + EXTRACT(DAY FROM d)::int % 5)::int AS value
                    FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval) AS d
                    ORDER BY d
                    """.trim());
                seriesQ.put("queryMode", "rawSql");
                extraQueries.add(seriesQ);
                configJson = """
                    {
                      "presentation": {
                        "title": "%s",
                        "description": "Dashboard Lite：固定 12 列 layout + 独立 dataSource。改 SQL 即可，不写 Java。",
                        "badge": "Dashboard Lite",
                        "emptyState": "No detail rows."
                      },
                      "dataSource": { "queryCode": "%s", "pageSize": 20, "pageSizeOptions": [20, 50, 100] },
                      "layout": {
                        "type": "dashboard",
                        "gap": 16,
                        "rows": [
                          {
                            "cols": [
                              { "span": 4, "components": ["kpi_a"] },
                              { "span": 4, "components": ["kpi_b"] },
                              { "span": 4, "components": ["kpi_c"] }
                            ]
                          },
                          {
                            "cols": [
                              {
                                "span": 12,
                                "section": { "title": "趋势", "description": "query %s", "refreshable": true },
                                "components": ["chart_series"]
                              }
                            ]
                          },
                          {
                            "cols": [
                              {
                                "span": 12,
                                "section": { "title": "明细", "description": "主 query %s" },
                                "components": ["main_grid"]
                              }
                            ]
                          }
                        ]
                      },
                      "components": [
                        {
                          "componentCode": "kpi_a",
                          "type": "stat",
                          "dataSource": { "type": "sql", "queryCode": "%s" },
                          "bindings": { "value": "metric_a" },
                          "properties": { "title": "指标 A", "format": "number", "subtitle": "改 %s SQL" }
                        },
                        {
                          "componentCode": "kpi_b",
                          "type": "stat",
                          "dataSource": { "type": "sql", "queryCode": "%s" },
                          "bindings": { "value": "metric_b" },
                          "properties": { "title": "指标 B", "format": "money" }
                        },
                        {
                          "componentCode": "kpi_c",
                          "type": "stat",
                          "dataSource": { "type": "sql", "queryCode": "%s" },
                          "bindings": { "value": "metric_c" },
                          "properties": { "title": "指标 C", "format": "number" }
                        },
                        {
                          "componentCode": "chart_series",
                          "type": "barChart",
                          "dataSource": { "type": "sql", "queryCode": "%s" },
                          "bindings": { "category": "category", "value": "value" },
                          "properties": { "title": "", "legend": false, "height": 260 }
                        },
                        { "componentCode": "main_grid", "type": "smartGrid" }
                      ],
                      "table": {
                        "columns": [
                          { "field": "id", "label": "ID", "width": 72 },
                          { "field": "name", "label": "名称", "width": 280 },
                          { "field": "amount", "label": "金额", "width": 120, "format": "number", "align": "right" }
                        ],
                        "filters": [
                          { "field": "name", "label": "名称", "type": "text" }
                        ],
                        "actions": [
                          { "code": "refresh_grid", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary" }
                        ]
                      },
                      "features": {
                        "pagination": true, "create": false, "edit": false, "delete": false,
                        "export": true, "density": "comfortable"
                      }
                    }
                    """.formatted(
                        safeTitle,
                        queryCode,
                        seriesQueryCode,
                        queryCode,
                        kpiQueryCode,
                        kpiQueryCode,
                        kpiQueryCode,
                        kpiQueryCode,
                        seriesQueryCode);
            }
            case "workspace_lite" -> {
                queryMode = "rawSql";
                entityCode = null;
                String sideQueryCode = queryCode + "_side";
                String statQueryCode = queryCode + "_stat";
                sqlText = """
                    SELECT * FROM (VALUES
                      (1, '示例预约 A', '待服务'),
                      (2, '示例预约 B', '进行中'),
                      (3, '替换 q_%s SQL 接入真实业务', '—')
                    ) AS t(id, title, status)
                    ORDER BY id
                    """.formatted(pageCode).trim();
                fieldsJson = "[]";
                Map<String, String> sideQ = new LinkedHashMap<>();
                sideQ.put("queryCode", sideQueryCode);
                sideQ.put("sqlText", """
                    SELECT * FROM (VALUES
                      (1, '示例会员甲', '13800000001'),
                      (2, '示例会员乙', '13800000002')
                    ) AS t(id, name, phone)
                    """.trim());
                sideQ.put("queryMode", "rawSql");
                extraQueries.add(sideQ);
                Map<String, String> statQ = new LinkedHashMap<>();
                statQ.put("queryCode", statQueryCode);
                statQ.put("sqlText", "SELECT 12::int AS metric_a, 3::int AS metric_b");
                statQ.put("queryMode", "rawSql");
                extraQueries.add(statQ);
                configJson = """
                    {
                      "presentation": {
                        "title": "%s",
                        "description": "Workspace 三栏：左 simpleGrid、中 smartGrid、右 stat。改 companion SQL 即可。",
                        "badge": "Workspace",
                        "emptyState": "No rows."
                      },
                      "dataSource": { "queryCode": "%s", "pageSize": 20, "pageSizeOptions": [20, 50, 100] },
                      "workspace": {
                        "enabled": true,
                        "gap": 16,
                        "left": { "span": 3, "title": "侧栏", "components": ["side_list"] },
                        "center": { "span": 6, "title": "主区", "components": ["main_grid"] },
                        "right": { "span": 3, "title": "指标", "components": ["kpi_a", "kpi_b", "hint"] }
                      },
                      "components": [
                        {
                          "componentCode": "side_list",
                          "type": "simpleGrid",
                          "dataSource": { "type": "sql", "queryCode": "%s" },
                          "properties": { "title": "侧栏列表", "maxRows": 50 }
                        },
                        { "componentCode": "main_grid", "type": "smartGrid" },
                        {
                          "componentCode": "kpi_a",
                          "type": "stat",
                          "dataSource": { "type": "sql", "queryCode": "%s" },
                          "bindings": { "value": "metric_a" },
                          "properties": { "title": "指标 A", "format": "number" }
                        },
                        {
                          "componentCode": "kpi_b",
                          "type": "stat",
                          "dataSource": { "type": "sql", "queryCode": "%s" },
                          "bindings": { "value": "metric_b" },
                          "properties": { "title": "指标 B", "format": "number" }
                        },
                        {
                          "componentCode": "hint",
                          "type": "text",
                          "properties": {
                            "title": "提示",
                            "content": "主 query=%s · 侧栏=%s · 指标=%s"
                          }
                        }
                      ],
                      "table": {
                        "columns": [
                          { "field": "id", "label": "ID", "width": 64 },
                          { "field": "title", "label": "标题", "width": 220 },
                          { "field": "status", "label": "状态", "width": 100, "format": "badge" }
                        ],
                        "filters": [
                          { "field": "title", "label": "标题", "type": "text" }
                        ],
                        "actions": [
                          { "code": "refresh_grid", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary" }
                        ]
                      },
                      "features": {
                        "pagination": true, "create": false, "edit": false, "delete": false,
                        "export": true, "density": "comfortable"
                      }
                    }
                    """.formatted(
                        safeTitle,
                        queryCode,
                        sideQueryCode,
                        statQueryCode,
                        statQueryCode,
                        queryCode,
                        sideQueryCode,
                        statQueryCode);
            }
            case "wizard_lite" -> {
                queryMode = "rawSql";
                entityCode = null;
                sqlText = """
                    SELECT * FROM (VALUES
                      (1, '示例套餐 A', 100),
                      (2, '示例套餐 B', 200),
                      (3, '替换 q_%s 接入卡项/项目', 0)
                    ) AS t(id, name, price)
                    ORDER BY id
                    """.formatted(pageCode).trim();
                fieldsJson = "[]";
                configJson = """
                    {
                      "presentation": {
                        "title": "%s",
                        "description": "Wizard 向导骨架：分步 text + 中间步 smartGrid。完成事件可挂 Action。",
                        "badge": "Wizard",
                        "emptyState": "No packages."
                      },
                      "dataSource": { "queryCode": "%s", "pageSize": 50, "pageSizeOptions": [20, 50, 100] },
                      "wizard": {
                        "enabled": true,
                        "steps": [
                          {
                            "code": "step1",
                            "title": "基本信息",
                            "description": "填写客户/会员信息（表单组件可后续挂接）。",
                            "components": ["step_intro"]
                          },
                          {
                            "code": "step2",
                            "title": "选择项目",
                            "description": "列表来自页面主 query。",
                            "components": ["step_grid"]
                          },
                          {
                            "code": "step3",
                            "title": "确认",
                            "description": "完成可接 Action / 插件（短信等）。",
                            "components": ["step_confirm"]
                          }
                        ]
                      },
                      "components": [
                        {
                          "componentCode": "step_intro",
                          "type": "text",
                          "properties": {
                            "title": "步骤 1",
                            "content": "配置态可改文案；生产可换 form 组件或跳转 masterDetail。"
                          }
                        },
                        { "componentCode": "step_grid", "type": "smartGrid" },
                        {
                          "componentCode": "step_confirm",
                          "type": "text",
                          "properties": {
                            "title": "确认",
                            "content": "点完成触发 wizardFinish。可在 page.wizard.finishActionCode 挂 sqlTransaction。"
                          }
                        }
                      ],
                      "table": {
                        "columns": [
                          { "field": "id", "label": "ID", "width": 64 },
                          { "field": "name", "label": "名称", "width": 220 },
                          { "field": "price", "label": "价格", "width": 100, "format": "number", "align": "right" }
                        ],
                        "filters": [],
                        "actions": [
                          { "code": "refresh_grid", "label": "刷新", "dsl": "grid.refresh", "scope": "page", "variant": "primary" }
                        ]
                      },
                      "features": {
                        "pagination": false, "create": false, "edit": false, "delete": false,
                        "export": false, "density": "comfortable"
                      }
                    }
                    """.formatted(safeTitle, queryCode);
            }
            default -> throw new IllegalArgumentException(
                    "Unknown page template: " + template
                            + " (use crud_grid | status_board | readonly_sql | dashboard_lite | workspace_lite | wizard_lite | blank)");
        }

        if (createPhysicalTable && createTableSql != null) {
            jdbcTemplate.getJdbcOperations().execute(createTableSql);
        }

        if (entityCode != null) {
            Map<String, Object> entityParams = new HashMap<>();
            entityParams.put("entityCode", entityCode);
            entityParams.put("tableName", pageCode);
            entityParams.put("fieldsJson", fieldsJson);
            jdbcTemplate.update(
                "INSERT INTO lc_entity_model (entity_code, table_name, primary_key, fields_json) VALUES (:entityCode, :tableName, 'id', :fieldsJson::jsonb) ON CONFLICT (entity_code) DO NOTHING",
                entityParams
            );
        }

        Map<String, Object> queryParams = new HashMap<>();
        queryParams.put("queryCode", queryCode);
        queryParams.put("entityCode", entityCode);
        queryParams.put("sqlText", sqlText);
        queryParams.put("queryMode", queryMode);
        jdbcTemplate.update(
            "INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode) VALUES (:queryCode, :entityCode, :sqlText, :queryMode) ON CONFLICT (query_code) DO NOTHING",
            queryParams
        );

        for (Map<String, String> extra : extraQueries) {
            Map<String, Object> extraParams = new HashMap<>();
            extraParams.put("queryCode", extra.get("queryCode"));
            extraParams.put("entityCode", null);
            extraParams.put("sqlText", extra.get("sqlText"));
            extraParams.put("queryMode", extra.getOrDefault("queryMode", "rawSql"));
            jdbcTemplate.update(
                "INSERT INTO lc_query_model (query_code, anchor_entity, sql_text, query_mode) VALUES (:queryCode, :entityCode, :sqlText, :queryMode) ON CONFLICT (query_code) DO NOTHING",
                extraParams
            );
        }

        Map<String, Object> pageParams = new HashMap<>();
        pageParams.put("pageCode", pageCode);
        pageParams.put("title", title);
        pageParams.put("routePath", routePath);
        pageParams.put("queryCode", queryCode);
        pageParams.put("entityCode", entityCode);
        pageParams.put("configJson", configJson);
        jdbcTemplate.update(
            "INSERT INTO lc_page_model (page_code, title, route_path, query_code, entity_code, config_json) VALUES (:pageCode, :title, :routePath, :queryCode, :entityCode, :configJson::jsonb) ON CONFLICT (page_code) DO NOTHING",
            pageParams
        );

        authService.registerFactoryPageResources(pageCode, queryCode);
        for (Map<String, String> extra : extraQueries) {
            String extraCode = extra.get("queryCode");
            if (extraCode != null && !extraCode.isBlank()) {
                // Register query perm only (no fake page: code).
                authService.registerFactoryPageResources(null, extraCode);
            }
        }
    }

    public void deletePage(String pageCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("pageCode", pageCode);
        
        // Fetch queryCode and entityCode first
        Map<String, Object> page = jdbcTemplate.queryForMap(
            "SELECT query_code, entity_code FROM lc_page_model WHERE page_code = :pageCode",
            params
        );
        String queryCode = (String) page.get("query_code");
        String entityCode = (String) page.get("entity_code");

        authService.unregisterFactoryPageResources(pageCode, queryCode);
        
        // Delete page
        jdbcTemplate.update("DELETE FROM lc_page_model WHERE page_code = :pageCode", params);
        
        // Delete main query + dashboard companion queries (q_*_kpi / q_*_series)
        if (queryCode != null) {
            List<String> queryCodes = new ArrayList<>();
            queryCodes.add(queryCode);
            queryCodes.add(queryCode + "_kpi");
            queryCodes.add(queryCode + "_series");
            queryCodes.add(queryCode + "_side");
            queryCodes.add(queryCode + "_stat");
            for (String code : queryCodes) {
                Map<String, Object> qParams = new HashMap<>();
                qParams.put("queryCode", code);
                jdbcTemplate.update("DELETE FROM lc_query_model WHERE query_code = :queryCode", qParams);
                if (!code.equals(queryCode)) {
                    authService.unregisterFactoryPageResources(null, code);
                }
            }
        }
        
        // Delete entity
        if (entityCode != null) {
            Map<String, Object> eParams = new HashMap<>();
            eParams.put("entityCode", entityCode);
            jdbcTemplate.update("DELETE FROM lc_entity_model WHERE entity_code = :entityCode", eParams);
        }
    }

    public boolean isPageWritable(String pageCode) {
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("pageCode", pageCode);
            Map<String, Object> page = jdbcTemplate.queryForMap(
                "SELECT query_code as \"queryCode\", entity_code as \"entityCode\" FROM lc_page_model WHERE page_code = :pageCode",
                params
            );
            String entityCode = (String) page.get("entityCode");
            String queryCode = (String) page.get("queryCode");
            if (entityCode == null || entityCode.trim().isEmpty()) {
                return false;
            }
            if (queryCode == null || queryCode.trim().isEmpty()) {
                return false;
            }

            // Load query config (query_mode: rawSql is never auto-writable)
            Map<String, Object> qParams = new HashMap<>();
            qParams.put("queryCode", queryCode);
            Map<String, Object> query = jdbcTemplate.queryForMap(
                "SELECT anchor_entity as \"anchorEntity\", COALESCE(query_mode, 'rawSql') as \"queryMode\", sql_text as \"sqlText\" FROM lc_query_model WHERE query_code = :queryCode",
                qParams
            );
            String queryMode = query.get("queryMode") == null ? "rawSql" : String.valueOf(query.get("queryMode"));
            if ("rawSql".equalsIgnoreCase(queryMode)) {
                return false;
            }
            String anchorEntity = (String) query.get("anchorEntity");
            if (anchorEntity == null || !anchorEntity.equalsIgnoreCase(entityCode)) {
                return false;
            }

            // Load entity config
            Map<String, Object> eParams = new HashMap<>();
            eParams.put("entityCode", entityCode);
            Map<String, Object> entity = jdbcTemplate.queryForMap(
                "SELECT table_name as \"tableName\", primary_key as \"primaryKey\" FROM lc_entity_model WHERE entity_code = :entityCode",
                eParams
            );
            String tableName = (String) entity.get("tableName");
            String primaryKey = (String) entity.get("primaryKey");
            if (tableName == null || tableName.trim().isEmpty()) {
                return false;
            }
            if (primaryKey == null || primaryKey.trim().isEmpty()) {
                return false;
            }

            // Result set must expose the primary key column (best-effort from sql text)
            String sqlText = query.get("sqlText") == null ? "" : String.valueOf(query.get("sqlText"));
            if (!sqlTextLooksLikeItSelectsPrimaryKey(sqlText, primaryKey)) {
                return false;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Lightweight check: SELECT * or explicit PK token present.
     * Not a full SQL parser — blocks obvious aggregates without PK.
     */
    private boolean sqlTextLooksLikeItSelectsPrimaryKey(String sqlText, String primaryKey) {
        if (sqlText == null || sqlText.isBlank() || primaryKey == null || primaryKey.isBlank()) {
            return false;
        }
        String normalized = sqlText.toLowerCase();
        String pk = primaryKey.toLowerCase();
        if (normalized.contains(" select *") || normalized.trim().startsWith("select *") || normalized.contains("select*")) {
            return true;
        }
        // word-boundary-ish match for pk identifier
        return normalized.matches("(?s).*\\b" + java.util.regex.Pattern.quote(pk) + "\\b.*");
    }

    public void insertRow(String pageCode, Map<String, Object> rowData) {
        if (!isPageWritable(pageCode)) {
            throw new IllegalStateException("CRUD operations are disabled for this page because it does not satisfy single-table primary-key write requirements.");
        }
        Map<String, Object> entity = resolveEntity(pageCode);
        String tableName = requireSafeIdentifier((String) entity.get("tableName"), "Table name");
        String primaryKey = requireSafeIdentifier((String) entity.get("primaryKey"), "Primary key");
        // Drop field-denied columns before write (backend is source of truth).
        Map<String, Object> authorized = authzRuntimeService.sanitizeRow(
                rowData == null ? Map.of() : new HashMap<>(rowData)
        );
        Map<String, Object> sanitizedRowData = sanitizeRowData(authorized, primaryKey, true);

        StringBuilder sql = new StringBuilder("INSERT INTO ");
        sql.append("\"").append(tableName).append("\" (");
        StringBuilder vals = new StringBuilder(" VALUES (");

        Map<String, Object> params = new HashMap<>();
        int i = 0;
        for (Map.Entry<String, Object> entry : sanitizedRowData.entrySet()) {
            String key = entry.getKey();
            if (!key.matches("^[a-zA-Z0-9_]+$")) continue;

            if (i > 0) {
                sql.append(", ");
                vals.append(", ");
            }
            sql.append("\"").append(key).append("\"");
            vals.append(":").append(key);
            params.put(key, entry.getValue());
            i++;
        }
        if (params.isEmpty()) {
            throw new IllegalArgumentException("No valid columns were provided");
        }
        sql.append(")").append(vals).append(")");

        jdbcDataSourceRegistry.resolveForPage(pageCode).update(sql.toString(), params);
    }

    public void updateRow(String pageCode, Object id, Map<String, Object> rowData) {
        if (!isPageWritable(pageCode)) {
            throw new IllegalStateException("CRUD operations are disabled for this page because it does not satisfy single-table primary-key write requirements.");
        }
        Map<String, Object> entity = resolveEntity(pageCode);
        String tableName = requireSafeIdentifier((String) entity.get("tableName"), "Table name");
        String primaryKey = requireSafeIdentifier((String) entity.get("primaryKey"), "Primary key");
        Map<String, Object> authorized = authzRuntimeService.sanitizeRow(
                rowData == null ? Map.of() : new HashMap<>(rowData)
        );
        Map<String, Object> sanitizedRowData = sanitizeRowData(authorized, primaryKey, false);

        StringBuilder sql = new StringBuilder("UPDATE ");
        sql.append("\"").append(tableName).append("\" SET ");

        Object targetId = id;
        if (id instanceof String && ((String) id).matches("^\\d+$")) {
            try {
                targetId = Long.parseLong((String) id);
            } catch (NumberFormatException e) {
                // ignore
            }
        }

        Map<String, Object> params = new HashMap<>();
        params.put("__id", targetId);

        int i = 0;
        for (Map.Entry<String, Object> entry : sanitizedRowData.entrySet()) {
            String key = entry.getKey();
            if (key.equals(primaryKey)) continue;
            if (!key.matches("^[a-zA-Z0-9_]+$")) continue;

            if (i > 0) {
                sql.append(", ");
            }
            sql.append("\"").append(key).append("\" = :").append(key);
            params.put(key, entry.getValue());
            i++;
        }
        if (i == 0) {
            throw new IllegalArgumentException("No updatable columns were provided");
        }
        sql.append(" WHERE \"").append(primaryKey).append("\" = :__id");

        jdbcDataSourceRegistry.resolveForPage(pageCode).update(sql.toString(), params);
    }

    public void deleteRow(String pageCode, Object id) {
        if (!isPageWritable(pageCode)) {
            throw new IllegalStateException("CRUD operations are disabled for this page because it does not satisfy single-table primary-key write requirements.");
        }
        Map<String, Object> entity = resolveEntity(pageCode);
        String tableName = requireSafeIdentifier((String) entity.get("tableName"), "Table name");
        String primaryKey = requireSafeIdentifier((String) entity.get("primaryKey"), "Primary key");

        Object targetId = id;
        if (id instanceof String && ((String) id).matches("^\\d+$")) {
            try {
                targetId = Long.parseLong((String) id);
            } catch (NumberFormatException e) {
                // ignore
            }
        }

        String sql = "DELETE FROM \"" + tableName + "\" WHERE \"" + primaryKey + "\" = :__id";
        Map<String, Object> params = new HashMap<>();
        params.put("__id", targetId);

        jdbcDataSourceRegistry.resolveForPage(pageCode).update(sql, params);
    }

    public void logClientEvent(String pageCode, String eventType, String elementCode, String message, Object details) {
        String sql = "INSERT INTO lc_client_log (page_code, event_type, element_code, message, details_json) " +
                     "VALUES (:pageCode, :eventType, :elementCode, :message, cast(:detailsJson as jsonb))";
        Map<String, Object> params = new HashMap<>();
        params.put("pageCode", pageCode);
        params.put("eventType", eventType != null ? eventType : "info");
        params.put("elementCode", elementCode);
        params.put("message", message);

        String detailsJson = "{}";
        if (details != null) {
            try {
                detailsJson = new ObjectMapper().writeValueAsString(details);
            } catch (Exception e) {
                // ignore
            }
        }
        params.put("detailsJson", detailsJson);
        jdbcTemplate.update(sql, params);
    }

    private Map<String, Object> resolveEntity(String pageCode) {
        Map<String, Object> page = getPageConfig(pageCode);
        String entityCode = (String) page.get("entityCode");
        Map<String, Object> entity = getEntityConfig(entityCode);
        if (entity.get("primaryKey") == null || String.valueOf(entity.get("primaryKey")).trim().isEmpty()) {
            String inferredPrimaryKey = inferPrimaryKey((String) entity.get("tableName"));
            entity.put("primaryKey", inferredPrimaryKey != null ? inferredPrimaryKey : "id");
        }
        return entity;
    }

    public List<Map<String, Object>> resolveEntityFields(String entityCode) {
        return resolveEntityFields(getEntityConfig(entityCode));
    }

    public List<Map<String, Object>> resolveEntityFields(Map<String, Object> entityConfig) {
        String tableName = entityConfig.get("tableName") == null ? null : String.valueOf(entityConfig.get("tableName"));
        String fieldsJsonStr = entityConfig.get("fieldsJson") == null ? "[]" : String.valueOf(entityConfig.get("fieldsJson"));

        List<Map<String, Object>> schemaFields = loadSchemaFields(tableName);
        Map<String, Map<String, Object>> overrideByField = new LinkedHashMap<>();
        for (Map<String, Object> field : parseFieldOverrides(fieldsJsonStr)) {
            String fieldName = field.get("field") == null ? null : String.valueOf(field.get("field"));
            if (fieldName == null || fieldName.trim().isEmpty()) {
                continue;
            }
            overrideByField.put(fieldName, field);
        }

        List<Map<String, Object>> merged = new ArrayList<>();
        for (Map<String, Object> schemaField : schemaFields) {
            String fieldName = String.valueOf(schemaField.get("field"));
            Map<String, Object> mergedField = new LinkedHashMap<>(schemaField);
            Map<String, Object> override = overrideByField.remove(fieldName);
            if (override != null) {
                mergeFieldOverrides(mergedField, override);
            }
            merged.add(mergedField);
        }

        for (Map<String, Object> override : overrideByField.values()) {
            Map<String, Object> mergedField = new LinkedHashMap<>();
            mergedField.put("field", override.get("field"));
            mergedField.put("label", override.getOrDefault("label", override.get("field")));
            mergedField.put("type", override.getOrDefault("type", "string"));
            mergeFieldOverrides(mergedField, override);
            merged.add(mergedField);
        }

        return merged;
    }

    public String inferPrimaryKey(String tableName) {
        if (tableName == null || tableName.trim().isEmpty()) {
            return null;
        }

        return jdbcTemplate.getJdbcOperations().execute((ConnectionCallback<String>) connection -> {
            DatabaseMetaData metaData = connection.getMetaData();
            try (ResultSet rs = metaData.getPrimaryKeys(null, null, tableName)) {
                if (rs.next()) {
                    return rs.getString("COLUMN_NAME");
                }
            }
            return null;
        });
    }

    private List<Map<String, Object>> loadSchemaFields(String tableName) {
        if (tableName == null || tableName.trim().isEmpty()) {
            return new ArrayList<>();
        }

        String primaryKey = inferPrimaryKey(tableName);
        Map<String, Object> params = new HashMap<>();
        params.put("tableName", tableName);
        return jdbcTemplate.query(
            """
            SELECT column_name, data_type, ordinal_position
            FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = :tableName
            ORDER BY ordinal_position
            """,
            params,
            (rs, rowNum) -> {
                Map<String, Object> field = new LinkedHashMap<>();
                String columnName = rs.getString("column_name");
                field.put("field", columnName);
                field.put("label", toDisplayLabel(columnName));
                field.put("type", mapInformationSchemaType(rs.getString("data_type")));
                if (primaryKey != null && primaryKey.equalsIgnoreCase(columnName)) {
                    field.put("primary", true);
                }
                return field;
            }
        );
    }

    private List<Map<String, Object>> parseFieldOverrides(String fieldsJsonStr) {
        try {
            return objectMapper.readValue(fieldsJsonStr, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception ignore) {
            return new ArrayList<>();
        }
    }

    private void mergeFieldOverrides(Map<String, Object> target, Map<String, Object> override) {
        for (String key : List.of("label", "type", "width", "align", "hidden", "format", "tone", "placeholder", "readonly", "primary")) {
            if (override.containsKey(key) && override.get(key) != null) {
                target.put(key, override.get(key));
            }
        }
    }

    private String toDisplayLabel(String columnName) {
        if (columnName == null || columnName.trim().isEmpty()) {
            return "";
        }

        String[] parts = columnName.split("_");
        StringBuilder builder = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) {
                continue;
            }
            if (builder.length() > 0) {
                builder.append(' ');
            }
            builder.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                builder.append(part.substring(1));
            }
        }
        return builder.toString();
    }

    private String mapInformationSchemaType(String dataType) {
        if (dataType == null) {
            return "string";
        }

        String normalized = dataType.toLowerCase();
        return switch (normalized) {
            case "smallint", "integer", "bigint" -> "integer";
            case "numeric", "decimal", "real", "double precision" -> "number";
            case "boolean" -> "boolean";
            case "date", "timestamp without time zone", "timestamp with time zone", "time without time zone", "time with time zone" -> "datetime";
            default -> "string";
        };
    }

    private Map<String, Object> sanitizeRowData(Map<String, Object> rowData, String primaryKey, boolean omitBlankPrimaryKey) {
        Map<String, Object> sanitized = new HashMap<>();
        if (rowData == null) {
            return sanitized;
        }

        for (Map.Entry<String, Object> entry : rowData.entrySet()) {
            String key = entry.getKey();
            if (key == null || !key.matches("^[a-zA-Z0-9_]+$")) {
                continue;
            }

            Object value = entry.getValue();
            if (value instanceof String && ((String) value).trim().isEmpty()) {
                value = null;
            }

            if (omitBlankPrimaryKey && key.equals(primaryKey) && value == null) {
                continue;
            }
            sanitized.put(key, value);
        }
        return sanitized;
    }
}
