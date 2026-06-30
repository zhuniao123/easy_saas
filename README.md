# easy_saas

`easy_saas` 是一个 `SQL-first`、配置驱动的 SaaS 前端原型。

第一阶段目标已经收敛为一条很明确的链路：

`只配 SQL -> 自动生成智能表格 -> 再用 PageModel / EntityModel 做增强`

这意味着当前版本的产品边界是：

- `SQL` 是第一入口
- `PageModel` 负责页面展示与交互增强
- `EntityModel` 负责实体语义增强
- `Raw SQL` 入口保留，用于建表、插入测试数据和远端调试
- CRUD 不是“任意 SQL 默认可写”，而是“识别出稳定实体和主键后才启用”

## Stage One Positioning

阶段一不是完整低代码平台，而是一个可展示的 web 版 SQL 客户端雏形，重点是：

- 只配置 SQL 就能先得到可用表格
- 表格具备分页、排序、筛选等基础能力
- 再通过配置逐步增强展示、动作和实体语义

如果这条路径不成立，第一阶段就还没有真正达到“SQL-first Smart Grid”的目标。

## Current Features

1. `Runtime Mode`
   运行态页面，负责表格展示、分页、排序、筛选和动作。
2. `Config Mode`
   配置态 studio，负责 SQL、PageModel、EntityModel 和 Raw SQL 的编辑。
3. `SQL Introspect`
   保存 SQL 后自动生成默认 `PageModel` 草案和 `EntityModel` 字段草案。
4. `Smart Grid Preview`
   配置态内可切换预览，不再让大表格挤压配置主视图。

## Model Boundary

- `QueryModel` 回答“数据从哪来”
- `PageModel` 回答“页面怎么呈现”
- `EntityModel` 回答“这条数据在业务上是什么”

推荐渲染优先级：

`PageModel.columns > EntityModel.fields > SQL introspect`

也就是说：

- 页面最终列标题、顺序、过滤器、动作优先由 `PageModel` 决定
- `EntityModel` 提供主键、label、只读、审计、字典等语义
- 两者都没有时，系统再回退到 SQL / 数据库自动推导

## CRUD Boundary

阶段一里，`只配 SQL` 应该默认得到的是 `只读智能表格`，不是自动可写页面。

只有满足以下条件时，CRUD 才应该启用：

1. 查询绑定了单一 `anchor entity`
2. `EntityModel` 明确声明主键
3. 查询结果包含该主键
4. 写回目标表明确
5. 查询不是聚合、汇总或不可逆结果集

结论就是：启用 CRUD，应该要求稳定主键，不应该仅凭任意 SQL 结果集自动打开。

## Documentation

- [docs/README.md](/root/easy_saas/docs/README.md) - 文档入口
- [docs/wiki/README.md](/root/easy_saas/docs/wiki/README.md) - Wiki 首页
- [docs/wiki/stage-one-acceptance.md](/root/easy_saas/docs/wiki/stage-one-acceptance.md) - 阶段一验收口径
- [docs/wiki/model-boundaries.md](/root/easy_saas/docs/wiki/model-boundaries.md) - Query/Page/Entity 边界
- [docs/wiki/crud-boundaries.md](/root/easy_saas/docs/wiki/crud-boundaries.md) - CRUD 规则和限制
- [docs/wiki/v1.5-modular-dsl-plan.md](/root/easy_saas/docs/wiki/v1.5-modular-dsl-plan.md) - v1.5 模块化 DSL 方案
- [docs/wiki/dev-wiki.md](/root/easy_saas/docs/wiki/dev-wiki.md) - 后续开发维护约定
- [docs/wiki/roadmap.md](/root/easy_saas/docs/wiki/roadmap.md) - 分阶段路线
- [docs/wiki/new-session-development-prompt.md](/root/easy_saas/docs/wiki/new-session-development-prompt.md) - 新会话开发提示词
- [requirement.md](/root/easy_saas/requirement.md) - 需求与架构草案

## Tech Stack

- Backend: Java 17, Spring Boot, Spring JDBC, PostgreSQL 17
- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, Vitest

## Local Run

### Prerequisites

- Java 17 / Maven
- Node.js 18+
- PostgreSQL 17

### 1. Database

```sql
CREATE DATABASE lowcode;
```

应用启动时会通过 `schema.sql` 初始化基础表。

### 2. Backend

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8081
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev -- --port 5173
```

浏览器打开 `http://localhost:5173`，前端会把 `/api` 代理到后端。
