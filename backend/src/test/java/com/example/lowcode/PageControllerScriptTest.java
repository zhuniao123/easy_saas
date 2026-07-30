package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class PageControllerScriptTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testDraftPublishAndRuntimeServe() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_script WHERE script_code = 'ctrl_slice4'");

        mockMvc.perform(put("/api/v1/scripts/ctrl_slice4")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "scriptType": "PAGE_CONTROLLER",
                                  "scriptContent": "export default { async onReady(ctx) { ctx.state.set('ok', true); } };",
                                  "pageCode": "demo_page",
                                  "remark": "slice4"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.version").value(1));

        mockMvc.perform(get("/api/v1/scripts/ctrl_slice4/runtime"))
                .andExpect(status().isConflict());

        mockMvc.perform(post("/api/v1/scripts/ctrl_slice4/publish"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.version").value(2));

        mockMvc.perform(get("/api/v1/scripts/ctrl_slice4/runtime"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scriptCode").value("ctrl_slice4"))
                .andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.scriptContent").value(org.hamcrest.Matchers.containsString("onReady")));

        mockMvc.perform(get("/api/v1/scripts/ctrl_slice4.js"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/scripts/ctrl_slice4/disable"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DISABLED"));

        mockMvc.perform(get("/api/v1/scripts/ctrl_slice4/runtime"))
                .andExpect(status().isConflict());

        Integer version = jdbcTemplate.queryForObject(
                "SELECT version FROM lc_script WHERE script_code = 'ctrl_slice4'",
                Integer.class
        );
        assertThat(version).isEqualTo(2);
    }
}
