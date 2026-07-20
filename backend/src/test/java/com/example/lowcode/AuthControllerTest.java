package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "lowcode.auth.enabled=true")
@AutoConfigureMockMvc
public class AuthControllerTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    public void testLoginAndAccess() throws Exception {
        mockMvc.perform(get("/api/v1/pages"))
                .andExpect(status().isUnauthorized());

        MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginName\":\"owner\",\"password\":\"owner123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.roles[0]").value("owner"))
                .andReturn();

        String body = login.getResponse().getContentAsString();
        String token = body.replaceAll("(?s).*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
        assertThat(token).isNotBlank();

        mockMvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.loginName").value("owner"));

        mockMvc.perform(get("/api/v1/pages").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    public void testClerkForbiddenConfig() throws Exception {
        MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginName\":\"clerk\",\"password\":\"clerk123\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String body = login.getResponse().getContentAsString();
        String token = body.replaceAll("(?s).*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");

        mockMvc.perform(get("/api/v1/sql-repo").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }
}
