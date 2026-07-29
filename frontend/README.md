# easy_saas Frontend

React 19 + TypeScript + Vite 8 + Tailwind CSS v4 前端，包含业务运行态、配置态、SQL 仓库、权限和数据源管理界面。

## Requirements

- Node.js 20.19+、22.13+ 或 24+
- 后端默认运行在 `http://localhost:8081`

## Development

```bash
npm ci
npm run dev -- --port 5173
```

打开 `http://localhost:5173`。Vite 会按 `vite.config.ts` 将 `/api` 代理到 `http://localhost:8081`。

## Scripts

```bash
npm run lint
npm run build
npm test -- --run
```

当前前端测试集中在 `src/PageLoader.test.tsx`。`npm run build` 同时执行 TypeScript project build 和 Vite production build。

## Main Modules

| 文件/目录 | 职责 |
|---|---|
| `src/App.tsx` | 应用壳、导航、运行态/配置态入口 |
| `src/PageLoader.tsx` | 页面加载、表格运行时和配置工作台 |
| `src/pageDsl.ts` | Page DSL 类型与规范化 |
| `src/actionRegistry.ts` | 页面动作、SQL 事务动作和 CSV 导出 |
| `src/editors/` | 通用编辑器类型 |
| `src/runtime/` | 权限、字段装饰器和钻取抽屉 |
| `src/auth.ts` | 登录态和权限检查 |
| `src/SqlRepoConsole.tsx` | SQL 仓库管理 |
| `src/RbacAdminConsole.tsx` | RBAC 管理 |
| `src/DataSourceConsole.tsx` | 多数据源目录管理 |

## Production Preview

仓库根目录运行：

```bash
docker compose -f docker-compose.preview.yml up --build
```

前端会构建为静态资源并由 Nginx 提供，访问 `http://127.0.0.1:18080`；Nginx 将 `/api` 转发到 Compose 中的后端服务。
