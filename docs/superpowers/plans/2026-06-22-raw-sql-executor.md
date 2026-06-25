# Raw SQL DDL/DML Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a database execution console in the browser allowing developers to run raw SQL statements (like `CREATE TABLE` and `INSERT`) to bypass lack of direct PostgreSQL public port access.

**Architecture:**
1. Backend `QueryEngineService` and `QueryController` expose a `POST /api/v1/queries/execute-raw` endpoint to run arbitrary JDBC statements.
2. React `PageLoader.tsx` is updated to include a third editor pane for running DDL/DML scripts.
3. Successful execution updates the local database tables, enabling queries to select from newly created structures.

**Tech Stack:** Java 17, Spring Boot, Spring JDBC, React, Tailwind CSS, Vitest, JUnit 5.

## Global Constraints
* **OS Platform:** Linux (Ubuntu 24.04.4 LTS)
* **Backend build:** Maven (pom.xml)
* **Database:** PostgreSQL 17
* **Testing:** TDD mandatory (failing test first, watched fail, minimal implementation to pass, verify green).

---

### Task 1: Backend TDD - Support Raw SQL Execution API

**Files:**
* Modify: `backend/src/main/java/com/example/lowcode/service/QueryEngineService.java`
* Modify: `backend/src/main/java/com/example/lowcode/controller/QueryController.java`
* Test: `backend/src/test/java/com/example/lowcode/QueryControllerTest.java`

**Interfaces:**
* Consumes: Database schema connection.
* Produces: `POST /api/v1/queries/execute-raw` returning `{ "status": "success", "message": "Statement executed successfully." }`.

- [ ] **Step 1: Write the failing test**
Add the following integration test to `QueryControllerTest.java` verifying raw SQL executions:
```java
    @Test
    public void testExecuteRawSql() throws Exception {
        jdbcTemplate.execute("DROP TABLE IF EXISTS test_raw CASCADE");

        // Execute DDL statement via raw API
        mockMvc.perform(post("/api/v1/queries/execute-raw")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sql\":\"CREATE TABLE test_raw (id INT, val TEXT); INSERT INTO test_raw VALUES (1, 'RawData')\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"));

        // Query database to verify table was created and data inserted
        Integer count = jdbcTemplate.queryForObject("SELECT count(*) FROM test_raw", Integer.class);
        assertThat(count).isEqualTo(1);
    }
```
*Note: Make sure `org.assertj.core.api.Assertions.assertThat` is imported (or using JUnit assertions).*

- [ ] **Step 2: Run test to verify it fails**
Run: `env -u http_proxy -u https_proxy -u ALL_PROXY -u HTTP_PROXY -u HTTPS_PROXY mvn test -Dtest=QueryControllerTest`
Expected: FAIL (compilation errors or HTTP 404 since endpoint does not exist yet).

- [ ] **Step 3: Write minimal implementation**
* Add `executeRawSql(String sql)` in `QueryEngineService.java`.
* Expose `/execute-raw` endpoint in `QueryController.java`.

- [ ] **Step 4: Run test to verify it passes**
Run: `env -u http_proxy -u https_proxy -u ALL_PROXY -u HTTP_PROXY -u HTTPS_PROXY mvn test -Dtest=QueryControllerTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/com/example/lowcode/service/QueryEngineService.java backend/src/main/java/com/example/lowcode/controller/QueryController.java backend/src/test/java/com/example/lowcode/QueryControllerTest.java docs/superpowers/plans/2026-06-22-raw-sql-executor.md docs/superpowers/specs/2026-06-22-raw-sql-executor.md
git commit -m "feat: implement backend raw SQL DDL/DML execution API"
```

---

### Task 2: Frontend TDD - Support DDL/DML Statement Area in PageLoader

**Files:**
* Modify: `frontend/src/PageLoader.tsx`
* Test: `frontend/src/PageLoader.test.tsx`

**Interfaces:**
* Consumes: POST endpoint from Task 1.
* Produces: A third code input console in PageLoader for DDL/DML scripts.

- [ ] **Step 1: Write the failing test**
Add the following test case inside `PageLoader.test.tsx`:
```typescript
test('renders database execute console textarea and button', async () => {
  const mockPageData = {
    pageCode: 'user_list',
    title: 'User Dashboard',
    queryCode: 'q_users_score',
    entityCode: 'users',
    config: { actions: [], columns: [], filters: [] }
  };

  global.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('/api/v1/pages/user_list')) {
      return Promise.resolve({ json: () => Promise.resolve(mockPageData) } as Response);
    }
    if (url.includes('/api/v1/queries/q_users_score/execute')) {
      return Promise.resolve({ json: () => Promise.resolve({ columns: [], rows: [] }) } as Response);
    }
    if (url.includes('/api/v1/queries/q_users_score')) {
      return Promise.resolve({ json: () => Promise.resolve({ sqlText: '' }) } as Response);
    }
    if (url.includes('/api/v1/pages/entities/users')) {
      return Promise.resolve({ json: () => Promise.resolve({ fields: [] }) } as Response);
    }
    return Promise.reject(new Error('Unknown url: ' + url));
  });

  render(<PageLoader pageCode="user_list" />);
  
  await waitFor(() => {
    expect(screen.getByText('Developer Configuration Console')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByText('Developer Configuration Console'));

  await waitFor(() => {
    expect(screen.getByPlaceholderText('Enter CREATE TABLE, INSERT, or other DDL/DML statements here...')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run` in `frontend`
Expected: FAIL (cannot find textarea placeholder)

- [ ] **Step 3: Write minimal implementation**
In `PageLoader.tsx`:
* Introduce a textarea for raw SQL execution.
* Style the layout grid to accommodate three columns on larger screens (SQL Editor, Schema Editor, SQL Console).
* Bind click handler to send `POST /api/v1/queries/execute-raw` and render status messages.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run` in `frontend`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add frontend/src/PageLoader.tsx frontend/src/PageLoader.test.tsx
git commit -m "feat: implement database execute console panel in PageLoader UI"
```
