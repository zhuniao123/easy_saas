package com.example.lowcode.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DataSourceAdminService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private DataSourceCryptoService cryptoService;

    @Value("${spring.datasource.url:}")
    private String platformUrl;
    @Value("${spring.datasource.username:}")
    private String platformUser;

    public List<Map<String, Object>> list() {
        return jdbcTemplate.query(
                """
                SELECT ds_code AS "dsCode", name, driver_class AS "driverClass",
                       jdbc_url AS "jdbcUrl", username,
                       (password_cipher IS NOT NULL AND length(password_cipher) > 0) AS "hasPassword",
                       max_pool_size AS "maxPoolSize", enabled, is_platform AS "platform",
                       remark, created_at AS "createdAt", updated_at AS "updatedAt"
                FROM lc_data_source
                ORDER BY is_platform DESC, ds_code
                """,
                new HashMap<>(),
                (rs, i) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("dsCode", rs.getString("dsCode"));
                    m.put("name", rs.getString("name"));
                    m.put("driverClass", rs.getString("driverClass"));
                    m.put("jdbcUrl", rs.getString("jdbcUrl"));
                    m.put("username", rs.getString("username"));
                    m.put("hasPassword", rs.getBoolean("hasPassword"));
                    m.put("maxPoolSize", rs.getInt("maxPoolSize"));
                    m.put("enabled", rs.getBoolean("enabled"));
                    m.put("platform", rs.getBoolean("platform"));
                    m.put("remark", rs.getString("remark"));
                    m.put("createdAt", rs.getTimestamp("createdAt"));
                    m.put("updatedAt", rs.getTimestamp("updatedAt"));
                    return m;
                }
        );
    }

    public Map<String, Object> get(String dsCode) {
        Map<String, Object> p = new HashMap<>();
        p.put("code", dsCode);
        List<Map<String, Object>> rows = list().stream()
                .filter(r -> dsCode.equals(r.get("dsCode")))
                .toList();
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Data source not found: " + dsCode);
        }
        return rows.get(0);
    }

    public Map<String, Object> create(Map<String, Object> body) {
        String code = str(body.get("dsCode"));
        if (code.isBlank()) {
            throw new IllegalArgumentException("dsCode is required");
        }
        if (!code.matches("^[a-zA-Z][a-zA-Z0-9_]*$")) {
            throw new IllegalArgumentException("dsCode must be alphanumeric/underscore");
        }
        String name = str(body.get("name"));
        if (name.isBlank()) {
            name = code;
        }
        String driver = str(body.get("driverClass"));
        if (driver.isBlank()) {
            driver = "org.postgresql.Driver";
        }
        String url = str(body.get("jdbcUrl"));
        String username = str(body.get("username"));
        if (url.isBlank() || username.isBlank()) {
            throw new IllegalArgumentException("jdbcUrl and username are required");
        }
        String password = body.get("password") == null ? null : String.valueOf(body.get("password"));
        String cipher = password == null || password.isEmpty() ? null : cryptoService.encrypt(password);
        int pool = body.get("maxPoolSize") instanceof Number n ? n.intValue() : 5;
        boolean enabled = body.get("enabled") == null || Boolean.TRUE.equals(body.get("enabled"))
                || "true".equalsIgnoreCase(String.valueOf(body.get("enabled")));
        boolean platform = Boolean.TRUE.equals(body.get("platform"))
                || "true".equalsIgnoreCase(String.valueOf(body.get("platform")));
        if (platform) {
            throw new IllegalArgumentException("Cannot create another platform datasource; use default");
        }

        Map<String, Object> p = new HashMap<>();
        p.put("code", code);
        p.put("name", name);
        p.put("driver", driver);
        p.put("url", url);
        p.put("username", username);
        p.put("cipher", cipher);
        p.put("pool", pool);
        p.put("enabled", enabled);
        p.put("remark", str(body.get("remark")));
        try {
            jdbcTemplate.update(
                    """
                    INSERT INTO lc_data_source(
                      ds_code, name, driver_class, jdbc_url, username, password_cipher,
                      max_pool_size, enabled, is_platform, remark, updated_at
                    ) VALUES (
                      :code, :name, :driver, :url, :username, :cipher,
                      :pool, :enabled, false, :remark, now()
                    )
                    """,
                    p
            );
        } catch (Exception ex) {
            throw new IllegalArgumentException("dsCode already exists or invalid: " + code, ex);
        }
        return get(code);
    }

    public Map<String, Object> update(String dsCode, Map<String, Object> body) {
        Map<String, Object> existing = loadRaw(dsCode);
        if (existing == null) {
            throw new IllegalArgumentException("Data source not found: " + dsCode);
        }
        boolean platform = Boolean.TRUE.equals(existing.get("is_platform"));

        Map<String, Object> p = new HashMap<>();
        p.put("code", dsCode);
        p.put("name", body.containsKey("name") ? str(body.get("name")) : String.valueOf(existing.get("name")));
        p.put("driver", body.containsKey("driverClass") ? str(body.get("driverClass")) : String.valueOf(existing.get("driver_class")));
        p.put("url", body.containsKey("jdbcUrl") ? str(body.get("jdbcUrl")) : String.valueOf(existing.get("jdbc_url")));
        p.put("username", body.containsKey("username") ? str(body.get("username")) : String.valueOf(existing.get("username")));
        p.put("pool", body.get("maxPoolSize") instanceof Number n
                ? n.intValue()
                : ((Number) existing.get("max_pool_size")).intValue());
        p.put("enabled", body.containsKey("enabled")
                ? Boolean.TRUE.equals(body.get("enabled")) || "true".equalsIgnoreCase(String.valueOf(body.get("enabled")))
                : Boolean.TRUE.equals(existing.get("enabled")));
        p.put("remark", body.containsKey("remark") ? str(body.get("remark")) : String.valueOf(existing.get("remark")));

        if (platform) {
            // platform row: allow name/remark/enabled cosmetic only; url/user follow spring for display sync
            p.put("url", platformUrl != null && !platformUrl.isBlank() ? platformUrl : p.get("url"));
            p.put("username", platformUser != null && !platformUser.isBlank() ? platformUser : p.get("username"));
            p.put("cipher", existing.get("password_cipher"));
        } else if (body.get("password") != null && !String.valueOf(body.get("password")).isEmpty()) {
            p.put("cipher", cryptoService.encrypt(String.valueOf(body.get("password"))));
        } else {
            p.put("cipher", existing.get("password_cipher"));
        }

        jdbcTemplate.update(
                """
                UPDATE lc_data_source SET
                  name = :name,
                  driver_class = :driver,
                  jdbc_url = :url,
                  username = :username,
                  password_cipher = :cipher,
                  max_pool_size = :pool,
                  enabled = :enabled,
                  remark = :remark,
                  updated_at = now()
                WHERE ds_code = :code
                """,
                p
        );
        return get(dsCode);
    }

    public void delete(String dsCode) {
        if ("default".equals(dsCode)) {
            throw new IllegalStateException("Cannot delete platform datasource 'default'");
        }
        Map<String, Object> existing = loadRaw(dsCode);
        if (existing == null) {
            throw new IllegalArgumentException("Data source not found: " + dsCode);
        }
        if (Boolean.TRUE.equals(existing.get("is_platform"))) {
            throw new IllegalStateException("Cannot delete platform datasource");
        }
        // clear bindings first
        Map<String, Object> p = new HashMap<>();
        p.put("code", dsCode);
        jdbcTemplate.update("UPDATE lc_page_model SET data_source_code = NULL WHERE data_source_code = :code", p);
        jdbcTemplate.update("UPDATE lc_query_model SET data_source_code = NULL WHERE data_source_code = :code", p);
        jdbcTemplate.update("DELETE FROM lc_data_source WHERE ds_code = :code", p);
    }

    public Map<String, Object> testConnection(String dsCode, Map<String, Object> body) {
        String url;
        String username;
        String password;
        String driver;

        if (dsCode != null && !dsCode.isBlank() && !"__adhoc__".equals(dsCode)) {
            Map<String, Object> raw = loadRaw(dsCode);
            if (raw == null) {
                throw new IllegalArgumentException("Data source not found: " + dsCode);
            }
            if (Boolean.TRUE.equals(raw.get("is_platform"))) {
                return Map.of("status", "success", "message", "Platform datasource uses spring.datasource (always available)");
            }
            url = String.valueOf(raw.get("jdbc_url"));
            username = String.valueOf(raw.get("username"));
            driver = String.valueOf(raw.get("driver_class"));
            password = cryptoService.decrypt(raw.get("password_cipher") == null ? null : String.valueOf(raw.get("password_cipher")));
            if (body != null && body.get("password") != null && !String.valueOf(body.get("password")).isEmpty()) {
                password = String.valueOf(body.get("password"));
            }
        } else {
            if (body == null) {
                throw new IllegalArgumentException("body required for ad-hoc test");
            }
            url = str(body.get("jdbcUrl"));
            username = str(body.get("username"));
            password = body.get("password") == null ? "" : String.valueOf(body.get("password"));
            driver = str(body.get("driverClass"));
            if (driver.isBlank()) {
                driver = "org.postgresql.Driver";
            }
        }

        long start = System.currentTimeMillis();
        try {
            Class.forName(driver);
            try (Connection c = DriverManager.getConnection(url, username, password == null ? "" : password)) {
                boolean ok = c.isValid(5);
                long ms = System.currentTimeMillis() - start;
                if (!ok) {
                    throw new IllegalStateException("Connection invalid");
                }
                return Map.of("status", "success", "message", "Connected", "durationMs", ms);
            }
        } catch (Exception ex) {
            throw new IllegalStateException("Connection failed: " + ex.getMessage(), ex);
        }
    }

    public Map<String, Object> cryptoStatus() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("algorithm", "AES-256-GCM");
        m.put("devFallbackKey", cryptoService.isUsingDevFallback());
        m.put("hint", cryptoService.isUsingDevFallback()
                ? "Set env LOWCODE_DS_CRYPTO_KEY (base64 32 bytes) for production"
                : "Master key loaded from configuration");
        return m;
    }

    private Map<String, Object> loadRaw(String dsCode) {
        Map<String, Object> p = new HashMap<>();
        p.put("code", dsCode);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                """
                SELECT ds_code, name, driver_class, jdbc_url, username, password_cipher,
                       max_pool_size, enabled, is_platform, remark
                FROM lc_data_source WHERE ds_code = :code
                """,
                p
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    private static String str(Object o) {
        return o == null || "null".equals(String.valueOf(o)) ? "" : String.valueOf(o).trim();
    }
}
