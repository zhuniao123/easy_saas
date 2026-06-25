# Specification: Database DDL/DML Execution Console

**Date:** 2026-06-22  
**Topic:** Raw SQL Executor for DDL/DML Statements  
**Status:** Proposed  

---

## 1. Goal

Since the PostgreSQL instance is not publicly accessible over the internet, we want to provide a database administration workspace in the browser. Developers should be able to execute raw SQL statements (such as `CREATE TABLE`, `INSERT`, `DROP TABLE`, or database schema updates) directly from the console to prepare physical tables for testing.

---

## 2. API Endpoint Addition

### `POST /api/v1/queries/execute-raw`
Executes an arbitrary SQL statement against the PostgreSQL database.
* **Request Body**:
  ```json
  {
    "sql": "CREATE TABLE products (id SERIAL, name VARCHAR(100), price NUMERIC(10,2), instock BOOLEAN)"
  }
  ```
* **Response Body**:
  ```json
  {
    "status": "success",
    "message": "Statement executed successfully."
  }
  ```

---

## 3. UI Component Addition (Frontend)

We will introduce a third editor area titled **"DDL/DML Statement Console"** inside the `Developer Configuration Console` of [PageLoader.tsx](file:///root/saas-demo/frontend/src/PageLoader.tsx):

```
+-------------------------------------------------------------------------+
|                      Developer Configuration Console                     |
+-------------------------------------------------------------------------+
|  +---------------------+ +--------------------+ +--------------------+  |
|  | SQL Query Editor    | | Schema Config JSON | | SQL Execute Console|  |
|  | SELECT ...          | | [ { "field":.. } ] | | CREATE TABLE...    |  |
|  +---------------------+ +--------------------+ +--------------------+  |
|  | [ Save SQL Query ]  | | [ Save Schema ]    | | [ Execute SQL ]    |  |
|  +---------------------+ +--------------------+ +--------------------+  |
+-------------------------------------------------------------------------+
```

### Flow Example:
1. Input raw query to create table and insert rows:
   ```sql
   CREATE TABLE items (id SERIAL, item_name VARCHAR(100));
   INSERT INTO items (item_name) VALUES ('Keyboard'), ('Mouse');
   ```
2. Click **"Execute SQL"**.
3. Modify the SQL Query Text to query the newly created table:
   ```sql
   SELECT * FROM items
   ```
4. Click **"Save & Apply SQL"** to see the live records render in the dynamic data table!
