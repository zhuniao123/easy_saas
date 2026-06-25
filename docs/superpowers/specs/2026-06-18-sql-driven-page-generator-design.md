# Specification: SQL-Driven Business Page Generator Demo

**Date:** 2026-06-18  
**Topic:** SQL-Driven Business Page Generator  
**Status:** Approved by User  

---

## 1. Executive Summary

This document specifies the architecture and implementation details for the first MVP Demo of the **SQL-Driven Business Page Generator**. 
The goal of this system is to dynamically render business tables (with filtering, pagination, sorting) purely based on configurations stored in a PostgreSQL database.

This demo uses:
* **Backend:** Java Spring Boot, Maven, JDBC (`NamedParameterJdbcTemplate`) for dynamic parameter execution, and `jOOQ` as a fallback helper for complex dynamic queries.
* **Frontend:** React, Tailwind CSS, TanStack Table.
* **Extensibility:**
  * **Backend:** Dynamic Groovy scripting (loaded from the DB and compiled using `GroovyClassLoader`).
  * **Frontend:** Dynamic JS Actions (served by the backend as `.js` files and loaded via dynamic `<script>` injection, registering on a global scope).

---

## 2. System Architecture

```mermaid
flowchart TD
    subgraph Browser [Browser (React Frontend)]
        FE_PageLoader[PageLoader Component] -->|1. Load Page Config| API_Page[GET /api/v1/pages/:pageCode]
        FE_PageLoader -->|2. Mount Renderer| FE_Table[TableRenderer Component]
        FE_PageLoader -->|3. Load Action Scripts| API_Script[GET /api/v1/scripts/:scriptCode.js]
        FE_Table -->|4. Trigger Action| FE_Action[Execute JS Action]
        FE_Table -->|5. Query Data| API_Query[POST /api/v1/queries/:queryCode/execute]
    end

    subgraph Server [Spring Boot Backend]
        API_Page --> Service_Meta[Metadata Service]
        API_Query --> Service_Engine[SQL Engine]
        API_Script --> Service_Script[Script Router]
        
        Service_Engine -->|Groovy Interceptor| Service_Groovy[Groovy Runtime]
        Service_Engine -->|Dynamic Bound SQL| DB_PG[(PostgreSQL Database)]
        Service_Meta --> DB_PG
        Service_Script --> DB_PG
        Service_Groovy --> DB_PG
    end
```

---

## 3. Database Schema Design (PostgreSQL)

The database holds all metadata, configurations, dynamic scripts, and logs.

```sql
-- 1. Entity Model: Schema metadata and semantic labels for physical tables
create table if not exists lc_entity_model (
    entity_code        text primary key,
    table_name         text not null,
    primary_key        text not null default 'id',
    label_field        text,
    fields_json        jsonb not null, -- [{field: 'status', label: 'Status', type: 'string'}]
    created_at         timestamptz not null default now()
);

-- 2. Query Model: Binds raw SQL queries with parameter declarations
create table if not exists lc_query_model (
    query_code         text primary key,
    anchor_entity      text references lc_entity_model(entity_code),
    sql_text           text not null,  -- e.g., SELECT * FROM users WHERE (:name IS NULL OR name LIKE :name)
    params_json        jsonb not null default '[]'::jsonb,          -- Parameter names white-list
    result_fields_json jsonb not null default '[]'::jsonb,          -- Selected columns white-list
    groovy_script_code text,                                         -- Hook code mapping (from lc_script)
    timeout_ms         integer not null default 5000
);

-- 3. Page Model: Front-end runtime visual declarations (columns, filters, actions)
create table if not exists lc_page_model (
    page_code          text primary key,
    title              text not null,
    route_path         text not null unique,
    query_code         text references lc_query_model(query_code),
    entity_code        text references lc_entity_model(entity_code),
    config_json        jsonb not null  -- filters, columns, actions configurations
);

-- 4. Dynamic Script Repository: Stores front-end JS and back-end Groovy scripts
create table if not exists lc_script (
    script_code        text primary key, -- e.g., 'order_actions'
    script_type        text not null,    -- 'FRONTEND_JS' | 'BACKEND_GROOVY'
    script_content     text not null,    -- Plain source code text
    created_at         timestamptz not null default now()
);

-- 5. Execution Logging: For auditing and performance analysis
create table if not exists lc_query_log (
    id                 bigserial primary key,
    query_code         text not null,
    params_json        jsonb not null default '{}'::jsonb,
    duration_ms        integer,
    success            boolean not null,
    error_message      text,
    created_at         timestamptz not null default now()
);
```

---

## 4. Backend Spring Boot Engine

### API Endpoints:
1. **GET `/api/v1/pages/{pageCode}`**
   * Loads the page definition and dynamic configuration.
2. **POST `/api/v1/queries/{queryCode}/execute`**
   * Executes parameter-bound raw SQL defined in the model. Supports sorting and paging parameters.
3. **GET `/api/v1/scripts/{scriptCode}.js`**
   * Resolves JavaScript files dynamically from the database `lc_script` table.
   * **Crucial:** Response header must set `Content-Type: application/javascript`.

### Dynamic Query Execution:
* Bound queries use Spring's `NamedParameterJdbcTemplate` to safely attach user filters.
* If complex runtime query manipulation is needed, the `jOOQ` DSL acts as a typesafe dynamic SQL compiler helper.

### Groovy Execution Engine:
* Back-end intercepts queries dynamically. Scripts in `lc_script` mapping to `BACKEND_GROOVY` are loaded via `GroovyClassLoader` and compiled into Java class instances.
* A cached map `Map<String, Class<?>>` is maintained to prevent class compilation memory leaks in the JVM Metaspace.
* Scripts must implement a standard Java interface:
  ```groovy
  package com.example.context;
  import java.util.Map;
  import java.util.List;

  public interface IGroovyActionInterceptor {
      void beforeQuery(Map<String, Object> params);
      List<Map<String, Object>> afterQuery(List<Map<String, Object>> rows);
  }
  ```

---

## 5. Frontend Dynamic Script Loader & React Bindings

### Frontend loading sequence:
1. **Load Page Configuration:** React router triggers `PageLoader` to request the metadata definition.
2. **Load Actions Scripts:** If actions contain a custom `scriptCode` mapping, inject a `<script>` tag dynamically to fetch it:
   ```javascript
   // Fetches http://localhost:8080/api/v1/scripts/order_actions.js
   const script = document.createElement('script');
   script.src = `/api/v1/scripts/${scriptCode}.js`;
   document.body.appendChild(script);
   ```
3. **Register actions script:** Script files register functions under global namespace `window.AppActions.{scriptCode}`:
   ```javascript
   window.AppActions = window.AppActions || {};
   window.AppActions.order_actions = {
       approveOrder: function(row, context) {
           context.api.post(`/api/v1/orders/${row.id}/approve`).then(() => {
               context.refresh();
           });
       }
   };
   ```
4. **Trigger Actions:** On button click, the table components look up `window.AppActions[{scriptCode}][{methodName}]` and invoke it with current state parameters.

---

## 6. Backlog & Security Roadmap (Post-Demo)

* **Groovy Sandboxing:** Configure `SecureASTCustomizer` to block dangerous packages (`java.io.*`, `java.net.*`, reflection) and restrict classes to a narrow whitelist.
* **Timeout & Thread Pools:** Assign Groovy executors to isolated thread pools with timeouts to avoid hanging threads.
* **HITL ChangeSet Audit:** Any database insertion into `lc_script`, `lc_page_model` must first require approval in a changeset draft before going live.
