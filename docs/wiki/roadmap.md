# Roadmap

## 阶段一 / 1.0

主题：`SQL-first Smart Grid`

### 已完成方向

- 配置态 / 运行态分离
- SQL 保存后自动生成默认配置草案
- 基础 JSON / SQL 校验链路
- 预览表格从主视图降级为配置态可切换 preview
- 保留 raw SQL 入口
- 单表 CRUD 雏形、动态下拉/自动补全、多页面 SPA

## v1.x（当前主线，可演示）

主题：`积木化单表工作台 + 小店多页 Demo`

| 能力 | 状态 |
|------|------|
| rawSql / singleTableTemplate + writable 门禁 | 已有 |
| sqlTransaction + sqlAssetCode 仓库 | 已有 |
| SQL 仓库试跑 + openQuery 钻取 | 已有 |
| 小店 8 页 Demo（`demos/shop_saas`） | 已有 |
| 字典 / 缓存 / 完整权限 | **约定与占位，见 2.0 规划** |

### 1.x 硬原则（防以后翻车）

- 业务尽量 **DSL + SQL**，禁止领域硬编码 Controller  
- 静态枚举用 **dictCode 命名**（实现可先 static）  
- 执行入口集中：Query / Action / Options（便于接缓存与权限）  
- 详见：[v2-platform-capabilities-plan.md](./v2-platform-capabilities-plan.md)

### 1.1 终点（当前）

配置驱动 + 小店多页 **可演示**。见各 demos 与既有 wiki。

### 1.2「能交给店员」— 已拍板

| 轨道 | 主题 | 文档 |
|------|------|------|
| **主线** | RBAC + 锁 DSL/Entity + **C1 整单过账** + **C2 数据范围** | [v1.2-rbac-and-locks.md](./v1.2-rbac-and-locks.md) |
| **支线** | C3 测库隔离、C4 定时备份 + 中文错误文案 | 同上 |
| **工程** | 优先 Sa-Token（或 Spring Security）+ PG 原生锁，少自研 | 文档 §6 工具包 |

### 1.x 不做

- 主从表 UI  
- Redis / IoPlugin 生产化  
- 用 Groovy 替代过账 SQL  
- 把 role/user 写进每条 SQL 资产  

### 1.5 收官 + 1.6 多库预埋

| 能力 | 状态 |
|------|------|
| RBAC + 权限台 + Factory 表格/模板 | 已有 |
| Showcase demo | 已有 |
| **多数据源目录 + 密码 AES-GCM** | **1.6 已预埋**（见 [v1.6-multi-datasource.md](./v1.6-multi-datasource.md)） |
| 页面/查询 `data_source_code` 列 | 已加（可空 = 平台库） |
| 运行时按 ds 路由 Query/Action/CRUD | **下一切片** |
| **AI 建页 skill + CLI 雏形** | **已有**（`ai-page-scaffold` / `tools/easy_saas_cli`）→ 2.0 产品化 |

## v1.6 - v1.9（2.0 前基础版打磨）

主题：`基础版准生产`

2.0 前的重点不是继续堆大功能，而是把极小 SaaS 基础版打磨完整。

| 版本 | 目标 | 验收重点 |
|------|------|----------|
| `1.6` | 多数据源运行时路由 + SQL 仓库增强 | Query / Action / CRUD 按 `data_source_code` 执行；SQL 资产统计执行次数、耗时、错误 |
| `1.7` | AI 建页质量门 + 配置版本化 | CLI 幂等 apply、dry-run、AI scaffold smoke；SQL/JSON 配置可版本管理 |
| `1.8` | 单表工作台完整度 + 脚本埋点 | filter operator、editor registry、dict/options/suggest；前端 JS plugin 与后端 Groovy hook 产品化 |
| `1.9` | 准生产基础能力 + 调度入口 | 日志、备份、权限后端脱敏、慢查询观测；JobRegistry 可外挂执行 SQL 仓库任务 |

基础版完成标准：AI 可以创建一个极小 CRUD SaaS，且不需要业务 Java Domain。

复杂 SQL 边界：1.x/2.0 必须支持 `SELECT/WITH` 类型复杂查询、join 只读表格、分页排序筛选的安全包裹；但 join 结果不自动启用 CRUD。写入仍走 `singleTableTemplate` 主键 CRUD 或显式 `sqlTransaction` action。

## 阶段二 / 2.0

主题：`主从模板 + 平台能力接驳（不挡业务配置）`

### 2.0 产品

- `masterDetailTemplate`（owtb 头行模型）  
- 详情页 / 可配置 `openPage` 弹出（完整 Page 运行时，优于仅 query 抽屉）  
- 复用 1.x：sqlTransaction、SQL 仓库、openQuery、Editor、**RBAC/锁**  
- 为 3.0 workflow 预留 `JobRegistry`、`PluginHost`、`Outbox`、`SearchProvider`、`CacheProvider`

### 2.0 平台（规划文档已写）

| 模块 | 要点 |
|------|------|
| **缓存** | Metadata + options + 可选只读 query；TTL/tags；写后失效；默认进程内，可接 Redis |
| **JS / Groovy 埋点** | before/after query & action；减少重复 SQL 和展示加工压力，不替代权威事务 |
| **Tab 性能** | 元数据会话缓存、options batch、runtime/studio 拆分、idle 预取 |
| **权限深化** | 数据范围/RLS 兜底（1.2 先做 RBAC + forcedParams 雏形） |
| **外部插件** | afterAction + outbox/SPI，SQL 主路径、I/O 侧车 |
| **SQL 仓库治理** | query/openQuery/options/action/job 都引用仓库；统计执行次数/耗时/错误；SQL/JSON 版本化 |
| **大文本/搜索** | SearchProvider 占位；PG 可实现，后续可接 Mongo/OpenSearch |
| **索引/分区** | Advisor + Dialect Executor；先给建议，不自动改库 |

分阶段：2.0a 主从 → 2.0b 性能/缓存 → 2.0c 脚本/字典 → 2.0d 插件  

完整说明：[v2-platform-capabilities-plan.md](./v2-platform-capabilities-plan.md)  
索引/锁/多端/权限注入：[indexes-locks-mobile-authz.md](./indexes-locks-mobile-authz.md)

## 阶段三 / 3.0

主题：`SQL-driven Workflow Platform`

- 基于现有 Action 机制演进 Workflow，不推倒重来
- SQL/action 定义状态流转、指派、认领、转交
- 定时任务通过 JobRegistry 触发 query/action
- 跨系统联动走 outbox + PluginHost，不在事务里直接 HTTP
- 大文本查询走 SearchProvider，缓存走 CacheProvider，避免强依赖 PG

完整说明：[v2-foundation-and-v3-workflow-plan.md](./v2-foundation-and-v3-workflow-plan.md)
