package com.example.lowcode.service;

import cn.dev33.satoken.stp.StpUtil;
import com.example.lowcode.config.AuthProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class AuthService {
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private AuthProperties authProperties;

    public Map<String, Object> login(String loginName, String password) {
        if (loginName == null || loginName.isBlank() || password == null) {
            throw new IllegalArgumentException("loginName and password are required");
        }
        Map<String, Object> params = new HashMap<>();
        params.put("login", loginName.trim());
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT user_id, login_name, password_hash, display_name, org_id, enabled
                FROM lc_user WHERE login_name = :login
                """,
                params
        );
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Invalid login or password");
        }
        Map<String, Object> user = rows.get(0);
        if (user.get("enabled") instanceof Boolean b && !b) {
            throw new IllegalStateException("User is disabled");
        }
        String hash = String.valueOf(user.get("password_hash"));
        if (!passwordEncoder.matches(password, hash)) {
            throw new IllegalArgumentException("Invalid login or password");
        }
        long userId = ((Number) user.get("user_id")).longValue();
        StpUtil.login(userId);
        Map<String, Object> profile = buildProfile(userId);
        profile.put("token", StpUtil.getTokenValue());
        profile.put("tokenName", StpUtil.getTokenName());
        return profile;
    }

    public void logout() {
        if (StpUtil.isLogin()) {
            StpUtil.logout();
        }
    }

    public Map<String, Object> me() {
        ensureLoginIfEnabled();
        if (!authProperties.isEnabled()) {
            return anonymousFullAccessProfile();
        }
        long userId = StpUtil.getLoginIdAsLong();
        return buildProfile(userId);
    }

    public boolean isAuthEnabled() {
        return authProperties.isEnabled();
    }

    public void ensureLoginIfEnabled() {
        if (!authProperties.isEnabled()) {
            return;
        }
        StpUtil.checkLogin();
    }

    public void requirePermission(String permCode) {
        if (!authProperties.isEnabled()) {
            return;
        }
        StpUtil.checkLogin();
        List<String> perms = getPermissionList(StpUtil.getLoginIdAsLong());
        if (perms.contains("*") || perms.contains(permCode)) {
            return;
        }
        throw new IllegalStateException("Forbidden: missing permission " + permCode);
    }

    public boolean hasPermission(String permCode) {
        if (!authProperties.isEnabled()) {
            return true;
        }
        if (!StpUtil.isLogin()) {
            return false;
        }
        List<String> perms = getPermissionList(StpUtil.getLoginIdAsLong());
        return perms.contains("*") || perms.contains(permCode);
    }

    public List<String> getPermissionList(long userId) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        List<String> list = jdbcTemplate.query(
                """
                SELECT DISTINCT p.perm_code
                FROM lc_permission p
                JOIN lc_role_permission rp ON rp.perm_code = p.perm_code
                JOIN lc_user_role ur ON ur.role_code = rp.role_code
                WHERE ur.user_id = :userId
                ORDER BY p.perm_code
                """,
                params,
                (rs, rowNum) -> rs.getString("perm_code")
        );
        return list != null ? list : List.of();
    }

    public List<String> getRoleList(long userId) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        List<String> list = jdbcTemplate.query(
                """
                SELECT role_code FROM lc_user_role WHERE user_id = :userId ORDER BY role_code
                """,
                params,
                (rs, rowNum) -> rs.getString("role_code")
        );
        return list != null ? list : List.of();
    }

    public Map<String, Object> getDataScope(long userId) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT r.data_scope, u.org_id
                FROM lc_user u
                JOIN lc_user_role ur ON ur.user_id = u.user_id
                JOIN lc_role r ON r.role_code = ur.role_code
                WHERE u.user_id = :userId
                """,
                params
        );
        String scope = "all";
        Long orgId = 1L;
        for (Map<String, Object> row : rows) {
            String ds = String.valueOf(row.get("data_scope"));
            if ("org".equalsIgnoreCase(ds) || "self".equalsIgnoreCase(ds)) {
                scope = ds.toLowerCase();
            }
            if (row.get("org_id") instanceof Number n) {
                orgId = n.longValue();
            }
        }
        // owner all wins if any role is all
        for (Map<String, Object> row : rows) {
            if ("all".equalsIgnoreCase(String.valueOf(row.get("data_scope")))) {
                scope = "all";
                break;
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("type", scope);
        result.put("orgId", orgId);
        return result;
    }

    public List<String> getFieldDenies(long userId) {
        List<String> perms = getPermissionList(userId);
        // Convention: if field:x is NOT granted and role is clerk, deny cost fields that owner has
        // Simpler: fieldDenies = known sensitive fields not in permission list
        Set<String> sensitive = Set.of(
                "field:entity_shop_product.cost_price",
                "field:entity_product.cost_price"
        );
        List<String> denies = new ArrayList<>();
        for (String s : sensitive) {
            if (!perms.contains(s) && !perms.contains("*")) {
                denies.add(s.substring("field:".length()));
            }
        }
        return denies;
    }

    private Map<String, Object> buildProfile(long userId) {
        Map<String, Object> params = new HashMap<>();
        params.put("userId", userId);
        Map<String, Object> user = jdbcTemplate.queryForMap(
                """
                SELECT user_id AS "userId", login_name AS "loginName", display_name AS "displayName",
                       org_id AS "orgId", enabled
                FROM lc_user WHERE user_id = :userId
                """,
                params
        );
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("userId", user.get("userId"));
        profile.put("loginName", user.get("loginName"));
        profile.put("displayName", user.get("displayName"));
        profile.put("orgId", user.get("orgId"));
        profile.put("roles", getRoleList(userId));
        profile.put("permissions", getPermissionList(userId));
        profile.put("dataScope", getDataScope(userId));
        profile.put("fieldDenies", getFieldDenies(userId));
        return profile;
    }

    private Map<String, Object> anonymousFullAccessProfile() {
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("userId", 0);
        profile.put("loginName", "anonymous");
        profile.put("displayName", "Auth Disabled");
        profile.put("orgId", 1);
        profile.put("roles", List.of("owner"));
        profile.put("permissions", List.of("*"));
        profile.put("dataScope", Map.of("type", "all", "orgId", 1));
        profile.put("fieldDenies", List.of());
        return profile;
    }

    public String encodePassword(String raw) {
        return passwordEncoder.encode(raw);
    }

    /** Seed demo users/roles/permissions if empty. */
    public void ensureSeedData() {
        Integer userCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM lc_user", new HashMap<>(), Integer.class);
        if (userCount != null && userCount > 0) {
            ensurePermissionCatalog();
            return;
        }
        ensurePermissionCatalog();

        String ownerHash = passwordEncoder.encode("owner123");
        String clerkHash = passwordEncoder.encode("clerk123");
        Map<String, Object> p = new HashMap<>();
        p.put("login", "owner");
        p.put("hash", ownerHash);
        p.put("name", "店主");
        jdbcTemplate.update(
                """
                INSERT INTO lc_user(login_name, password_hash, display_name, org_id, enabled)
                VALUES (:login, :hash, :name, 1, true)
                ON CONFLICT (login_name) DO NOTHING
                """,
                p
        );
        p.put("login", "clerk");
        p.put("hash", clerkHash);
        p.put("name", "店员");
        jdbcTemplate.update(
                """
                INSERT INTO lc_user(login_name, password_hash, display_name, org_id, enabled)
                VALUES (:login, :hash, :name, 1, true)
                ON CONFLICT (login_name) DO NOTHING
                """,
                p
        );

        Long ownerId = jdbcTemplate.queryForObject(
                "SELECT user_id FROM lc_user WHERE login_name = 'owner'", new HashMap<>(), Long.class);
        Long clerkId = jdbcTemplate.queryForObject(
                "SELECT user_id FROM lc_user WHERE login_name = 'clerk'", new HashMap<>(), Long.class);

        Map<String, Object> ur = new HashMap<>();
        if (ownerId != null) {
            ur.put("uid", ownerId);
            ur.put("role", "owner");
            jdbcTemplate.update(
                    "INSERT INTO lc_user_role(user_id, role_code) VALUES (:uid, :role) ON CONFLICT DO NOTHING",
                    ur
            );
        }
        if (clerkId != null) {
            ur.put("uid", clerkId);
            ur.put("role", "clerk");
            jdbcTemplate.update(
                    "INSERT INTO lc_user_role(user_id, role_code) VALUES (:uid, :role) ON CONFLICT DO NOTHING",
                    ur
            );
        }

        grantRoleAllKnown("owner", true);
        grantRoleClerkDefaults(); // first seed only path
    }

    private void ensurePermissionCatalog() {
        // pages
        List<String> pages = jdbcTemplate.query(
                "SELECT page_code FROM lc_page_model",
                new HashMap<>(),
                (rs, i) -> rs.getString(1)
        );
        for (String page : pages) {
            upsertPerm("page:" + page, "page", page, "Page " + page);
        }
        // always include factory/sqlrepo/rbac virtual pages
        upsertPerm("page:sys-page-manager", "page", "sys-page-manager", "Page factory");
        upsertPerm("page:sys-sql-repo", "page", "sys-sql-repo", "SQL repository");
        upsertPerm("page:sys-rbac", "page", "sys-rbac", "RBAC admin console");
        upsertPerm("page:sys-data-sources", "page", "sys-data-sources", "Data source catalog");
        upsertPerm("perm:config", "page", "config", "Configure pages/SQL/actions");

        List<String> queries = jdbcTemplate.query(
                "SELECT query_code FROM lc_query_model",
                new HashMap<>(),
                (rs, i) -> rs.getString(1)
        );
        for (String q : queries) {
            upsertPerm("query:" + q, "query", q, "Query " + q);
        }

        List<String> actions = jdbcTemplate.query(
                "SELECT action_code FROM lc_action",
                new HashMap<>(),
                (rs, i) -> rs.getString(1)
        );
        for (String a : actions) {
            upsertPerm("action:" + a, "action", a, "Action " + a);
        }

        upsertPerm("field:entity_shop_product.cost_price", "field", "entity_shop_product.cost_price", "Product cost");
        upsertPerm("field:entity_product.cost_price", "field", "entity_product.cost_price", "Product cost");
    }

    private void upsertPerm(String code, String type, String resource, String desc) {
        Map<String, Object> p = new HashMap<>();
        p.put("code", code);
        p.put("type", type);
        p.put("resource", resource);
        p.put("desc", desc);
        jdbcTemplate.update(
                """
                INSERT INTO lc_permission(perm_code, perm_type, resource_code, description)
                VALUES (:code, :type, :resource, :desc)
                ON CONFLICT (perm_code) DO NOTHING
                """,
                p
        );
    }

    private void grantRoleAllKnown(String role, boolean includeConfig) {
        List<String> all = jdbcTemplate.query(
                "SELECT perm_code FROM lc_permission",
                new HashMap<>(),
                (rs, i) -> rs.getString(1)
        );
        for (String perm : all) {
            if (!includeConfig && "perm:config".equals(perm)) {
                continue;
            }
            Map<String, Object> p = new HashMap<>();
            p.put("role", role);
            p.put("perm", perm);
            jdbcTemplate.update(
                    "INSERT INTO lc_role_permission(role_code, perm_code) VALUES (:role, :perm) ON CONFLICT DO NOTHING",
                    p
            );
        }
    }

    private void grantRoleClerkDefaults() {
        // clerk: all shop pages + product_ledger, post sale/purchase, no config, no cost field, no disable product
        List<String> all = jdbcTemplate.query(
                "SELECT perm_code FROM lc_permission",
                new HashMap<>(),
                (rs, i) -> rs.getString(1)
        );
        Set<String> deny = Set.of(
                "perm:config",
                "page:sys-sql-repo",
                "page:sys-page-manager",
                "page:sys-rbac",
                "page:sys-data-sources",
                "action:shop_disable_product",
                "action:disable_product",
                "field:entity_shop_product.cost_price",
                "field:entity_product.cost_price"
        );
        for (String perm : all) {
            if (deny.contains(perm)) {
                continue;
            }
            // clerk: skip config-like pages if any
            if (perm.startsWith("page:cfg") || perm.startsWith("page:val_")) {
                continue;
            }
            Map<String, Object> p = new HashMap<>();
            p.put("role", "clerk");
            p.put("perm", perm);
            jdbcTemplate.update(
                    "INSERT INTO lc_role_permission(role_code, perm_code) VALUES (:role, :perm) ON CONFLICT DO NOTHING",
                    p
            );
        }
    }

    /**
     * Sync permission catalog from pages/queries/actions and ensure owner has all.
     * Does NOT re-apply clerk defaults — admin matrix edits must stick.
     */
    public void refreshRoleGrants() {
        ensurePermissionCatalog();
        grantRoleAllKnown("owner", true);
    }

    /** First-time seed only: apply clerk default matrix. */
    public void applyClerkDefaultsIfNeeded() {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM lc_role_permission WHERE role_code = 'clerk'",
                new HashMap<>(),
                Integer.class
        );
        if (n != null && n == 0) {
            grantRoleClerkDefaults();
        }
    }

    /**
     * After Factory creates a page: register page/query permissions and grant to
     * every role that already has perm:config (owner / admins).
     */
    public void registerFactoryPageResources(String pageCode, String queryCode) {
        if (pageCode != null && !pageCode.isBlank()) {
            upsertPerm("page:" + pageCode, "page", pageCode, "Page " + pageCode);
            grantToConfigRoles("page:" + pageCode);
        }
        if (queryCode != null && !queryCode.isBlank()) {
            upsertPerm("query:" + queryCode, "query", queryCode, "Query " + queryCode);
            grantToConfigRoles("query:" + queryCode);
        }
    }

    public void unregisterFactoryPageResources(String pageCode, String queryCode) {
        Map<String, Object> p = new HashMap<>();
        if (pageCode != null && !pageCode.isBlank()) {
            p.put("code", "page:" + pageCode);
            jdbcTemplate.update("DELETE FROM lc_role_permission WHERE perm_code = :code", p);
            jdbcTemplate.update("DELETE FROM lc_permission WHERE perm_code = :code", p);
        }
        if (queryCode != null && !queryCode.isBlank()) {
            p.put("code", "query:" + queryCode);
            jdbcTemplate.update("DELETE FROM lc_role_permission WHERE perm_code = :code", p);
            jdbcTemplate.update("DELETE FROM lc_permission WHERE perm_code = :code", p);
        }
    }

    private void grantToConfigRoles(String permCode) {
        List<String> roles = jdbcTemplate.query(
                """
                SELECT DISTINCT role_code FROM lc_role_permission WHERE perm_code = 'perm:config'
                UNION
                SELECT 'owner' WHERE EXISTS (SELECT 1 FROM lc_role WHERE role_code = 'owner')
                """,
                new HashMap<>(),
                (rs, i) -> rs.getString(1)
        );
        for (String role : roles) {
            Map<String, Object> p = new HashMap<>();
            p.put("role", role);
            p.put("perm", permCode);
            jdbcTemplate.update(
                    "INSERT INTO lc_role_permission(role_code, perm_code) VALUES (:role, :perm) ON CONFLICT DO NOTHING",
                    p
            );
        }
    }
}
