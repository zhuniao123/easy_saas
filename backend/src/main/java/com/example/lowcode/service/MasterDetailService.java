package com.example.lowcode.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Generic master-detail (header + lines) save in a single DB transaction.
 * Config-driven via page config_json.masterDetail — no business domain code.
 */
@Service
public class MasterDetailService {
    private static final Pattern SAFE_IDENT = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    @Autowired
    private PageService pageService;
    @Autowired
    private JdbcDataSourceRegistry jdbcDataSourceRegistry;
    @Autowired
    private AuthzRuntimeService authzRuntimeService;
    @Autowired
    private ObjectMapper objectMapper;

    @SuppressWarnings("unchecked")
    public Map<String, Object> save(String pageCode, Map<String, Object> body) {
        if (pageCode == null || pageCode.isBlank()) {
            throw new IllegalArgumentException("pageCode is required");
        }
        Map<String, Object> page = pageService.getPageConfig(pageCode);
        Map<String, Object> pageConfig = parseJsonMap(String.valueOf(page.get("config")));
        Map<String, Object> md = asMap(pageConfig.get("masterDetail"));
        if (md == null || md.isEmpty() || Boolean.FALSE.equals(md.get("enabled"))) {
            throw new IllegalArgumentException("Page is not a masterDetail page (config.masterDetail.enabled)");
        }

        Map<String, Object> headerSpec = asMap(md.get("header"));
        Map<String, Object> linesSpec = asMap(md.get("lines"));
        if (headerSpec == null || linesSpec == null) {
            throw new IllegalArgumentException("masterDetail.header and masterDetail.lines are required");
        }

        String headerEntityCode = stringOrNull(headerSpec.get("entityCode"));
        String linesEntityCode = stringOrNull(linesSpec.get("entityCode"));
        if (headerEntityCode == null || linesEntityCode == null) {
            throw new IllegalArgumentException("header.entityCode and lines.entityCode are required");
        }

        Map<String, Object> headerEntity = pageService.getEntityConfig(headerEntityCode);
        Map<String, Object> linesEntity = pageService.getEntityConfig(linesEntityCode);

        String headerTable = requireIdent((String) headerEntity.get("tableName"), "header table");
        String headerPk = requireIdent(
                firstNonBlank((String) headerEntity.get("primaryKey"), stringOrNull(headerSpec.get("primaryKey")), "id"),
                "header pk");
        String linesTable = requireIdent((String) linesEntity.get("tableName"), "lines table");
        String linesPk = requireIdent(
                firstNonBlank((String) linesEntity.get("primaryKey"), stringOrNull(linesSpec.get("primaryKey")), "id"),
                "lines pk");
        String fkField = requireIdent(
                firstNonBlank(stringOrNull(linesSpec.get("fkField")), "order_id"),
                "lines fkField");
        String versionField = stringOrNull(headerSpec.get("versionField"));
        if (versionField != null) {
            versionField = requireIdent(versionField, "versionField");
        }
        String statusField = firstNonBlank(stringOrNull(headerSpec.get("statusField")), "status");
        if (statusField != null && !SAFE_IDENT.matcher(statusField).matches()) {
            statusField = "status";
        }

        Map<String, Object> headerIn = asMap(body != null ? body.get("header") : null);
        if (headerIn == null) {
            headerIn = new HashMap<>();
        }
        List<Map<String, Object>> linesIn = asListOfMaps(body != null ? body.get("lines") : null);
        String mode = firstNonBlank(stringOrNull(body != null ? body.get("mode") : null), "draft").toLowerCase(Locale.ROOT);
        // draft | submit
        if (!"draft".equals(mode) && !"submit".equals(mode)) {
            throw new IllegalArgumentException("mode must be draft or submit");
        }

        // Apply submit status if configured
        String submitStatus = firstNonBlank(stringOrNull(md.get("submitStatus")), "submitted");
        String draftStatus = firstNonBlank(stringOrNull(md.get("draftStatus")), "draft");
        if ("submit".equals(mode) && statusField != null) {
            headerIn.put(statusField, submitStatus);
        } else if ("draft".equals(mode) && statusField != null && !headerIn.containsKey(statusField)) {
            headerIn.put(statusField, draftStatus);
        }

        // Field deny strip
        final Map<String, Object> headerData = authzRuntimeService.sanitizeRow(new HashMap<>(headerIn));
        List<Map<String, Object>> cleanLines = new ArrayList<>();
        for (Map<String, Object> line : linesIn) {
            Map<String, Object> copy = authzRuntimeService.sanitizeRow(new HashMap<>(line));
            cleanLines.add(copy);
        }

        // Basic validation
        if ("submit".equals(mode)) {
            long activeLines = cleanLines.stream()
                    .filter(l -> !"deleted".equalsIgnoreCase(stringOrNull(l.get("_rowState"))))
                    .count();
            if (activeLines == 0) {
                throw new IllegalArgumentException("Submit requires at least one line item");
            }
            String memberField = stringOrNull(headerSpec.get("requiredMemberField"));
            if (memberField != null && isBlank(headerData.get(memberField))) {
                throw new IllegalArgumentException("Member is required before submit");
            }
        }

        Set<String> headerCols = allowedColumns(headerEntity, headerSpec);
        Set<String> lineCols = allowedColumns(linesEntity, linesSpec);
        headerCols.add(headerPk);
        if (versionField != null) {
            headerCols.add(versionField);
        }
        if (statusField != null) {
            headerCols.add(statusField);
        }
        lineCols.add(linesPk);
        lineCols.add(fkField);

        NamedParameterJdbcTemplate jdbc = jdbcDataSourceRegistry.resolveForPage(pageCode);
        final String versionFieldFinal = versionField;
        final String statusFieldFinal = statusField;
        final Set<String> headerColsFinal = headerCols;
        final Set<String> lineColsFinal = lineCols;
        final List<Map<String, Object>> cleanLinesFinal = cleanLines;

        Map<String, Object> result = jdbc.getJdbcOperations().execute((ConnectionCallback<Map<String, Object>>) connection -> {
            boolean prev = connection.getAutoCommit();
            connection.setAutoCommit(false);
            try {
                Object rawHeaderId = headerData.get(headerPk);
                final boolean isNew = rawHeaderId == null || String.valueOf(rawHeaderId).isBlank();
                final Object headerId;
                final long versionOut;

                if (isNew) {
                    Map<String, Object> insertCols = filterColumns(headerData, headerColsFinal, headerPk, true);
                    if (versionFieldFinal != null) {
                        insertCols.put(versionFieldFinal, 1);
                    }
                    headerId = insertReturningId(connection, headerTable, headerPk, insertCols);
                    versionOut = 1L;
                } else {
                    Object coercedId = coerceId(rawHeaderId);
                    long nextVersion = 1L;
                    // Optimistic lock
                    if (versionFieldFinal != null) {
                        Object expected = headerData.get(versionFieldFinal);
                        if (expected == null) {
                            throw new IllegalArgumentException("version is required for update (" + versionFieldFinal + ")");
                        }
                        long current = readVersion(connection, headerTable, headerPk, coercedId, versionFieldFinal);
                        long expectedLong = toLong(expected);
                        if (current != expectedLong) {
                            throw new IllegalStateException("Optimistic lock failed: header was modified by another user");
                        }
                        nextVersion = current + 1;
                    }
                    Map<String, Object> updateCols = filterColumns(headerData, headerColsFinal, headerPk, false);
                    if (versionFieldFinal != null) {
                        updateCols.put(versionFieldFinal, nextVersion);
                    }
                    int updated = updateByPk(connection, headerTable, headerPk, coercedId, updateCols);
                    if (updated == 0) {
                        throw new IllegalStateException("Header not found: " + coercedId);
                    }
                    headerId = coercedId;
                    versionOut = nextVersion;
                }

                for (Map<String, Object> line : cleanLinesFinal) {
                    String rowState = firstNonBlank(stringOrNull(line.get("_rowState")), "unchanged").toLowerCase(Locale.ROOT);
                    Object lineId = line.get(linesPk);
                    // strip control fields
                    Map<String, Object> data = filterColumns(line, lineColsFinal, linesPk, "added".equals(rowState) || isNew);
                    data.put(fkField, headerId);

                    switch (rowState) {
                        case "added", "new" -> {
                            data.remove(linesPk);
                            data.remove("_tempId");
                            insertReturningId(connection, linesTable, linesPk, data);
                        }
                        case "modified", "updated" -> {
                            if (lineId == null || String.valueOf(lineId).isBlank()) {
                                throw new IllegalArgumentException("modified line requires primary key");
                            }
                            updateByPk(connection, linesTable, linesPk, coerceId(lineId), data);
                        }
                        case "deleted", "removed" -> {
                            if (lineId != null && !String.valueOf(lineId).isBlank()) {
                                deleteByPk(connection, linesTable, linesPk, coerceId(lineId));
                            }
                            // temp-only deleted lines: no-op
                        }
                        case "unchanged", "clean" -> {
                            // no write
                        }
                        default -> throw new IllegalArgumentException("Unknown _rowState: " + rowState);
                    }
                }

                connection.commit();

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("status", "success");
                out.put("headerId", headerId);
                out.put("mode", mode);
                if (versionFieldFinal != null) {
                    out.put("version", versionOut);
                }
                if (statusFieldFinal != null) {
                    out.put("statusValue", headerData.get(statusFieldFinal));
                }
                return out;
            } catch (RuntimeException ex) {
                try {
                    connection.rollback();
                } catch (Exception ignored) {
                    // ignore
                }
                throw ex;
            } catch (Exception ex) {
                try {
                    connection.rollback();
                } catch (Exception ignored) {
                    // ignore
                }
                throw new IllegalStateException(ex.getMessage(), ex);
            } finally {
                try {
                    connection.setAutoCommit(prev);
                } catch (Exception ignored) {
                    // ignore
                }
            }
        });

        if (result == null) {
            throw new IllegalStateException("master-detail save returned null");
        }
        return result;
    }

    private Set<String> allowedColumns(Map<String, Object> entity, Map<String, Object> spec) {
        Set<String> cols = new LinkedHashSet<>();
        Object fields = spec.get("fields");
        if (fields instanceof List<?> list && !list.isEmpty()) {
            for (Object f : list) {
                if (f instanceof String s && SAFE_IDENT.matcher(s).matches()) {
                    cols.add(s);
                } else if (f instanceof Map<?, ?> m && m.get("field") != null) {
                    String name = String.valueOf(m.get("field"));
                    if (SAFE_IDENT.matcher(name).matches()) {
                        cols.add(name);
                    }
                }
            }
        }
        // Fall back to entity fields_json
        if (cols.isEmpty()) {
            try {
                List<Map<String, Object>> resolved = pageService.resolveEntityFields(entity);
                for (Map<String, Object> f : resolved) {
                    Object name = f.get("field");
                    if (name != null && SAFE_IDENT.matcher(String.valueOf(name)).matches()) {
                        cols.add(String.valueOf(name));
                    }
                }
            } catch (Exception ignored) {
                // empty allow-list will reject writes
            }
        }
        return cols;
    }

    private Map<String, Object> filterColumns(
            Map<String, Object> source,
            Set<String> allowed,
            String pk,
            boolean forInsert) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : source.entrySet()) {
            String k = e.getKey();
            if (k == null || k.startsWith("_")) {
                continue;
            }
            if (!SAFE_IDENT.matcher(k).matches()) {
                continue;
            }
            if (!allowed.contains(k)) {
                continue;
            }
            if (!forInsert && k.equals(pk)) {
                continue;
            }
            if (forInsert && k.equals(pk) && (e.getValue() == null || String.valueOf(e.getValue()).isBlank())) {
                continue;
            }
            out.put(k, e.getValue());
        }
        return out;
    }

    private Object insertReturningId(Connection connection, String table, String pk, Map<String, Object> cols)
            throws Exception {
        if (cols.isEmpty()) {
            throw new IllegalArgumentException("No columns to insert into " + table);
        }
        StringBuilder sql = new StringBuilder("INSERT INTO \"").append(table).append("\" (");
        StringBuilder vals = new StringBuilder(") VALUES (");
        List<String> keys = new ArrayList<>(cols.keySet());
        for (int i = 0; i < keys.size(); i++) {
            if (i > 0) {
                sql.append(", ");
                vals.append(", ");
            }
            sql.append("\"").append(keys.get(i)).append("\"");
            vals.append("?");
        }
        vals.append(") RETURNING \"").append(pk).append("\"");
        String full = sql.append(vals).toString();
        try (PreparedStatement ps = connection.prepareStatement(full)) {
            for (int i = 0; i < keys.size(); i++) {
                ps.setObject(i + 1, cols.get(keys.get(i)));
            }
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return rs.getObject(1);
                }
            }
        }
        throw new IllegalStateException("INSERT did not return primary key for " + table);
    }

    private int updateByPk(Connection connection, String table, String pk, Object id, Map<String, Object> cols)
            throws Exception {
        if (cols.isEmpty()) {
            return 0;
        }
        StringBuilder sql = new StringBuilder("UPDATE \"").append(table).append("\" SET ");
        List<String> keys = new ArrayList<>(cols.keySet());
        for (int i = 0; i < keys.size(); i++) {
            if (i > 0) {
                sql.append(", ");
            }
            sql.append("\"").append(keys.get(i)).append("\" = ?");
        }
        sql.append(" WHERE \"").append(pk).append("\" = ?");
        try (PreparedStatement ps = connection.prepareStatement(sql.toString())) {
            for (int i = 0; i < keys.size(); i++) {
                ps.setObject(i + 1, cols.get(keys.get(i)));
            }
            ps.setObject(keys.size() + 1, id);
            return ps.executeUpdate();
        }
    }

    private void deleteByPk(Connection connection, String table, String pk, Object id) throws Exception {
        String sql = "DELETE FROM \"" + table + "\" WHERE \"" + pk + "\" = ?";
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            ps.setObject(1, id);
            ps.executeUpdate();
        }
    }

    private long readVersion(Connection connection, String table, String pk, Object id, String versionField)
            throws Exception {
        String sql = "SELECT \"" + versionField + "\" FROM \"" + table + "\" WHERE \"" + pk + "\" = ? FOR UPDATE";
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            ps.setObject(1, id);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new IllegalStateException("Header not found for lock: " + id);
                }
                Object v = rs.getObject(1);
                return toLong(v);
            }
        }
    }

    private long toLong(Object v) {
        if (v instanceof Number n) {
            return n.longValue();
        }
        if (v instanceof BigDecimal bd) {
            return bd.longValue();
        }
        return Long.parseLong(String.valueOf(v));
    }

    private Object coerceId(Object id) {
        if (id instanceof Number) {
            return id;
        }
        String s = String.valueOf(id);
        if (s.matches("^\\d+$")) {
            try {
                return Long.parseLong(s);
            } catch (NumberFormatException ignored) {
                return s;
            }
        }
        return id;
    }

    private String requireIdent(String value, String label) {
        if (value == null || !SAFE_IDENT.matcher(value).matches()) {
            throw new IllegalArgumentException("Invalid " + label + ": " + value);
        }
        return value;
    }

    private boolean isBlank(Object v) {
        return v == null || String.valueOf(v).trim().isEmpty();
    }

    private String stringOrNull(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() || "null".equalsIgnoreCase(s) ? null : s;
    }

    private String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object raw) {
        if (raw instanceof Map<?, ?> m) {
            return new LinkedHashMap<>((Map<String, Object>) m);
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> asListOfMaps(Object raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(raw instanceof List<?> list)) {
            return out;
        }
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) {
                out.add(new LinkedHashMap<>((Map<String, Object>) m));
            }
        }
        return out;
    }

    private Map<String, Object> parseJsonMap(String json) {
        try {
            if (json == null || json.isBlank()) {
                return Map.of();
            }
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid page config JSON: " + ex.getMessage(), ex);
        }
    }
}
