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

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 2: Implement Metadata Page API

**Files:**
* Create: `backend/src/main/java/com/example/lowcode/controller/PageController.java`
* Create: `backend/src/main/java/com/example/lowcode/service/PageService.java`
* Test: `backend/src/test/java/com/example/lowcode/PageControllerTest.java`

**Interfaces:**
* Consumes: Database schema from Task 1.
* Produces: `GET /api/v1/pages/{pageCode}` endpoint returning merged configuration map.

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 3: SQL Execution Engine & Dynamic Query API

**Files:**
* Create: `backend/src/main/java/com/example/lowcode/service/QueryEngineService.java`
* Create: `backend/src/main/java/com/example/lowcode/controller/QueryController.java`
* Test: `backend/src/test/java/com/example/lowcode/QueryControllerTest.java`

**Interfaces:**
* Consumes: Database schema from Task 1.
* Produces: `POST /api/v1/queries/{queryCode}/execute` returning lists of map objects.

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

---

### Task 4: Dynamic JS Script Router

**Files:**
* Create: `backend/src/main/java/com/example/lowcode/controller/ScriptController.java`
* Test: `backend/src/test/java/com/example/lowcode/ScriptControllerTest.java`

**Interfaces:**
* Consumes: Database `lc_script` schema from Task 1.
* Produces: `GET /api/v1/scripts/{scriptCode}.js` returning JS with `Content-Type: application/javascript`.

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

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

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**

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

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit**
