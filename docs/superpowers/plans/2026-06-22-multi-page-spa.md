# Multi-Page SPA Lowcode Workspace Implementation Plan

> **Workflow Skill:** executing-plans

**Goal:** Transform the single-page portal into a professional enterprise-grade multi-page SPA. Introduce a left-side hierarchical sidebar, a top-tabbed editor-portal layout, and isolate the Developer Console (Admin Configuration) from the Business Application Portal (User Preview).

---

## 1. Architecture Refactoring

1. **Backend Endpoint**:
   - `GET /api/v1/pages`: Returns a list of all defined pages (`pageCode`, `title`, `routePath`, `queryCode`, `entityCode`).
2. **Frontend UI Split**:
   - **User Persona (Runtime View)**: Renders only the dynamic table and action buttons defined by the DSL. The Developer Configuration Console is hidden.
   - **Developer Persona (Configuration View)**: Displays the SQL Editor, Entity Schema Editor, and Database Execute Console.
3. **Sidebar Menu**:
   - Section 1: `🖥️ Business Applications` (lists all dynamic user pages fetched from the backend). Clicking opens the page in runtime mode.
   - Section 2: `🛠️ Developer Workspace` (dedicated configurations tab to modify queries, schemas, and run DDL/DML migrations).
4. **Tabs Container**:
   - Renders a browser-like tab bar at the top of the main screen allowing multiple open page views and configuration consoles to be active concurrently.

---

## 2. Implementation Todo Steps

- [ ] **Task 1: Backend - Expose List Pages API**
  - [ ] **Step 1.1**: Update `PageService.java` to support `listPages()` querying `lc_page_model`.
  - [ ] **Step 1.2**: Update `PageController.java` exposing `GET /api/v1/pages` returning the pages list.
  - [ ] **Step 1.3**: Restart backend and run verification via curl.

- [ ] **Task 2: Frontend - Database Seeding**
  - [ ] **Step 2.1**: Seed another page `user_page` in PostgreSQL to verify multi-page navigation.

- [ ] **Task 3: Frontend - Layout Refactoring**
  - [ ] **Step 3.1**: Modify `PageLoader.tsx` to accept a `mode` prop (`"config"` | `"runtime"`). If `"runtime"`, hide the `Developer Configuration Console` layout panel.
  - [ ] **Step 3.2**: Refactor `App.tsx` into a 2-column layout (Sidebar + Tabs Main Canvas).
  - [ ] **Step 3.3**: Support active tab states (`id`, `title`, `pageCode`, `mode`, `queryCode`, `entityCode`) to allow switching without losing input parameters.

- [ ] **Task 4: Verification & Testing**
  - [ ] **Step 4.1**: Update vitest tests in `PageLoader.test.tsx` and run testing suites.
  - [ ] **Step 4.2**: Verify live integration via browser.
