# easy_saas

`easy_saas` 是一个 `SQL-first`、配置驱动的 SaaS 原型，后端负责元数据、查询、动作和权限，前端负责配置态与运行态渲染。

第一阶段目标已经收敛为一条很明确的链路：

`只配 SQL -> 自动生成智能表格 -> 再用 PageModel / EntityModel 做增强`

这意味着当前版本的产品边界是：

- `SQL` 是第一入口
- `PageModel` 负责页面展示与交互增强
- `EntityModel` 负责实体语义增强
- `Raw SQL` 入口保留，用于建表、插入测试数据和远端调试
- CRUD 不是“任意 SQL 默认可写”，而是“识别出稳定实体和主键后才启用”

## Current Baseline

当前代码基线是 `1.5 可演示 + 1.6 多数据源目录预埋`，不是最初的 MVP 方案。已落地能力如下：

| 能力 | 代码状态 |
|---|---|
| Runtime / Config 模式 | 已实现 |
| SQL 查询、服务端分页、排序、筛选 | 已实现 |
| SQL introspect 与 Page/Entity 草案 | 已实现 |
| `rawSql` 只读与 `singleTableTemplate` 受控 CRUD | 已实现 |
| SQL 仓库、`sqlTransaction`、`openQuery` | 已实现 |
| 字典、options/suggest、前端装饰器 | 已实现 |
| Sa-Token 登录、页面/查询/动作/字段权限 | 已实现 |
| 查询、动作、客户端及服务端错误日志 | 已实现，统一审计与 trace 尚未完成 |
| 多数据源目录、AES-GCM 密码存储、管理台 | 已实现 |
| Query/Action/CRUD 按数据源运行时路由 | 未实现，是下一开发切片 |
| 主从表模板、工作流、异步任务 | 未实现，属于 2.0/3.0 规划 |

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

- [docs/README.md](./docs/README.md) - 文档入口与现状说明
- [docs/wiki/README.md](./docs/wiki/README.md) - Wiki 首页
- [docs/wiki/stage-one-acceptance.md](./docs/wiki/stage-one-acceptance.md) - 阶段一验收口径
- [docs/wiki/model-boundaries.md](./docs/wiki/model-boundaries.md) - Query/Page/Entity 边界
- [docs/wiki/crud-boundaries.md](./docs/wiki/crud-boundaries.md) - CRUD 规则和限制
- [docs/wiki/v1.6-multi-datasource.md](./docs/wiki/v1.6-multi-datasource.md) - 多数据源已实现和未实现边界
- [docs/wiki/roadmap.md](./docs/wiki/roadmap.md) - 当前路线
- [requirement.md](./requirement.md) - 早期需求与架构草案（历史参考，不代表当前状态）

## Tech Stack

- Backend: Java 17, Spring Boot, Spring JDBC, PostgreSQL 17
- Frontend: React 19, TypeScript, Vite, Tailwind CSS v4, Vitest

## Local Run

### Prerequisites

- Java 17 / Maven
- Node.js 20.19+、22.13+ 或 24+
- PostgreSQL 17

### 1. Database

```bash
createdb -U postgres lowcode
```

创建用户并授权，或直接使用与下面配置一致的 `lowcode/lowcode`。应用启动时会通过 `backend/src/main/resources/schema.sql` 初始化基础表。

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

### Docker Preview

```bash
docker compose -f docker-compose.preview.yml up --build
```

浏览器打开 `http://127.0.0.1:18080`。该编排会同时启动 PostgreSQL、后端和 Nginx 前端。

## Verification

后端测试是 PostgreSQL 集成测试；请先启动本地 `lowcode` 数据库或 Compose 中的 `postgres` 服务，并确保测试配置可连接数据库。

```bash
cd backend
mvn test

cd ../frontend
npm ci
npm run lint
npm run build
npm test -- --run
```

演示环境会自动创建 `owner/owner123` 和 `clerk/clerk123`。它们仅用于本地演示，公网或生产部署必须关闭、删除或更换这些账号。
