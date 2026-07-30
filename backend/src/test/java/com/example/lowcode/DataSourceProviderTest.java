package com.example.lowcode;

import com.example.lowcode.datasource.CacheDataSourceProvider;
import com.example.lowcode.datasource.DataSourceProviderRegistry;
import com.example.lowcode.datasource.DataSourceSpec;
import com.example.lowcode.datasource.StaticDataSourceProvider;
import com.example.lowcode.datatable.DataTable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class DataSourceProviderTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private DataSourceProviderRegistry registry;

    @Test
    public void testRegisteredProvidersIncludeSqlStaticAndCache() {
        assertThat(registry.registeredTypes()).contains("sql", "static", "cache");
    }

    @Test
    public void testStaticProviderReturnsDataTable() {
        DataSourceSpec spec = new DataSourceSpec(
                "static",
                null,
                null,
                Map.of("_page", 1, "_pageSize", 1),
                Map.of(
                        "rows", List.of(
                                Map.of("code", "A", "name", "Alpha"),
                                Map.of("code", "B", "name", "Beta")
                        )
                )
        );
        DataTable table = new StaticDataSourceProvider().resolve(spec);
        assertThat(table.getTotal()).isEqualTo(2L);
        assertThat(table.getRows()).hasSize(1);
        assertThat(table.getRows().get(0).get("code")).isEqualTo("A");
        assertThat(table.getColumns()).extracting(c -> c.get("field")).contains("code", "name");
        assertThat(table.getMetadata().get("provider")).isEqualTo("static");
        assertThat(table.toMap()).containsKeys("columns", "rows", "total", "metadata");
    }

    @Test
    public void testCacheProviderIsReservedNotImplemented() {
        DataSourceSpec spec = new DataSourceSpec("cache", null, "k1", Map.of(), Map.of());
        assertThatThrownBy(() -> new CacheDataSourceProvider().resolve(spec))
                .isInstanceOf(UnsupportedOperationException.class)
                .hasMessageContaining("not implemented");
        assertThat(CacheDataSourceProvider.reservedMetadata("k1").get("implemented")).isEqualTo(false);
    }

    @Test
    public void testResolveEndpointSqlAndStatic() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_query_model WHERE query_code = 'q_ds_provider_sql'");
        jdbcTemplate.execute(
                "INSERT INTO lc_query_model(query_code, sql_text, query_mode) " +
                        "VALUES ('q_ds_provider_sql', 'SELECT 7 AS val', 'rawSql')"
        );

        mockMvc.perform(post("/api/v1/datasources/resolve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "type": "sql",
                                  "queryCode": "q_ds_provider_sql",
                                  "params": {}
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].val").value(7))
                .andExpect(jsonPath("$.metadata.provider").value("sql"))
                .andExpect(jsonPath("$.metadata.queryCode").value("q_ds_provider_sql"));

        mockMvc.perform(post("/api/v1/datasources/resolve")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "type": "static",
                                  "options": {
                                    "rows": [{"id": 1, "label": "One"}],
                                    "columns": [{"field": "id", "label": "ID", "type": "integer"},
                                                {"field": "label", "label": "Label", "type": "string"}]
                                  }
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.rows[0].label").value("One"))
                .andExpect(jsonPath("$.columns[0].field").value("id"))
                .andExpect(jsonPath("$.metadata.provider").value("static"));

        mockMvc.perform(get("/api/v1/datasources/types"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.types").isArray());
    }

    @Test
    public void testLegacyQueryExecuteStillWorksWithoutMetadataRequirement() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_query_model WHERE query_code = 'q_legacy_grid'");
        jdbcTemplate.execute(
                "INSERT INTO lc_query_model(query_code, sql_text, query_mode) " +
                        "VALUES ('q_legacy_grid', 'SELECT 1 AS n', 'rawSql')"
        );

        mockMvc.perform(post("/api/v1/queries/q_legacy_grid/execute")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"params\":{}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].n").value(1))
                .andExpect(jsonPath("$.columns").isArray());
    }
}
