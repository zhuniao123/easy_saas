package com.example.lowcode.service;

import cn.dev33.satoken.stp.StpUtil;
import com.example.lowcode.config.AuthProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Data-plane authorization side-effects (field strip + data scope).
 * <p>
 * Kept separate from QueryEngine / PageService so policy can evolve without
 * growing SQL execution classes. Business SQL stays clean; optional outer
 * filters apply only when page DSL declares {@code authz.dataScopeField}/{@code selfField}.
 */
@Service
public class AuthzRuntimeService {
    /** Forced param: current user's org. Client cannot override. */
    public static final String PARAM_ORG = "__scope_org_id";
    /** Forced param: current user id. Client cannot override. */
    public static final String PARAM_USER = "__scope_user_id";

    private static final Pattern SAFE_FIELD = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    private final AuthService authService;
    private final AuthProperties authProperties;
    private final NamedParameterJdbcTemplate platformJdbc;
    private final ObjectMapper objectMapper;

    public AuthzRuntimeService(
            AuthService authService,
            AuthProperties authProperties,
            NamedParameterJdbcTemplate platformJdbc,
            ObjectMapper objectMapper
    ) {
        this.authService = authService;
        this.authProperties = authProperties;
        this.platformJdbc = platformJdbc;
        this.objectMapper = objectMapper;
    }

    /**
     * Declared scope columns on a page. Empty means no automatic row filter
     * (SQL may still reference {@link #PARAM_ORG}/{@link #PARAM_USER} explicitly).
     */
    public record ScopeBinding(String orgField, String selfField) {
        public boolean isEmpty() {
            return isBlank(orgField) && isBlank(selfField);
        }
    }

    public record DataScope(String type, Long orgId, Long userId) {
        public boolean isAll() {
            return type == null || "all".equalsIgnoreCase(type);
        }
    }

    public DataScope currentDataScope() {
        if (!authProperties.isEnabled() || !StpUtil.isLogin()) {
            return new DataScope("all", null, null);
        }
        long userId = StpUtil.getLoginIdAsLong();
        Map<String, Object> scope = authService.getDataScope(userId);
        String type = scope.get("type") == null ? "all" : String.valueOf(scope.get("type"));
        Long orgId = scope.get("orgId") instanceof Number n ? n.longValue() : null;
        return new DataScope(type.toLowerCase(Locale.ROOT), orgId, userId);
    }

    /**
     * Bare field names + qualified resource codes denied for the current user.
     * Empty when auth off or full access.
     */
    public Set<String> currentFieldDenies() {
        if (!authProperties.isEnabled() || !StpUtil.isLogin()) {
            return Set.of();
        }
        List<String> list = authService.getFieldDenies(StpUtil.getLoginIdAsLong());
        Set<String> out = new HashSet<>();
        for (String d : list) {
            if (d == null || d.isBlank()) {
                continue;
            }
            String s = d.trim();
            out.add(s);
            int dot = s.lastIndexOf('.');
            if (dot >= 0 && dot < s.length() - 1) {
                out.add(s.substring(dot + 1));
            }
        }
        return out;
    }

    /**
     * Injects forced scope params. Removes any client-supplied reserved keys first.
     */
    public void applyForcedParams(Map<String, Object> params) {
        if (params == null) {
            return;
        }
        params.remove(PARAM_ORG);
        params.remove(PARAM_USER);
        params.remove("__org_id");
        params.remove("__user_id");

        DataScope scope = currentDataScope();
        if (scope.userId() != null) {
            params.put(PARAM_USER, scope.userId());
        }
        if (scope.orgId() != null) {
            params.put(PARAM_ORG, scope.orgId());
        }
    }

    /**
     * When scope is org/self and page declares matching field, wrap SQL with
     * a safe outer predicate. Never invent column names.
     */
    public String applyScopeFilter(String sqlText, Map<String, Object> params, ScopeBinding binding) {
        if (sqlText == null || sqlText.isBlank() || binding == null || binding.isEmpty()) {
            return sqlText;
        }
        DataScope scope = currentDataScope();
        if (scope.isAll()) {
            return sqlText;
        }
        applyForcedParams(params);

        List<String> predicates = new ArrayList<>();
        if ("org".equals(scope.type()) && !isBlank(binding.orgField())) {
            String field = requireSafeField(binding.orgField(), "authz.dataScopeField");
            predicates.add("\"" + field + "\" = :" + PARAM_ORG);
            if (scope.orgId() != null) {
                params.put(PARAM_ORG, scope.orgId());
            }
        } else if ("self".equals(scope.type()) && !isBlank(binding.selfField())) {
            String field = requireSafeField(binding.selfField(), "authz.selfField");
            predicates.add("\"" + field + "\" = :" + PARAM_USER);
            if (scope.userId() != null) {
                params.put(PARAM_USER, scope.userId());
            }
        }
        if (predicates.isEmpty()) {
            return sqlText;
        }
        return "SELECT * FROM (" + sqlText + ") AS scope_filtered WHERE " + String.join(" AND ", predicates);
    }

    public ScopeBinding resolveScopeBinding(String pageCode) {
        if (pageCode == null || pageCode.isBlank()) {
            return new ScopeBinding(null, null);
        }
        try {
            List<Map<String, Object>> rows = platformJdbc.queryForList(
                    "SELECT config_json::text AS cfg FROM lc_page_model WHERE page_code = :code",
                    Map.of("code", pageCode)
            );
            if (rows.isEmpty() || rows.get(0).get("cfg") == null) {
                return new ScopeBinding(null, null);
            }
            Map<String, Object> config = objectMapper.readValue(
                    String.valueOf(rows.get(0).get("cfg")),
                    new TypeReference<Map<String, Object>>() {}
            );
            Object authzRaw = config.get("authz");
            if (!(authzRaw instanceof Map<?, ?> authz)) {
                return new ScopeBinding(null, null);
            }
            String orgField = authz.get("dataScopeField") == null ? null : String.valueOf(authz.get("dataScopeField"));
            if (isBlank(orgField) && authz.get("orgField") != null) {
                orgField = String.valueOf(authz.get("orgField"));
            }
            String selfField = authz.get("selfField") == null ? null : String.valueOf(authz.get("selfField"));
            if (isBlank(orgField)) {
                orgField = null;
            }
            if (isBlank(selfField)) {
                selfField = null;
            }
            return new ScopeBinding(orgField, selfField);
        } catch (Exception ex) {
            return new ScopeBinding(null, null);
        }
    }

    @SuppressWarnings("unchecked")
    public void sanitizeQueryResult(Map<String, Object> result) {
        if (result == null) {
            return;
        }
        Set<String> denies = currentFieldDenies();
        if (denies.isEmpty()) {
            return;
        }
        Object cols = result.get("columns");
        if (cols instanceof List<?> colList) {
            List<Map<String, Object>> kept = new ArrayList<>();
            for (Object c : colList) {
                if (!(c instanceof Map<?, ?> cm)) {
                    continue;
                }
                Map<String, Object> col = (Map<String, Object>) cm;
                String field = col.get("field") == null ? null : String.valueOf(col.get("field"));
                if (field != null && isFieldDenied(field, denies)) {
                    continue;
                }
                kept.add(col);
            }
            result.put("columns", kept);
        }
        Object rows = result.get("rows");
        if (rows instanceof List<?> rowList) {
            List<Map<String, Object>> cleaned = new ArrayList<>();
            for (Object r : rowList) {
                if (r instanceof Map<?, ?> rm) {
                    cleaned.add(sanitizeRow(new LinkedHashMap<>((Map<String, Object>) rm), denies));
                }
            }
            result.put("rows", cleaned);
        }
        result.put("fieldDeniesApplied", true);
    }

    public Map<String, Object> sanitizeRow(Map<String, Object> row) {
        return sanitizeRow(row, currentFieldDenies());
    }

    public Map<String, Object> sanitizeRow(Map<String, Object> row, Set<String> denies) {
        if (row == null || denies == null || denies.isEmpty()) {
            return row;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : row.entrySet()) {
            if (e.getKey() != null && isFieldDenied(e.getKey(), denies)) {
                continue;
            }
            out.put(e.getKey(), e.getValue());
        }
        return out;
    }

    public boolean isFieldDenied(String field, Set<String> denies) {
        if (field == null || denies == null || denies.isEmpty()) {
            return false;
        }
        if (denies.contains(field)) {
            return true;
        }
        String bare = field;
        int dot = field.lastIndexOf('.');
        if (dot >= 0) {
            bare = field.substring(dot + 1);
        }
        if (denies.contains(bare)) {
            return true;
        }
        for (String d : denies) {
            if (d.endsWith("." + bare) || d.endsWith("." + field)) {
                return true;
            }
        }
        return false;
    }

    private static String requireSafeField(String field, String label) {
        String f = field.trim();
        if (!SAFE_FIELD.matcher(f).matches()) {
            throw new IllegalArgumentException(label + " must be a safe identifier: " + field);
        }
        return f;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank() || "null".equalsIgnoreCase(s);
    }
}
