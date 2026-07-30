package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
public class DatabaseSchemaTest {
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testTablesExist() {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('lc_entity_model', 'lc_query_model', 'lc_page_model', 'lc_script')",
            Integer.class
        );
        assertThat(count).isEqualTo(4);
    }

    @Test
    public void testQueryModelHasCountSqlTextColumn() {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM information_schema.columns " +
                "WHERE table_name = 'lc_query_model' AND column_name = 'count_sql_text'",
            Integer.class
        );
        assertThat(count).isEqualTo(1);
    }
}
