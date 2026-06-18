# SQL-Driven Business Page Generator MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first MVP Demo of the SQL-driven Page Generator system, including database-configured pages, dynamic parameter SQL execution, database-stored Groovy backend scripts, and dynamic frontend action JS module loader.

**Architecture:** A Spring Boot Java backend dynamically loads page/query metadata and JS/Groovy scripts from a PostgreSQL database. Front-end React applications load page structure, fetch data, and dynamically inject scripts via `<script>` element loaders to bind custom actions.

**Tech Stack:** Java 17, Spring Boot 3.x, Maven, Spring JDBC (NamedParameterJdbcTemplate), Groovy, React, Tailwind CSS, TanStack Table v8, Vite.

## Global Constraints
* **OS Platform:** Linux (Ubuntu 24.04.4 LTS)
* **Backend build:** Maven (pom.xml)
* **Database:** PostgreSQL 17
* **Frontend build:** Vite, npm, React, TanStack Table
* **Security & Sandboxing:** Postponed to post-demo, but dynamic compilation must cache class loaders.
* **Testing:** TDD mandatory (failing test first, watched fail, minimal implementation to pass, verify green).

---

### Task 1: Scaffolding Backend and Schema Initialization

**Files:**
* Create: `backend/pom.xml`
* Create: `backend/src/main/resources/schema.sql`
* Create: `backend/src/main/java/com/example/lowcode/LowcodeApplication.java`
* Create: `backend/src/main/resources/application.properties`
* Test: `backend/src/test/java/com/example/lowcode/DatabaseSchemaTest.java`

**Interfaces:**
* Consumes: None (First task)
* Produces: Configured Spring Boot context with database tables initialized.

- [ ] **Step 1: Write the failing test**
Create `backend/src/test/java/com/example/lowcode/DatabaseSchemaTest.java`:
```java
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
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `mvn test -pl backend -Dtest=DatabaseSchemaTest` (Assuming Maven exists)
Expected: FAIL (Cannot find pom.xml / project not initialized, or tables missing).

- [ ] **Step 3: Write minimal implementation**
Create `backend/pom.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.4</version>
    </parent>
    <groupId>com.example</groupId>
    <artifactId>lowcode</artifactId>
    <version>1.0.0</version>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-jdbc</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
        </dependency>
        <dependency>
            <groupId>org.codehaus.groovy</groupId>
            <artifactId>groovy</artifactId>
            <version>3.0.21</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

Create `backend/src/main/resources/application.properties`:
```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/lowcode
spring.datasource.username=lowcode
spring.datasource.password=lowcode
spring.datasource.driver-class-name=org.postgresql.Driver
spring.sql.init.mode=always
spring.sql.init.schema-locations=classpath:schema.sql
```

Create `backend/src/main/resources/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS lc_entity_model (
    entity_code        VARCHAR(100) PRIMARY KEY,
    table_name         VARCHAR(100) NOT NULL,
    primary_key        VARCHAR(50) NOT NULL DEFAULT 'id',
    label_field        VARCHAR(100),
    fields_json        JSONB NOT NULL,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_query_model (
    query_code         VARCHAR(100) PRIMARY KEY,
    anchor_entity      VARCHAR(100) REFERENCES lc_entity_model(entity_code),
    sql_text           TEXT NOT NULL,
    params_json        JSONB NOT NULL DEFAULT '[]'::jsonb,
    result_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    groovy_script_code VARCHAR(100),
    timeout_ms         INTEGER NOT NULL DEFAULT 5000
);

CREATE TABLE IF NOT EXISTS lc_page_model (
    page_code          VARCHAR(100) PRIMARY KEY,
    title              VARCHAR(200) NOT NULL,
    route_path         VARCHAR(200) NOT NULL UNIQUE,
    query_code         VARCHAR(100) REFERENCES lc_query_model(query_code),
    entity_code        VARCHAR(100) REFERENCES lc_entity_model(entity_code),
    config_json        JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS lc_script (
    script_code        VARCHAR(100) PRIMARY KEY,
    script_type        VARCHAR(50) NOT NULL,
    script_content     TEXT NOT NULL,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_query_log (
    id                 BIGSERIAL PRIMARY KEY,
    query_code         VARCHAR(100) NOT NULL,
    params_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
    duration_ms        INTEGER,
    success            BOOLEAN NOT NULL,
    error_message      TEXT,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

Create `backend/src/main/java/com/example/lowcode/LowcodeApplication.java`:
```java
package com.example.lowcode;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class LowcodeApplication {
    public static void main(String[] args) {
        SpringApplication.run(LowcodeApplication.class, args);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `mvn test -pl backend -Dtest=DatabaseSchemaTest` (Ensure PG local service is up or mocked, or matching config exists)
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/pom.xml backend/src/main/resources/schema.sql backend/src/main/resources/application.properties backend/src/main/java/com/example/lowcode/LowcodeApplication.java backend/src/test/java/com/example/lowcode/DatabaseSchemaTest.java
git commit -m "feat: scaffold backend project and database schemas"
```

---

### Task 2: Implement Metadata Page API

**Files:**
* Create: `backend/src/main/java/com/example/lowcode/controller/PageController.java`
* Create: `backend/src/main/java/com/example/lowcode/service/PageService.java`
* Test: `backend/src/test/java/com/example/lowcode/PageControllerTest.java`

**Interfaces:**
* Consumes: Database schema from Task 1.
* Produces: `GET /api/v1/pages/{pageCode}` endpoint returning merged configuration map.

- [ ] **Step 1: Write the failing test**
Create `backend/src/test/java/com/example/lowcode/PageControllerTest.java`:
```java
package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

@SpringBootTest
@AutoConfigureMockMvc
public class PageControllerTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testGetPageConfig() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_page_model");
        jdbcTemplate.execute("INSERT INTO lc_page_model (page_code, title, route_path, config_json) VALUES ('test_page', 'Test Title', '/test', '{\"filters\":[]}'::jsonb)");

        mockMvc.perform(get("/api/v1/pages/test_page"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pageCode").value("test_page"))
                .andExpect(jsonPath("$.title").value("Test Title"))
                .andExpect(jsonPath("$.config.filters").isEmpty());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `mvn test -pl backend -Dtest=PageControllerTest`
Expected: FAIL with status 404.

- [ ] **Step 3: Write minimal implementation**
Create `backend/src/main/java/com/example/lowcode/service/PageService.java`:
```java
package com.example.lowcode.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;

@Service
public class PageService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    public Map<String, Object> getPageConfig(String pageCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("pageCode", pageCode);
        return jdbcTemplate.queryForObject(
            "SELECT page_code as \"pageCode\", title, route_path as \"routePath\", config_json as \"config\" FROM lc_page_model WHERE page_code = :pageCode",
            params,
            (rs, rowNum) -> {
                Map<String, Object> map = new HashMap<>();
                map.put("pageCode", rs.getString("pageCode"));
                map.put("title", rs.getString("title"));
                map.put("routePath", rs.getString("routePath"));
                map.put("config", rs.getString("config")); // Simple JSON string representation
                return map;
            }
        );
    }
}
```

Create `backend/src/main/java/com/example/lowcode/controller/PageController.java`:
```java
package com.example.lowcode.controller;

import com.example.lowcode.service.PageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/pages")
public class PageController {
    @Autowired
    private PageService pageService;
    @Autowired
    private ObjectMapper objectMapper;

    @GetMapping("/{pageCode}")
    public Map<String, Object> getPage(@PathVariable String pageCode) throws Exception {
        Map<String, Object> config = pageService.getPageConfig(pageCode);
        String configJsonStr = (String) config.get("config");
        config.put("config", objectMapper.readValue(configJsonStr, Map.class));
        return config;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `mvn test -pl backend -Dtest=PageControllerTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/com/example/lowcode/service/PageService.java backend/src/main/java/com/example/lowcode/controller/PageController.java backend/src/test/java/com/example/lowcode/PageControllerTest.java
git commit -m "feat: implement GET /api/v1/pages/{pageCode} API"
```

---

### Task 3: SQL Execution Engine & Dynamic Query API

**Files:**
* Create: `backend/src/main/java/com/example/lowcode/service/QueryEngineService.java`
* Create: `backend/src/main/java/com/example/lowcode/controller/QueryController.java`
* Test: `backend/src/test/java/com/example/lowcode/QueryControllerTest.java`

**Interfaces:**
* Consumes: Database schema from Task 1.
* Produces: `POST /api/v1/queries/{queryCode}/execute` returning lists of map objects.

- [ ] **Step 1: Write the failing test**
Create `backend/src/test/java/com/example/lowcode/QueryControllerTest.java`:
```java
package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

@SpringBootTest
@AutoConfigureMockMvc
public class QueryControllerTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testExecuteQuery() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_query_model");
        jdbcTemplate.execute("DELETE FROM lc_entity_model");
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) VALUES ('users', 'users', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text, params_json) VALUES ('q_user', 'users', 'SELECT 1 as val FROM lc_entity_model WHERE entity_code = :code', '[\"code\"]'::jsonb)");

        mockMvc.perform(post("/api/v1/queries/q_user/execute")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"params\":{\"code\":\"users\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].val").value(1));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `mvn test -pl backend -Dtest=QueryControllerTest`
Expected: FAIL with status 404.

- [ ] **Step 3: Write minimal implementation**
Create `backend/src/main/java/com/example/lowcode/service/QueryEngineService.java`:
```java
package com.example.lowcode.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class QueryEngineService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    public List<Map<String, Object>> executeSql(String queryCode, Map<String, Object> requestParams) {
        Map<String, Object> modelParams = new HashMap<>();
        modelParams.put("queryCode", queryCode);
        
        Map<String, Object> queryModel = jdbcTemplate.queryForMap(
            "SELECT sql_text, params_json FROM lc_query_model WHERE query_code = :queryCode",
            modelParams
        );
        
        String sqlText = (String) queryModel.get("sql_text");
        
        // Dynamic bound execution
        return jdbcTemplate.queryForList(sqlText, requestParams);
    }
}
```

Create `backend/src/main/java/com/example/lowcode/controller/QueryController.java`:
```java
package com.example.lowcode.controller;

import com.example.lowcode.service.QueryEngineService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/queries")
public class QueryController {
    @Autowired
    private QueryEngineService queryEngineService;

    @PostMapping("/{queryCode}/execute")
    public List<Map<String, Object>> execute(@PathVariable String queryCode, @RequestBody Map<String, Object> requestBody) {
        Map<String, Object> params = (Map<String, Object>) requestBody.get("params");
        return queryEngineService.executeSql(queryCode, params);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `mvn test -pl backend -Dtest=QueryControllerTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/com/example/lowcode/service/QueryEngineService.java backend/src/main/java/com/example/lowcode/controller/QueryController.java backend/src/test/java/com/example/lowcode/QueryControllerTest.java
git commit -m "feat: implement POST /api/v1/queries/{queryCode}/execute API"
```

---

### Task 4: Dynamic JS Script Router

**Files:**
* Create: `backend/src/main/java/com/example/lowcode/controller/ScriptController.java`
* Test: `backend/src/test/java/com/example/lowcode/ScriptControllerTest.java`

**Interfaces:**
* Consumes: Database `lc_script` schema from Task 1.
* Produces: `GET /api/v1/scripts/{scriptCode}.js` returning JS with `Content-Type: application/javascript`.

- [ ] **Step 1: Write the failing test**
Create `backend/src/test/java/com/example/lowcode/ScriptControllerTest.java`:
```java
package com.example.lowcode;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
public class ScriptControllerTest {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void testGetJsScript() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_script");
        jdbcTemplate.execute("INSERT INTO lc_script(script_code, script_type, script_content) VALUES ('test_act', 'FRONTEND_JS', 'console.log(\"hello\");')");

        mockMvc.perform(get("/api/v1/scripts/test_act.js"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/javascript"))
                .andExpect(content().string("console.log(\"hello\");"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `mvn test -pl backend -Dtest=ScriptControllerTest`
Expected: FAIL with status 404.

- [ ] **Step 3: Write minimal implementation**
Create `backend/src/main/java/com/example/lowcode/controller/ScriptController.java`:
```java
package com.example.lowcode.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/scripts")
public class ScriptController {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    @GetMapping("/{scriptCode}.js")
    public ResponseEntity<String> getScript(@PathVariable String scriptCode) {
        Map<String, Object> params = new HashMap<>();
        params.put("code", scriptCode);
        
        String jsContent = jdbcTemplate.queryForObject(
            "SELECT script_content FROM lc_script WHERE script_code = :code AND script_type = 'FRONTEND_JS'",
            params,
            String.class
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.valueOf("application/javascript"));
        return new ResponseEntity<>(jsContent, headers, HttpStatus.OK);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `mvn test -pl backend -Dtest=ScriptControllerTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/com/example/lowcode/controller/ScriptController.java backend/src/test/java/com/example/lowcode/ScriptControllerTest.java
git commit -m "feat: implement dynamic JS script router API"
```

---

### Task 5: Implement Backend Groovy Hook Engine

**Files:**
* Create: `backend/src/main/java/com/example/lowcode/service/GroovyScriptService.java`
* Modify: `backend/src/main/java/com/example/lowcode/service/QueryEngineService.java` (inject interceptor invocation)
* Create: `backend/src/main/java/com/example/lowcode/interceptor/IGroovyActionInterceptor.java`
* Test: `backend/src/test/java/com/example/lowcode/GroovyInterceptorTest.java`

**Interfaces:**
* Consumes: Database query service.
* Produces: Compilation cache for Groovy interceptors execution.

- [ ] **Step 1: Write the failing test**
Create `backend/src/test/java/com/example/lowcode/GroovyInterceptorTest.java`:
```java
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
        
        jdbcTemplate.execute("INSERT INTO lc_script(script_code, script_type, script_content) VALUES ('test_groovy', 'BACKEND_GROOVY', " +
            "'import com.example.lowcode.interceptor.IGroovyActionInterceptor;\\n' + " +
            "'class SampleHook implements IGroovyActionInterceptor {\\n' + " +
            "'  void beforeQuery(Map params) { params.put(\"val\", 99) }\\n' + " +
            "'  List afterQuery(List rows) { return [ [\"val\": 88] ] }\\n' + " +
            "'}'" +
            ")");
        
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) VALUES ('users', 'users', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text, groovy_script_code) VALUES ('q_test', 'users', 'SELECT 1 as val', 'test_groovy')");

        Map<String, Object> req = new HashMap<>();
        List<Map<String, Object>> res = queryEngine.executeSql("q_test", req);
        
        assertThat(res.get(0).get("val")).isEqualTo(88);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**
Run: `mvn test -pl backend -Dtest=GroovyInterceptorTest`
Expected: FAIL (interceptor method not found or missing package/import errors).

- [ ] **Step 3: Write minimal implementation**
Create `backend/src/main/java/com/example/lowcode/interceptor/IGroovyActionInterceptor.java`:
```java
package com.example.lowcode.interceptor;

import java.util.List;
import java.util.Map;

public interface IGroovyActionInterceptor {
    void beforeQuery(Map<String, Object> params);
    List<Map<String, Object>> afterQuery(List<Map<String, Object>> rows);
}
```

Create `backend/src/main/java/com/example/lowcode/service/GroovyScriptService.java`:
```java
package com.example.lowcode.service;

import com.example.lowcode.interceptor.IGroovyActionInterceptor;
import groovy.lang.GroovyClassLoader;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class GroovyScriptService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    
    private final GroovyClassLoader classLoader = new GroovyClassLoader();
    private final Map<String, Class<?>> compiledCache = new ConcurrentHashMap<>();

    public IGroovyActionInterceptor getInterceptor(String scriptCode) {
        if (scriptCode == null) return null;
        
        Class<?> cachedClass = compiledCache.get(scriptCode);
        if (cachedClass == null) {
            Map<String, Object> params = new HashMap<>();
            params.put("code", scriptCode);
            String source = jdbcTemplate.queryForObject(
                "SELECT script_content FROM lc_script WHERE script_code = :code AND script_type = 'BACKEND_GROOVY'",
                params,
                String.class
            );
            cachedClass = classLoader.parseClass(source);
            compiledCache.put(scriptCode, cachedClass);
        }
        
        try {
            return (IGroovyActionInterceptor) cachedClass.getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            throw new RuntimeException("Failed to instantiate Groovy hook: " + scriptCode, e);
        }
    }
}
```

Modify `backend/src/main/java/com/example/lowcode/service/QueryEngineService.java` to inject dynamic script execution:
```java
package com.example.lowcode.service;

import com.example.lowcode.interceptor.IGroovyActionInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class QueryEngineService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;
    @Autowired
    private GroovyScriptService groovyScriptService;

    public List<Map<String, Object>> executeSql(String queryCode, Map<String, Object> requestParams) {
        Map<String, Object> modelParams = new HashMap<>();
        modelParams.put("queryCode", queryCode);
        
        Map<String, Object> queryModel = jdbcTemplate.queryForMap(
            "SELECT sql_text, groovy_script_code FROM lc_query_model WHERE query_code = :queryCode",
            modelParams
        );
        
        String sqlText = (String) queryModel.get("sql_text");
        String groovyCode = (String) queryModel.get("groovy_script_code");

        IGroovyActionInterceptor interceptor = groovyScriptService.getInterceptor(groovyCode);
        
        if (interceptor != null) {
            interceptor.beforeQuery(requestParams);
        }

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(sqlText, requestParams);

        if (interceptor != null) {
            rows = interceptor.afterQuery(rows);
        }

        return rows;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `mvn test -pl backend -Dtest=GroovyInterceptorTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/com/example/lowcode/interceptor/IGroovyActionInterceptor.java backend/src/main/java/com/example/lowcode/service/GroovyScriptService.java backend/src/main/java/com/example/lowcode/service/QueryEngineService.java backend/src/test/java/com/example/lowcode/GroovyInterceptorTest.java
git commit -m "feat: integrate backend Groovy interceptor script runner"
```

---

### Task 6: Frontend Scaffolding & TanStack Table Integration

**Files:**
* Create: `frontend/package.json`
* Create: `frontend/index.html`
* Create: `frontend/src/App.tsx`
* Create: `frontend/src/PageLoader.tsx`
* Test: `frontend/src/PageLoader.test.tsx`

**Interfaces:**
* Consumes: GET `/api/v1/pages/` and GET `/api/v1/scripts/` endpoints from Task 2 & 4.
* Produces: Interactive low-code dashboard page.

- [ ] **Step 1: Write the failing test**
Create `frontend/src/PageLoader.test.tsx`:
```typescript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import PageLoader from './PageLoader';

test('renders dynamic page title from metadata api', async () => {
  // Mocking fetch endpoint
  const mockPageData = {
    pageCode: 'order_list',
    title: 'Order List Dashboard',
    config: { actions: [], columns: [], filters: [] }
  };
  global.fetch = jest.fn().mockImplementation(() =>
    Promise.resolve({
      json: () => Promise.resolve(mockPageData),
    })
  );

  render(<PageLoader pageCode="order_list" />);
  await waitFor(() => {
     expect(screen.getByText('Order List Dashboard')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test frontend/src/PageLoader.test.tsx` (Assuming Jest setup)
Expected: FAIL (Cannot find modules or files).

- [ ] **Step 3: Write minimal implementation**
Create `frontend/package.json`:
```json
{
  "name": "lowcode-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "jest"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-table": "^8.15.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "typescript": "^5.2.2",
    "vite": "^5.1.6",
    "jest": "^29.7.0",
    "@testing-library/react": "^14.2.1",
    "@testing-library/jest-dom": "^6.4.2"
  }
}
```

Create `frontend/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>SQL Lowcode Generator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/App.tsx"></script>
  </body>
</html>
```

Create `frontend/src/PageLoader.tsx`:
```typescript
import React, { useEffect, useState } from 'react';

interface PageConfig {
  pageCode: string;
  title: string;
  config: {
    actions: Array<{ code: string; label: string; scriptCode: string; methodName: string }>;
    columns: Array<{ field: string; label: string }>;
    filters: Array<{ field: string; label: string }>;
  };
}

export default function PageLoader({ pageCode }: { pageCode: string }) {
  const [config, setConfig] = useState<PageConfig | null>(null);

  useEffect(() => {
    fetch(`/api/v1/pages/${pageCode}`)
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        // Load dynamically bound JS action script
        data.config?.actions?.forEach((action: any) => {
          if (action.scriptCode) {
            const id = `lc-script-${action.scriptCode}`;
            if (!document.getElementById(id)) {
              const script = document.createElement('script');
              script.id = id;
              script.src = `/api/v1/scripts/${action.scriptCode}.js`;
              script.async = true;
              document.body.appendChild(script);
            }
          }
        });
      });
  }, [pageCode]);

  if (!config) return <div>Loading Configuration...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{config.title}</h1>
      <div className="flex space-x-2">
        {config.config?.actions?.map((act) => (
          <button
            key={act.code}
            className="px-4 py-2 bg-blue-600 text-white rounded"
            onClick={() => {
              const globalActions = (window as any).AppActions?.[act.scriptCode];
              if (globalActions && typeof globalActions[act.methodName] === 'function') {
                globalActions[act.methodName]({ id: 123 }, { refresh: () => console.log('refresh') });
              } else {
                console.error(`JS Action method ${act.methodName} not found!`);
              }
            }}
          >
            {act.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Create `frontend/src/App.tsx`:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import PageLoader from './PageLoader';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <PageLoader pageCode="order_list" />
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}
```

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test frontend/src/PageLoader.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add frontend/package.json frontend/index.html frontend/src/App.tsx frontend/src/PageLoader.tsx frontend/src/PageLoader.test.tsx
git commit -m "feat: integrate frontend dashboard with dynamic JS script loading support"
```
