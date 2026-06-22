# Developer Playground Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a developer-facing portal playground containing a SQL editor and a table schema configuration JSON panel. This will allow runtime database modification of SQL and entity models, immediately re-deducing columns and rendering the updated table.

**Architecture:**
1. Backend exposes GET/POST query config and GET/POST entity config APIs.
2. `PageService.java` is updated to return associated `queryCode` and `entityCode` from page definitions.
3. React `PageLoader.tsx` queries the config APIs to display the current SQL query and metadata configurations.
4. Saving configuration calls the POST APIs to update the database, triggering query re-execution and layout re-rendering.

**Tech Stack:** Java 17, Spring Boot, Spring JDBC, React, Tailwind CSS, Vitest, JUnit 5.

## Global Constraints
* **OS Platform:** Linux (Ubuntu 24.04.4 LTS)
* **Backend build:** Maven (pom.xml)
* **Database:** PostgreSQL 17
* **Testing:** TDD mandatory (failing test first, watched fail, minimal implementation to pass, verify green).

---

### Task 1: Backend TDD - Support Query & Entity Configuration API

**Files:**
* Modify: `backend/src/main/java/com/example/lowcode/service/PageService.java`
* Modify: `backend/src/main/java/com/example/lowcode/controller/PageController.java`
* Modify: `backend/src/main/java/com/example/lowcode/service/QueryEngineService.java`
* Modify: `backend/src/main/java/com/example/lowcode/controller/QueryController.java`
* Test: `backend/src/test/java/com/example/lowcode/QueryControllerTest.java`

**Interfaces:**
* Consumes: Database schemas from `schema.sql`.
* Produces: 
  * `GET /api/v1/pages/entities/{entityCode}`
  * `POST /api/v1/pages/entities/{entityCode}/configure`
  * `GET /api/v1/queries/{queryCode}`
  * `POST /api/v1/queries/{queryCode}/configure`

- [ ] **Step 1: Write the failing test**
Add the following integration test to `QueryControllerTest.java` verifying configuration CRUD flow:
```java
    @Test
    public void testQueryAndEntityConfiguration() throws Exception {
        jdbcTemplate.execute("DELETE FROM lc_query_model");
        jdbcTemplate.execute("DELETE FROM lc_entity_model");
        
        jdbcTemplate.execute("INSERT INTO lc_entity_model(entity_code, table_name, fields_json) " +
                "VALUES ('users', 'users', '[]'::jsonb)");
        jdbcTemplate.execute("INSERT INTO lc_query_model(query_code, anchor_entity, sql_text) " +
                "VALUES ('q_users_score', 'users', 'SELECT 1 as val')");

        // 1. Get query config
        mockMvc.perform(get("/api/v1/queries/q_users_score"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sqlText").value("SELECT 1 as val"));

        // 2. Post new query config
        mockMvc.perform(post("/api/v1/queries/q_users_score/configure")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sqlText\":\"SELECT 2 as val\"}"))
                .andExpect(status().isOk());

        // Verify query updated
        mockMvc.perform(get("/api/v1/queries/q_users_score"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sqlText").value("SELECT 2 as val"));

        // 3. Get entity config
        mockMvc.perform(get("/api/v1/pages/entities/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entityCode").value("users"));

        // 4. Post entity schema config
        mockMvc.perform(post("/api/v1/pages/entities/users/configure")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"fieldsJson\":\"[{\\\"field\\\":\\\"username\\\",\\\"label\\\":\\\"用户名\\\",\\\"type\\\":\\\"string\\\"}]\"}"))
                .andExpect(status().isOk());
    }
```
*Note: Make sure to import `org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get` on top if not present.*

- [ ] **Step 2: Run test to verify it fails**
Run: `env -u http_proxy -u https_proxy -u ALL_PROXY -u HTTP_PROXY -u HTTPS_PROXY mvn test -Dtest=QueryControllerTest`
Expected: FAIL (compilation errors or HTTP 404 since endpoints don't exist yet).

- [ ] **Step 3: Write minimal implementation**
* Update query models in `QueryEngineService.java` and `QueryController.java`.
* Update page & entity models in `PageService.java` and `PageController.java`.

- [ ] **Step 4: Run test to verify it passes**
Run: `env -u http_proxy -u https_proxy -u ALL_PROXY -u HTTP_PROXY -u HTTPS_PROXY mvn test -Dtest=QueryControllerTest`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/com/example/lowcode/ service/PageService.java controller/PageController.java service/QueryEngineService.java controller/QueryController.java test/java/com/example/lowcode/QueryControllerTest.java
git commit -m "feat: implement dynamic configuration query and entity API endpoints"
```

---

### Task 2: Frontend TDD - Implement Configuration Console in PageLoader

**Files:**
* Modify: `frontend/src/PageLoader.tsx`
* Test: `frontend/src/PageLoader.test.tsx`

**Interfaces:**
* Consumes: GET and POST endpoints from Task 1.
* Produces: Visual configurations textareas and save buttons that reload the page view dynamically.

- [ ] **Step 1: Write the failing test**
Add the following test case inside `PageLoader.test.tsx`:
```typescript
test('renders developer configuration panel and inputs', async () => {
  const mockPageData = {
    pageCode: 'user_list',
    title: 'User Dashboard',
    queryCode: 'q_users_score',
    entityCode: 'users',
    config: { actions: [], columns: [], filters: [] }
  };

  const mockQueryConfig = {
    queryCode: 'q_users_score',
    sqlText: 'SELECT username FROM users'
  };

  const mockEntityConfig = {
    entityCode: 'users',
    fields: []
  };

  global.fetch = vi.fn().mockImplementation((url) => {
    if (url.includes('/api/v1/pages/user_list')) {
      return Promise.resolve({ json: () => Promise.resolve(mockPageData) } as Response);
    }
    if (url.includes('/api/v1/queries/q_users_score')) {
      return Promise.resolve({ json: () => Promise.resolve(mockQueryConfig) } as Response);
    }
    if (url.includes('/api/v1/pages/entities/users')) {
      return Promise.resolve({ json: () => Promise.resolve(mockEntityConfig) } as Response);
    }
    return Promise.reject(new Error('Unknown url'));
  });

  render(<PageLoader pageCode="user_list" />);
  
  await waitFor(() => {
    expect(screen.getByText('Developer Configuration Console')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter bound SQL text here...')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run` in `frontend`
Expected: FAIL (cannot find 'Developer Configuration Console')

- [ ] **Step 3: Write minimal implementation**
In `PageLoader.tsx`:
* Fetch query text and entity fields config if `queryCode` and `entityCode` are available.
* Render a collapsible panel titled "Developer Configuration Console" below the table.
* Implement Textareas for the SQL statement and entity fields JSON.
* Bind Save button handlers that submit the POST configuration calls and trigger local refreshes.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run` in `frontend`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add frontend/src/PageLoader.tsx frontend/src/PageLoader.test.tsx
git commit -m "feat: add developer playground custom SQL & Schema editor to PageLoader"
```
