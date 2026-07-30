package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class DynamicEndpointTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testGovernedDynamicEndpointWithSchemaAndTransaction() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_dynamic_endpoint WHERE endpoint_code = 'ep_mrmf_calc'");
        jdbcTemplate.execute("DELETE FROM lc_script WHERE script_code = 'groovy_mrmf_calc'");
        jdbcTemplate.execute("DELETE FROM lc_query_model WHERE query_code = 'q_dyn_support'");
        jdbcTemplate.execute("DELETE FROM lc_entity_model WHERE entity_code = 'entity_dyn_support'");

        String groovy = """
                import com.example.lowcode.script.IDynamicEndpointHandler
                import com.example.lowcode.script.DynamicContext
                class MrfmCalc implements IDynamicEndpointHandler {
                  Object handle(DynamicContext ctx) {
                    def a = ctx.require('a') as Number
                    def b = ctx.require('b') as Number
                    def q = ctx.query('q_dyn_support', [:])
                    return [sum: a.intValue() + b.intValue(), queryOk: q.rows != null, ds: ctx.dataSourceCode]
                  }
                }
                """;

        mockMvc.perform(put("/api/v1/scripts/groovy_mrmf_calc")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "scriptType": "BACKEND_GROOVY",
                                  "scriptContent": %s
                                }
                                """.formatted(toJsonString(groovy))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));

        jdbcTemplate.execute(
                "INSERT INTO lc_entity_model(entity_code, table_name, fields_json) " +
                        "VALUES ('entity_dyn_support', 'lc_entity_model', '[]'::jsonb)"
        );
        jdbcTemplate.execute(
                "INSERT INTO lc_query_model(query_code, anchor_entity, sql_text, query_mode) " +
                        "VALUES ('q_dyn_support', 'entity_dyn_support', 'SELECT 1 as ok', 'rawSql')"
        );

        mockMvc.perform(put("/api/v1/dynamic/ep_mrmf_calc")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "scriptCode": "groovy_mrmf_calc",
                                  "txMode": "READ_ONLY",
                                  "timeoutMs": 5000,
                                  "requestSchema": {
                                    "type": "object",
                                    "required": ["a", "b"],
                                    "properties": {
                                      "a": { "type": "number" },
                                      "b": { "type": "number" }
                                    }
                                  },
                                  "responseSchema": {
                                    "type": "object",
                                    "required": ["sum"],
                                    "properties": {
                                      "sum": { "type": "number" }
                                    }
                                  }
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));

        // not published yet
        mockMvc.perform(post("/api/v1/dynamic/ep_mrmf_calc")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"a\":1,\"b\":2}"))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/v1/dynamic/ep_mrmf_calc/publish"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));

        // schema failure
        mockMvc.perform(post("/api/v1/dynamic/ep_mrmf_calc")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"a\":1}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/v1/dynamic/ep_mrmf_calc")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"a\":10,\"b\":5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sum").value(15))
                .andExpect(jsonPath("$.queryOk").value(true));
    }

    private static String toJsonString(String raw) {
        return "\"" + raw
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "")
                + "\"";
    }
}
