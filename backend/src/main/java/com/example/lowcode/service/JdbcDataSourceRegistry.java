package com.example.lowcode.service;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import javax.sql.DataSource;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Runtime JDBC routing for business Query / Action / CRUD.
 * Metadata (lc_*) always uses the platform template.
 * <p>
 * Resolve order: page.data_source_code ?? query.data_source_code ?? "default"
 */
@Service
public class JdbcDataSourceRegistry {
    public static final String DEFAULT_DS = "default";

    private final NamedParameterJdbcTemplate platformJdbc;
    private final DataSource platformDataSource;
    private final DataSourceCryptoService cryptoService;
    private final ConcurrentHashMap<String, PoolEntry> pools = new ConcurrentHashMap<>();

    public JdbcDataSourceRegistry(
            NamedParameterJdbcTemplate platformJdbc,
            @Qualifier("dataSource") DataSource platformDataSource,
            DataSourceCryptoService cryptoService
    ) {
        this.platformJdbc = platformJdbc;
        this.platformDataSource = platformDataSource;
        this.cryptoService = cryptoService;
    }

    /** Platform / metadata store (lc_* tables). */
    public NamedParameterJdbcTemplate platform() {
        return platformJdbc;
    }

    public NamedParameterJdbcTemplate getTemplate(String dsCode) {
        return getEntry(dsCode).template;
    }

    public DataSource getDataSource(String dsCode) {
        return getEntry(dsCode).dataSource;
    }

    /**
     * Resolve business ds for a query, optionally overridden by page binding.
     */
    public String resolveDsCode(String pageCode, String queryCode) {
        String pageDs = null;
        if (pageCode != null && !pageCode.isBlank()) {
            pageDs = loadPageDs(pageCode.trim());
        }
        if (pageDs != null && !pageDs.isBlank()) {
            return pageDs.trim();
        }
        if (queryCode != null && !queryCode.isBlank()) {
            String queryDs = loadQueryDs(queryCode.trim());
            if (queryDs != null && !queryDs.isBlank()) {
                return queryDs.trim();
            }
        }
        return DEFAULT_DS;
    }

    public NamedParameterJdbcTemplate resolveForQuery(String pageCode, String queryCode) {
        return getTemplate(resolveDsCode(pageCode, queryCode));
    }

    public NamedParameterJdbcTemplate resolveForPage(String pageCode) {
        String pageDs = pageCode == null || pageCode.isBlank() ? null : loadPageDs(pageCode.trim());
        if (pageDs != null && !pageDs.isBlank()) {
            return getTemplate(pageDs.trim());
        }
        // page may only bind query-level ds via its query_code
        if (pageCode != null && !pageCode.isBlank()) {
            String queryCode = loadPageQueryCode(pageCode.trim());
            if (queryCode != null && !queryCode.isBlank()) {
                return getTemplate(resolveDsCode(pageCode, queryCode));
            }
        }
        return getTemplate(DEFAULT_DS);
    }

    public void invalidate(String dsCode) {
        if (dsCode == null || dsCode.isBlank() || DEFAULT_DS.equalsIgnoreCase(dsCode.trim())) {
            return;
        }
        PoolEntry removed = pools.remove(dsCode.trim());
        if (removed != null) {
            closeQuietly(removed);
        }
    }

    public void invalidateAllSecondary() {
        for (String code : List.copyOf(pools.keySet())) {
            invalidate(code);
        }
    }

    @PreDestroy
    public void shutdown() {
        invalidateAllSecondary();
    }

    private PoolEntry getEntry(String dsCode) {
        String code = (dsCode == null || dsCode.isBlank()) ? DEFAULT_DS : dsCode.trim();
        if (DEFAULT_DS.equalsIgnoreCase(code)) {
            return new PoolEntry(platformDataSource, platformJdbc, true);
        }

        Map<String, Object> row = loadDsRow(code);
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown data source: " + code);
        }
        if (!Boolean.TRUE.equals(asBoolean(row.get("enabled")))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Data source is disabled: " + code);
        }
        if (Boolean.TRUE.equals(asBoolean(row.get("is_platform")))) {
            return new PoolEntry(platformDataSource, platformJdbc, true);
        }

        return pools.compute(code, (k, existing) -> {
            if (existing != null && existing.matchesConfig(row)) {
                return existing;
            }
            if (existing != null) {
                closeQuietly(existing);
            }
            return createPool(code, row);
        });
    }

    private PoolEntry createPool(String code, Map<String, Object> row) {
        String url = Objects.toString(row.get("jdbc_url"), "");
        String username = Objects.toString(row.get("username"), "");
        String driver = Objects.toString(row.get("driver_class"), "org.postgresql.Driver");
        int poolSize = row.get("max_pool_size") instanceof Number n ? Math.max(1, n.intValue()) : 5;
        String cipher = row.get("password_cipher") == null ? null : String.valueOf(row.get("password_cipher"));
        String password = cryptoService.decrypt(cipher);
        if (password == null) {
            password = "";
        }

        HikariConfig config = new HikariConfig();
        config.setPoolName("lc-ds-" + code);
        config.setJdbcUrl(url);
        config.setUsername(username);
        config.setPassword(password);
        config.setDriverClassName(driver);
        config.setMaximumPoolSize(poolSize);
        config.setMinimumIdle(Math.min(1, poolSize));
        config.setConnectionTimeout(10_000);
        config.setValidationTimeout(5_000);
        config.setInitializationFailTimeout(1);

        HikariDataSource ds = new HikariDataSource(config);
        NamedParameterJdbcTemplate template = new NamedParameterJdbcTemplate(ds);
        return new PoolEntry(ds, template, false, fingerprint(row));
    }

    private Map<String, Object> loadDsRow(String code) {
        List<Map<String, Object>> rows = platformJdbc.queryForList(
                """
                SELECT ds_code, name, driver_class, jdbc_url, username, password_cipher,
                       max_pool_size, enabled, is_platform
                FROM lc_data_source
                WHERE ds_code = :code
                """,
                Map.of("code", code)
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String loadPageDs(String pageCode) {
        List<Map<String, Object>> rows = platformJdbc.queryForList(
                "SELECT data_source_code FROM lc_page_model WHERE page_code = :code",
                Map.of("code", pageCode)
        );
        if (rows.isEmpty()) {
            return null;
        }
        Object v = rows.get(0).get("data_source_code");
        return v == null ? null : String.valueOf(v);
    }

    private String loadQueryDs(String queryCode) {
        List<Map<String, Object>> rows = platformJdbc.queryForList(
                "SELECT data_source_code FROM lc_query_model WHERE query_code = :code",
                Map.of("code", queryCode)
        );
        if (rows.isEmpty()) {
            return null;
        }
        Object v = rows.get(0).get("data_source_code");
        return v == null ? null : String.valueOf(v);
    }

    private String loadPageQueryCode(String pageCode) {
        List<Map<String, Object>> rows = platformJdbc.queryForList(
                "SELECT query_code FROM lc_page_model WHERE page_code = :code",
                Map.of("code", pageCode)
        );
        if (rows.isEmpty()) {
            return null;
        }
        Object v = rows.get(0).get("query_code");
        return v == null ? null : String.valueOf(v);
    }

    private static String fingerprint(Map<String, Object> row) {
        return String.join("|",
                Objects.toString(row.get("jdbc_url"), ""),
                Objects.toString(row.get("username"), ""),
                Objects.toString(row.get("driver_class"), ""),
                Objects.toString(row.get("password_cipher"), ""),
                Objects.toString(row.get("max_pool_size"), "5"),
                Objects.toString(row.get("enabled"), "true")
        );
    }

    private static Boolean asBoolean(Object v) {
        if (v instanceof Boolean b) {
            return b;
        }
        if (v == null) {
            return false;
        }
        return "true".equalsIgnoreCase(String.valueOf(v))
                || "t".equalsIgnoreCase(String.valueOf(v))
                || "1".equals(String.valueOf(v));
    }

    private static void closeQuietly(PoolEntry entry) {
        if (entry == null || entry.platform) {
            return;
        }
        DataSource ds = entry.dataSource;
        if (ds instanceof HikariDataSource hikari) {
            try {
                hikari.close();
            } catch (Exception ignored) {
                /* best effort */
            }
        }
    }

    private static final class PoolEntry {
        final DataSource dataSource;
        final NamedParameterJdbcTemplate template;
        final boolean platform;
        final String fingerprint;

        PoolEntry(DataSource dataSource, NamedParameterJdbcTemplate template, boolean platform) {
            this(dataSource, template, platform, "platform");
        }

        PoolEntry(DataSource dataSource, NamedParameterJdbcTemplate template, boolean platform, String fingerprint) {
            this.dataSource = dataSource;
            this.template = template;
            this.platform = platform;
            this.fingerprint = fingerprint;
        }

        boolean matchesConfig(Map<String, Object> row) {
            return fingerprint != null && fingerprint.equals(fingerprint(row));
        }
    }
}
