# Dynamic Runtime Schema Inference and Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement runtime SQL column schema inference using JDBC ResultSetMetaData, look up entity schemas in `lc_entity_model` to determine column labels and types, and fall back to the query's alias if unrecognized. Update frontend and backend to support this dynamic table schema.

**Architecture:** 
1. Backend `QueryEngineService` executes custom SQL using a custom `ResultSetExtractor` to fetch both `ResultSetMetaData` and data rows.
2. Resolve column labels and types by checking table names and column names against `lc_entity_model` records.
3. Return `{columns: [...], rows: [...]}` from `/api/v1/queries/{queryCode}/execute`.
4. React frontend loads page config and query data, rendering a dynamically configured, visually rich table.

**Tech Stack:** Java 17, Spring Boot, Spring JDBC, React, Tailwind CSS, Vitest, JUnit 5.

## Global Constraints
* **OS Platform:** Linux (Ubuntu 24.04.4 LTS)
* **Backend build:** Maven (pom.xml)
* **Database:** PostgreSQL 17
* **Testing:** TDD mandatory (failing test first, watched fail, minimal implementation to pass, verify green).

---

### Task 1: Backend TDD - Update QueryResult DTO and Metadata Inference

**Files:**
* Modify: `backend/src/main/java/com/example/lowcode/service/QueryEngineService.java`
* Modify: `backend/src/main/java/com/example/lowcode/controller/QueryController.java`
* Test: `backend/src/test/java/com/example/lowcode/QueryControllerTest.java`

**Interfaces:**
* Consumes: Database query models and entity models from `schema.sql`.
* Produces: `POST /api/v1/queries/{queryCode}/execute` returning `{ "columns": [...], "rows": [...] }`.

- [ ] **Step 1: Write the failing test**
Update `QueryControllerTest.java` to test:
1. Retrieval of data with dynamic columns schema.
2. Fallback rule: unrecognized aliases are displayed using the alias directly as the label.
3. Columns mapped to `lc_entity_model` are resolved to their custom label and type.

Add the following test case inside `QueryControllerTest.java`:
```java
    @Test
    public void testExecuteQueryWithDynamicSchema() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_query_model");
        jdbcTemplate.execute("DELETE FROM lc_entity_model");
        
        // 1. Insert entity model for table "users"
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) " +
                "VALUES ('users', 'users', '[{\"field\":\"username\",\"label\":\"用户名\",\"type\":\"string\"}]'::jsonb)");
        
        // 2. Insert query model that has a mapped column (username) and a calculated/unrecognized fallback column (alias: total_score)
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text) " +
                "VALUES ('q_users_score', 'users', 'SELECT username, 100 AS total_score FROM lc_entity_model WHERE entity_code = :code')");
        
        mockMvc.perform(post("/api/v1/queries/q_users_score/execute")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"params\":{\"code\":\"users\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].username").exists())
                .andExpect(jsonPath("$.rows[0].total_score").value(100))
                .andExpect(jsonPath("$.columns[0].field").value("username"))
                .andExpect(jsonPath("$.columns[0].label").value("用户名"))
                .andExpect(jsonPath("$.columns[0].type").value("string"))
                .andExpect(jsonPath("$.columns[1].field").value("total_score"))
                .andExpect(jsonPath("$.columns[1].label").value("total_score")) // Fallback to alias name!
                .andExpect(jsonPath("$.columns[1].type").value("integer")); // Deduced from JDBC type
    }
```

- [ ] **Step 2: Run test to verify it fails**
Run Maven test:
`mvn test -Dtest=QueryControllerTest`
Expected: Failure (fails to parse JSON paths under `$.rows` / `$.columns` since controller returns list of rows).

- [ ] **Step 3: Write minimal implementation**
Modify `QueryEngineService.java` to extract columns and metadata, look up entity schemas and apply fallback rules.

- [ ] **Step 4: Run test to verify it passes**
Run Maven test:
`mvn test -Dtest=QueryControllerTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/com/example/lowcode/service/QueryEngineService.java backend/src/main/java/com/example/lowcode/controller/QueryController.java backend/src/test/java/com/example/lowcode/QueryControllerTest.java
git commit -m "feat: implement backend dynamic schema deduction with alias fallback"
```

---

### Task 2: Frontend TDD - Render Dynamic Table in PageLoader

**Files:**
* Modify: `frontend/src/PageLoader.tsx`
* Test: `frontend/src/PageLoader.test.tsx`

**Interfaces:**
* Consumes: Merged page config and dynamic schema query result from Task 1.
* Produces: A dynamically loaded table component showcasing custom columns and fallback alias labels.

- [ ] **Step 1: Write the failing test**
Update `PageLoader.test.tsx` to assert that the dynamic table headers and cell values are rendered:
```typescript
test('renders table headers and rows based on dynamic query response', async () => {
  const mockPageData = {
    pageCode: 'user_list',
    title: 'User Management Dashboard',
    queryCode: 'q_users_score',
    config: { actions: [], columns: [], filters: [] }
  };

  const mockQueryData = {
    columns: [
      { field: 'username', label: '用户名', type: 'string' },
      { field: 'total_score', label: 'total_score', type: 'integer' }
    ],
    rows: [
      { username: 'john_doe', total_score: 95 }
    ]
  };

  global.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('/api/v1/pages/')) {
      return Promise.resolve({
        json: () => Promise.resolve(mockPageData),
      } as Response);
    }
    if (url.includes('/api/v1/queries/q_users_score/execute')) {
      return Promise.resolve({
        json: () => Promise.resolve(mockQueryData),
      } as Response);
    }
    return Promise.reject(new Error('Unknown url'));
  });

  render(<PageLoader pageCode="user_list" />);
  
  await waitFor(() => {
    expect(screen.getByText('User Management Dashboard')).toBeInTheDocument();
    expect(screen.getByText('用户名')).toBeInTheDocument();
    expect(screen.getByText('total_score')).toBeInTheDocument();
    expect(screen.getByText('john_doe')).toBeInTheDocument();
    expect(screen.getByText('95')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run Vitest:
`npm --prefix frontend run test` or running vitest on `frontend/src/PageLoader.test.tsx`
Expected: FAIL (cannot find "用户名" or other table values since they are not rendered).

- [ ] **Step 3: Write minimal implementation**
Implement table fetching and rendering in `frontend/src/PageLoader.tsx`. Query `/api/v1/queries/{queryCode}/execute` using POST with empty params (or page filters) and dynamically display the results in a beautiful HTML table styled with Tailwind.

- [ ] **Step 4: Run test to verify it passes**
Run Vitest and verify PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/PageLoader.tsx frontend/src/PageLoader.test.tsx
git commit -m "feat: render dynamic tables using API schemas with alias fallback"
```
