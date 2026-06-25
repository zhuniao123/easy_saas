# Specification: Developer Configuration Workspace Playground

**Date:** 2026-06-22  
**Topic:** Real-time SQL and Schema Customization Playground  
**Status:** Proposed  

---

## 1. Goal

Provide an interactive playground in the browser where developers can:
* View and edit the database-configured SQL query text for the current page.
* View and edit the metadata fields schema (`fields_json`) of the entity associated with the query.
* Save changes back to the database and see the dynamic table (re-deduced columns, fallback labels, and data rows) update immediately without refreshing the page.

---

## 2. API Endpoint Additions

### 1. GET `/api/v1/queries/{queryCode}`
Returns details of the query model:
```json
{
  "queryCode": "q_users_score",
  "anchorEntity": "users",
  "sqlText": "SELECT username, 100 AS total_score FROM users WHERE username = :code"
}
```

### 2. POST `/api/v1/queries/{queryCode}/configure`
Updates the query model configurations in the database:
```json
{
  "sqlText": "SELECT username, age, 100 AS total_score FROM users WHERE username = :code"
}
```

### 3. GET `/api/v1/pages/entities/{entityCode}`
Returns the metadata definitions of the table fields:
```json
{
  "entityCode": "users",
  "tableName": "users",
  "fields": [
    { "field": "username", "label": "用户名", "type": "string" }
  ]
}
```

### 4. POST `/api/v1/pages/entities/{entityCode}/configure`
Updates the schema configuration (`fields_json`) of the physical table entity:
```json
{
  "fieldsJson": "[{\"field\":\"username\",\"label\":\"用户名\",\"type\":\"string\"}]"
}
```

---

## 3. UI Component Additions (Frontend)

We will introduce a collapsible **"Developer Control Panel"** at the bottom of the table in [PageLoader.tsx](file:///root/saas-demo/frontend/src/PageLoader.tsx):

```
+--------------------------------------------------------------+
|                     Dynamic Data Table                       |
+--------------------------------------------------------------+
|                                                              |
|                  [Collapsible: Developer Console ⚙️]          |
|                                                              |
|  +---------------------------+  +-------------------------+  |
|  | SQL Query Editor          |  | Schema Config (JSON)    |  |
|  | [ SELECT username...    ] |  | [ [ { "field": ... } ] ]|  |
|  +---------------------------+  +-------------------------+  |
|  | [ Save Query Config ]     |  | [ Save Schema Config ]  |  |
|  +---------------------------+  +-------------------------+  |
+--------------------------------------------------------------+
```

### Aesthetic Enhancements:
* Glassmorphic border glow with slate dark layout background (`bg-slate-900`).
* Real-time notifications on save events.
* Instantly re-fetch page configurations and execute queries on save, offering a live design loop.
