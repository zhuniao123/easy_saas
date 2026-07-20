package com.example.lowcode.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Admin CRUD for users / role-permission matrix. Requires perm:config at controller/interceptor.
 */
@Service
public class RbacAdminService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private AuthService authService;

    public List<Map<String, Object>> listUsers() {
        List<Map<String, Object>> users = jdbcTemplate.queryForList(
                """
                SELECT user_id AS "userId", login_name AS "loginName", display_name AS "displayName",
                       org_id AS "orgId", enabled, created_at AS "createdAt"
                FROM lc_user
                ORDER BY user_id
                """,
                new HashMap<>()
        );
        for (Map<String, Object> u : users) {
            long uid = ((Number) u.get("userId")).longValue();
            u.put("roles", authService.getRoleList(uid));
        }
        return users;
    }

    @Transactional
    public Map<String, Object> createUser(Map<String, Object> body) {
        String loginName = str(body.get("loginName"));
        String password = str(body.get("password"));
        String displayName = str(body.get("displayName"));
        if (loginName.isBlank() || password.isBlank()) {
            throw new IllegalArgumentException("loginName and password are required");
        }
        if (displayName.isBlank()) {
            displayName = loginName;
        }
        boolean enabled = body.get("enabled") == null || Boolean.TRUE.equals(body.get("enabled"))
                || "true".equalsIgnoreCase(String.valueOf(body.get("enabled")));
        Long orgId = body.get("orgId") instanceof Number n ? n.longValue() : 1L;

        Map<String, Object> p = new HashMap<>();
        p.put("login", loginName.trim());
        p.put("hash", authService.encodePassword(password));
        p.put("name", displayName.trim());
        p.put("orgId", orgId);
        p.put("enabled", enabled);
        try {
            jdbcTemplate.update(
                    """
                    INSERT INTO lc_user(login_name, password_hash, display_name, org_id, enabled)
                    VALUES (:login, :hash, :name, :orgId, :enabled)
                    """,
                    p
            );
        } catch (Exception ex) {
            throw new IllegalArgumentException("loginName already exists or invalid: " + loginName, ex);
        }

        Long userId = jdbcTemplate.queryForObject(
                "SELECT user_id FROM lc_user WHERE login_name = :login",
                p,
                Long.class
        );
        List<String> roles = stringList(body.get("roles"));
        if (roles.isEmpty()) {
            roles = List.of("clerk");
        }
        replaceUserRoles(userId, roles);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "success");
        out.put("userId", userId);
        out.put("loginName", loginName);
        out.put("roles", roles);
        return out;
    }

    @Transactional
    public Map<String, Object> updateUser(long userId, Map<String, Object> body) {
        Map<String, Object> existing = loadUser(userId);
        if (existing == null) {
            throw new IllegalArgumentException("User not found: " + userId);
        }

        String displayName = body.containsKey("displayName")
                ? str(body.get("displayName"))
                : str(existing.get("displayName"));
        boolean enabled = body.containsKey("enabled")
                ? Boolean.TRUE.equals(body.get("enabled")) || "true".equalsIgnoreCase(String.valueOf(body.get("enabled")))
                : Boolean.TRUE.equals(existing.get("enabled"));
        Long orgId = body.get("orgId") instanceof Number n
                ? n.longValue()
                : (existing.get("orgId") instanceof Number n2 ? n2.longValue() : 1L);

        Map<String, Object> p = new HashMap<>();
        p.put("userId", userId);
        p.put("name", displayName);
        p.put("enabled", enabled);
        p.put("orgId", orgId);
        jdbcTemplate.update(
                """
                UPDATE lc_user SET display_name = :name, enabled = :enabled, org_id = :orgId
                WHERE user_id = :userId
                """,
                p
        );

        if (body.get("password") != null && !str(body.get("password")).isBlank()) {
            p.put("hash", authService.encodePassword(str(body.get("password"))));
            jdbcTemplate.update(
                    "UPDATE lc_user SET password_hash = :hash WHERE user_id = :userId",
                    p
            );
        }

        if (body.containsKey("roles")) {
            List<String> roles = stringList(body.get("roles"));
            if (roles.isEmpty()) {
                throw new IllegalArgumentException("roles cannot be empty");
            }
            // prevent locking out the last owner
            if (!roles.contains("owner") && isLastOwner(userId)) {
                throw new IllegalStateException("Cannot remove the last owner role");
            }
            replaceUserRoles(userId, roles);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "success");
        out.put("userId", userId);
        out.put("roles", authService.getRoleList(userId));
        return out;
    }

    public List<Map<String, Object>> listRoles() {
        return jdbcTemplate.queryForList(
                """
                SELECT role_code AS "roleCode", name, data_scope AS "dataScope"
                FROM lc_role
                ORDER BY role_code
                """,
                new HashMap<>()
        );
    }

    public List<Map<String, Object>> listPermissions(String typeFilter) {
        Map<String, Object> p = new HashMap<>();
        String sql = """
                SELECT perm_code AS "permCode", perm_type AS "permType",
                       resource_code AS "resourceCode", description
                FROM lc_permission
                """;
        if (typeFilter != null && !typeFilter.isBlank()) {
            sql += " WHERE perm_type = :type ";
            p.put("type", typeFilter.trim());
        }
        sql += " ORDER BY perm_type, perm_code ";
        return jdbcTemplate.queryForList(sql, p);
    }

    public Map<String, Object> getRolePermissions(String roleCode) {
        ensureRole(roleCode);
        Map<String, Object> p = new HashMap<>();
        p.put("role", roleCode);
        List<String> perms = jdbcTemplate.query(
                """
                SELECT perm_code FROM lc_role_permission
                WHERE role_code = :role
                ORDER BY perm_code
                """,
                p,
                (rs, i) -> rs.getString(1)
        );
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("roleCode", roleCode);
        out.put("permCodes", perms != null ? perms : List.of());
        return out;
    }

    /**
     * Replace permission grants for a role.
     * When permType is provided, only that type is replaced (others kept).
     */
    @Transactional
    public Map<String, Object> setRolePermissions(String roleCode, Map<String, Object> body) {
        ensureRole(roleCode);
        List<String> requested = stringList(body.get("permCodes"));
        String onlyType = body.get("permType") == null ? null : str(body.get("permType"));

        // validate perm codes exist
        Set<String> allKnown = listPermissions(null).stream()
                .map(m -> String.valueOf(m.get("permCode")))
                .collect(Collectors.toSet());
        for (String code : requested) {
            if (!allKnown.contains(code)) {
                throw new IllegalArgumentException("Unknown permission: " + code);
            }
            if (onlyType != null && !onlyType.isBlank()) {
                String t = code.contains(":") ? code.substring(0, code.indexOf(':')) : "";
                // field: and page: action: query: — also perm:config has type page in seed
                Map<String, Object> meta = findPerm(code);
                if (meta != null && !onlyType.equals(String.valueOf(meta.get("permType")))) {
                    throw new IllegalArgumentException("Permission " + code + " is not type " + onlyType);
                }
            }
        }

        Map<String, Object> p = new HashMap<>();
        p.put("role", roleCode);

        if (onlyType != null && !onlyType.isBlank()) {
            p.put("type", onlyType);
            jdbcTemplate.update(
                    """
                    DELETE FROM lc_role_permission
                    WHERE role_code = :role
                      AND perm_code IN (
                        SELECT perm_code FROM lc_permission WHERE perm_type = :type
                      )
                    """,
                    p
            );
        } else {
            jdbcTemplate.update("DELETE FROM lc_role_permission WHERE role_code = :role", p);
        }

        for (String code : requested) {
            Map<String, Object> ins = new HashMap<>();
            ins.put("role", roleCode);
            ins.put("perm", code);
            jdbcTemplate.update(
                    "INSERT INTO lc_role_permission(role_code, perm_code) VALUES (:role, :perm) ON CONFLICT DO NOTHING",
                    ins
            );
        }

        // owner should always keep perm:config so admin UI is not locked out
        if ("owner".equals(roleCode)) {
            Map<String, Object> ins = new HashMap<>();
            ins.put("role", "owner");
            ins.put("perm", "perm:config");
            jdbcTemplate.update(
                    "INSERT INTO lc_role_permission(role_code, perm_code) VALUES (:role, :perm) ON CONFLICT DO NOTHING",
                    ins
            );
            ins.put("perm", "page:sys-rbac");
            jdbcTemplate.update(
                    "INSERT INTO lc_role_permission(role_code, perm_code) VALUES (:role, :perm) ON CONFLICT DO NOTHING",
                    ins
            );
        }

        return getRolePermissions(roleCode);
    }

    public Map<String, Object> refreshCatalog() {
        authService.refreshRoleGrants();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "success");
        out.put("permissionCount", listPermissions(null).size());
        return out;
    }

    private Map<String, Object> findPerm(String code) {
        Map<String, Object> p = new HashMap<>();
        p.put("code", code);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT perm_code AS "permCode", perm_type AS "permType"
                FROM lc_permission WHERE perm_code = :code
                """,
                p
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void ensureRole(String roleCode) {
        Map<String, Object> p = new HashMap<>();
        p.put("role", roleCode);
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM lc_role WHERE role_code = :role",
                p,
                Integer.class
        );
        if (n == null || n == 0) {
            throw new IllegalArgumentException("Unknown role: " + roleCode);
        }
    }

    private Map<String, Object> loadUser(long userId) {
        Map<String, Object> p = new HashMap<>();
        p.put("userId", userId);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT user_id AS "userId", login_name AS "loginName", display_name AS "displayName",
                       org_id AS "orgId", enabled
                FROM lc_user WHERE user_id = :userId
                """,
                p
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void replaceUserRoles(Long userId, List<String> roles) {
        Map<String, Object> p = new HashMap<>();
        p.put("userId", userId);
        jdbcTemplate.update("DELETE FROM lc_user_role WHERE user_id = :userId", p);
        for (String role : roles) {
            ensureRole(role);
            p.put("role", role);
            jdbcTemplate.update(
                    "INSERT INTO lc_user_role(user_id, role_code) VALUES (:userId, :role) ON CONFLICT DO NOTHING",
                    p
            );
        }
    }

    private boolean isLastOwner(long userId) {
        Integer owners = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(DISTINCT ur.user_id)
                FROM lc_user_role ur
                JOIN lc_user u ON u.user_id = ur.user_id
                WHERE ur.role_code = 'owner' AND u.enabled = true
                """,
                new HashMap<>(),
                Integer.class
        );
        if (owners == null || owners > 1) {
            return false;
        }
        List<String> roles = authService.getRoleList(userId);
        return roles.contains("owner");
    }

    private static String str(Object o) {
        return o == null || "null".equals(String.valueOf(o)) ? "" : String.valueOf(o).trim();
    }

    @SuppressWarnings("unchecked")
    private static List<String> stringList(Object o) {
        if (o == null) {
            return new ArrayList<>();
        }
        if (o instanceof List<?> list) {
            return list.stream().filter(Objects::nonNull).map(String::valueOf).map(String::trim)
                    .filter(s -> !s.isEmpty()).collect(Collectors.toCollection(ArrayList::new));
        }
        String s = str(o);
        if (s.isEmpty()) {
            return new ArrayList<>();
        }
        List<String> out = new ArrayList<>();
        for (String part : s.split(",")) {
            if (!part.trim().isEmpty()) {
                out.add(part.trim());
            }
        }
        return out;
    }
}
