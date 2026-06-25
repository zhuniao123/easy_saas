# Lowcode Portal: An Enhanced Web-Based PostgreSQL Client & Page Engine

Lowcode Portal is an enterprise-grade web application designed to act as an **enhanced, dynamic PostgreSQL client and page engine**. It maps relational database tables directly into dynamic UI grids using a real-time SQL-to-Table compilation engine, allowing users to configure schemas, run query scripts, and execute full tabular CRUD operations without redeploying.

---

## 🚀 Key Features

1. **Dual Workspaces:**
   * **Business Application (Runtime Mode):** A clean business view featuring paginated, sortable dynamic tables, action triggers, and filter panels.
   * **Developer Console (Config Mode):** Three-column config console containing:
     * **SQL Query Editor:** Edit the primary queries in real-time.
     * **Entity Schema Configurator:** Design column metadata (display names, data types) via JSON configurations.
     * **Database execution console:** Direct DDL/DML script terminal for tables modification.
2. **Page & Menu Manager:** A dynamic meta-console to register, create, and cascade-delete application pages. 
3. **Advanced Tabbed Layout (SPA):** Open multiple pages, query editors, and developer consoles concurrently without losing active form inputs.
4. **Enhanced PG Client Capabilities:**
   * **Pagination & Sorting:** Dynamically wraps developer SQL inside subqueries to perform safe PostgreSQL limit/offset pagination and order routing.
   * **Generic CRUD Operations:** Dynamically parses entity schemas to generate secure dynamic `INSERT`, `UPDATE`, and `DELETE` SQL queries.

---

## 🛠️ Tech Stack
* **Backend:** Java 17, Spring Boot, Spring JDBC (NamedParameterJdbcTemplate), PostgreSQL 17, Groovy scripting support.
* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Vitest.

---

## 📦 Directory Structure
* [backend/](file:///root/saas-demo/backend) — Spring Boot Java REST APIs
* [frontend/](file:///root/saas-demo/frontend) — React Vite client application
* [docs/](file:///root/saas-demo/docs) — Plans and specifications

---

## ⚙️ How to Setup & Run

### Prerequisites
* **Java 17 / Maven**
* **Node.js (v18+) & npm**
* **PostgreSQL 17** (listening on standard port `5432` with database `lowcode`)

### 1. Database Setup
Create a PostgreSQL database and initialize schemas:
```sql
CREATE DATABASE lowcode;
-- Table definitions are automatically seeded on Spring Boot startup via schema.sql
```

### 2. Run Backend APIs
```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8081
```
The APIs will be listening on `http://localhost:8081`.

### 3. Run Frontend Client
```bash
cd frontend
npm install
npm run dev -- --port 5173
```
Open `http://localhost:5173` to start playing. Requests to `/api` are automatically proxied to the backend.
