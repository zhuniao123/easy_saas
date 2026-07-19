# Agent Coordination (并行开发分工)

> 更新时间：2026-07-19  
> 目的：多 agent 同时改仓库时减少冲突，**小步提交、少碰对方文件**。

## 当前主线

**Phase A+B**：writable 硬化 + 单表商品台账积木（见 `docs/superpowers/plans/2026-07-19-v1x-product-ledger-building-blocks.md`）

## 车道划分

| 车道 | 负责范围 | 优先文件 |
|------|----------|----------|
| **A+B / ledger**（本会话） | 后端 writable/query_mode、CRUD 安全、DSL/editors/decorators、商品台账 demo | `PageService.java`, `QueryEngineService.java`, `PageController.java`, `schema.sql`, `frontend/src/pageDsl.ts`, `frontend/src/PageLoader.tsx`（仅 writable/装饰器相关）, `frontend/src/dsl/**`, `frontend/src/editors/**`, `frontend/src/runtime/**`, `demos/product_ledger/**`, `docs/wiki/building-blocks.md` |
| **Shell / UX**（另一 agent） | 应用壳、导航、多页布局体验 | **`frontend/src/App.tsx`**, 可能的 i18n 文案、样式壳层 |
| **共用注意** | 改公共文件前 `git pull` / 看 status；提交信息写清车道 | 不要提交 `backend/target/`、`postgres-data/`、`node_modules/` |

## 规则

1. **先 commit 自己的切片，再开始下一块**；不要攒一大坨。
2. **不要改对方车道的文件**，除非对方 lane 空闲且你在 commit message 标明 `cross-lane:`。
3. `App.tsx` 默认归 Shell；ledger 需要菜单入口时，优先用 **demo SQL 的 route_path**（如 `/inventory/products`）让 shell 自动出现，少改 App。
4. 冲突时：**功能正确性 > 样式**；writable / SQL 安全优先合并 ledger 侧。
5. 本地 identity 可只用 repo 级 `git config user.name`（已可用 `saas-demo-agent`）。

## 本会话已提交

- [x] docs: v1.x plan + building-blocks + roadmap (`bf93b48`)
- [x] feat(A): query_mode + writable 403 + tests (`2cb8646`)
- [x] feat(A/B): pageDsl opt-in + editors/decorators (`a975874`)
- [x] feat(B): product ledger install SQL (`18cd9e9`)
- 并行：`7e60dd5` 为另一路 shell/UX（含 `App.tsx`）

## 其它 agent 请勿覆盖

- **`updateRow` 请保持 `UPDATE … WHERE pk`**，不要再改 delete+insert（FK/序列风险）。协调见 Phase A 注释。
- 勿默认 `features.create/edit/delete = true` 而不经 server `writable` 门禁。
- 继续 Shell 请专注 `App.tsx`；ledger 侧优先 `demos/`、`pageDsl`、`PageService`、`runtime/`。
