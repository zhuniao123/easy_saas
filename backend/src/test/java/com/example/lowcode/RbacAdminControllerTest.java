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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "lowcode.auth.enabled=true")
@AutoConfigureMockMvc
public class RbacAdminControllerTest {
    @Autowired
    private MockMvc mockMvc;

    private String login(String user, String pass) throws Exception {
        MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginName\":\"" + user + "\",\"password\":\"" + pass + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        String body = login.getResponse().getContentAsString();
        return body.replaceAll("(?s).*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    @Test
    public void clerkCannotAccessRbacAdmin() throws Exception {
        String token = login("clerk", "clerk123");
        mockMvc.perform(get("/api/v1/admin/rbac/users").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test
    public void ownerCanConfigurePagePermissions() throws Exception {
        String token = login("owner", "owner123");

        mockMvc.perform(get("/api/v1/admin/rbac/users").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].loginName").isNotEmpty());

        mockMvc.perform(get("/api/v1/admin/rbac/permissions")
                        .param("type", "page")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        // Read clerk page perms, then re-save same set (idempotent smoke)
        MvcResult rolePerms = mockMvc.perform(get("/api/v1/admin/rbac/roles/clerk/permissions")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn();
        String body = rolePerms.getResponse().getContentAsString();
        assertThat(body).contains("permCodes");

        // Ensure shop_products page exists in catalog after refresh
        mockMvc.perform(post("/api/v1/admin/rbac/refresh-catalog")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        // Grant only a known page set for clerk
        mockMvc.perform(put("/api/v1/admin/rbac/roles/clerk/permissions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"permType\":\"page\",\"permCodes\":[\"page:shop_products\",\"page:product_ledger\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roleCode").value("clerk"));

        String clerkToken = login("clerk", "clerk123");
        MvcResult pages = mockMvc.perform(get("/api/v1/pages").header("Authorization", "Bearer " + clerkToken))
                .andExpect(status().isOk())
                .andReturn();
        String pageBody = pages.getResponse().getContentAsString();
        assertThat(pageBody).contains("shop_products");
        assertThat(pageBody.contains("shop_sales")).isFalse();

        // Restore demo-friendly clerk page matrix so shared DB stays usable
        mockMvc.perform(put("/api/v1/admin/rbac/roles/clerk/permissions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"permType":"page","permCodes":[
                                  "page:shop_products","page:shop_sales","page:shop_purchases",
                                  "page:shop_stock_moves","page:shop_customers","page:shop_suppliers",
                                  "page:shop_low_stock","page:shop_today_sales","page:product_ledger"
                                ]}
                                """))
                .andExpect(status().isOk());
    }
}
