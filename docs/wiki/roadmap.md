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

### 1.x 不做

- 主从表 UI  
- Redis / 完整 Authz / IoPlugin 生产化  
- 用 Groovy 替代过账 SQL  

## 阶段二 / 2.0

主题：`主从模板 + 平台能力接驳（不挡业务配置）`

### 2.0 产品

- `masterDetailTemplate`（owtb 头行模型）  
- 详情页 / 可配置 `openPage` 弹出（完整 Page 运行时，优于仅 query 抽屉）  
- 复用 1.x：sqlTransaction、SQL 仓库、openQuery、Editor  

### 2.0 平台（规划文档已写）

| 模块 | 要点 |
|------|------|
| **缓存** | Metadata + options + 可选只读 query；TTL/tags；写后失效 |
| **JS / Groovy 埋点** | before/after query & action；减负 SQL，不替代权威事务 |
| **Tab 性能** | 元数据会话缓存、options batch、runtime/studio 拆分、idle 预取 |
| **权限** | AuthzGateway：page/action/query；稳定 resource id |
| **外部插件** | afterAction + outbox/SPI，SQL 主路径、I/O 侧车 |

分阶段：2.0a 主从 → 2.0b 性能/缓存 → 2.0c 脚本/字典 → 2.0d 权限与插件  

完整说明：[v2-platform-capabilities-plan.md](./v2-platform-capabilities-plan.md)

## 阶段三

主题：`SQL-driven SaaS Platform`

- 更稳 DSL、模板市场、多租户、插件生态  
- 部署与可观测成熟化  
