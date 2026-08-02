package com.example.lowcode.service;

import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Optional locks at the start of a sqlTransaction (entity/action DSL).
 * <p>
 * Config shape (under action sqlTransaction or root):
 * <pre>
 * "locks": [
 *   { "mode": "row", "table": "shop_product", "where": "id = :product_id", "order": 1 },
 *   { "mode": "advisory", "key": 90001, "order": 0 }
 * ]
 * </pre>
 * Modes: {@code row} → SELECT 1 FROM "table" WHERE … FOR UPDATE;
 * {@code advisory} → pg_advisory_xact_lock(key).
 * Business SQL stays free of lock boilerplate when declared here.
 */
@Service
public class ActionLockService {
    private static final Pattern SAFE_IDENT = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");
    private static final Pattern NAMED_PARAM = Pattern.compile("(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)");

    public void applyLocks(Connection connection, Object locksRaw, Map<String, Object> boundParams) throws Exception {
        List<Map<String, Object>> locks = parseLocks(locksRaw);
        if (locks.isEmpty()) {
            return;
        }
        locks.sort(Comparator.comparingInt(l -> {
            Object o = l.get("order");
            if (o instanceof Number n) {
                return n.intValue();
            }
            return 100;
        }));
        for (Map<String, Object> lock : locks) {
            String mode = lock.get("mode") == null ? "row" : String.valueOf(lock.get("mode")).trim().toLowerCase(Locale.ROOT);
            if ("advisory".equals(mode) || "pg_advisory".equals(mode)) {
                applyAdvisory(connection, lock);
            } else if ("row".equals(mode) || "for_update".equals(mode) || "forupdate".equals(mode)) {
                applyRowLock(connection, lock, boundParams);
            } else {
                throw new IllegalArgumentException("Unsupported lock mode: " + mode);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseLocks(Object locksRaw) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(locksRaw instanceof List<?> list)) {
            return out;
        }
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
        }
        return out;
    }

    private void applyAdvisory(Connection connection, Map<String, Object> lock) throws Exception {
        Object keyObj = lock.get("key") != null ? lock.get("key") : lock.get("lockKey");
        if (keyObj == null) {
            throw new IllegalArgumentException("advisory lock requires numeric key");
        }
        long key;
        try {
            key = Long.parseLong(String.valueOf(keyObj));
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("advisory lock key must be numeric: " + keyObj);
        }
        try (Statement st = connection.createStatement()) {
            st.execute("SELECT pg_advisory_xact_lock(" + key + ")");
        }
    }

    private void applyRowLock(Connection connection, Map<String, Object> lock, Map<String, Object> boundParams)
            throws Exception {
        String table = lock.get("table") == null ? null : String.valueOf(lock.get("table")).trim();
        String where = lock.get("where") == null ? null : String.valueOf(lock.get("where")).trim();
        if (table == null || !SAFE_IDENT.matcher(table).matches()) {
            throw new IllegalArgumentException("row lock requires safe table identifier");
        }
        if (where == null || where.isBlank()) {
            throw new IllegalArgumentException("row lock requires where clause with named params");
        }
        // Reject multi-statement / dangerous fragments
        String lower = where.toLowerCase(Locale.ROOT);
        if (where.contains(";") || lower.contains(" for update") || lower.contains("union ")
                || lower.contains(" insert ") || lower.contains(" delete ") || lower.contains(" update ")) {
            throw new IllegalArgumentException("lock where clause rejected");
        }
        String sql = "SELECT 1 FROM \"" + table + "\" WHERE " + where + " FOR UPDATE";
        String jdbcSql = toJdbcPlaceholders(sql);
        try (PreparedStatement ps = connection.prepareStatement(jdbcSql)) {
            bindNamed(ps, sql, boundParams);
            try (ResultSet rs = ps.executeQuery()) {
                // consume
                while (rs.next()) {
                    /* lock held until tx end */
                }
            }
        }
    }

    private String toJdbcPlaceholders(String sql) {
        Matcher matcher = NAMED_PARAM.matcher(sql);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            matcher.appendReplacement(sb, "?");
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private void bindNamed(PreparedStatement ps, String sql, Map<String, Object> params) throws Exception {
        Matcher matcher = NAMED_PARAM.matcher(sql);
        int index = 1;
        while (matcher.find()) {
            String name = matcher.group(1);
            Object val = params == null ? null : params.get(name);
            ps.setObject(index++, val);
        }
    }
}
