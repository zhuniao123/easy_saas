package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import com.example.lowcode.service.QueryEngineService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
public class GroovyInterceptorTest {
    @Autowired
    private QueryEngineService queryEngine;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testGroovyHookExecution() {
        jdbcTemplate.execute("DELETE FROM lc_script");
        jdbcTemplate.execute("DELETE FROM lc_query_model");
        jdbcTemplate.execute("DELETE FROM lc_entity_model");
        
        String groovyCode = "import com.example.lowcode.interceptor.IGroovyActionInterceptor;\n" +
            "class SampleHook implements IGroovyActionInterceptor {\n" +
            "  void beforeQuery(Map params) { params.put(\"val\", 99) }\n" +
            "  List afterQuery(List rows) { return [ [\"val\": 88] ] }\n" +
            "}";

        jdbcTemplate.update(
            "INSERT INTO lc_script(script_code, script_type, script_content) VALUES (?, ?, ?)",
            "test_groovy", "BACKEND_GROOVY", groovyCode
        );
        
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) VALUES ('users', 'users', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text, groovy_script_code) VALUES ('q_test', 'users', 'SELECT 1 as val', 'test_groovy')");

        Map<String, Object> req = new HashMap<>();
        List<Map<String, Object>> res = queryEngine.executeSql("q_test", req);
        
        assertThat(res.get(0).get("val")).isEqualTo(88);
    }
}
