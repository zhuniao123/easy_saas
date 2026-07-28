# easy_saas 2.0：连锁门店收银系统承载目标与验收合同

> 状态：2.0 范围基线
>
> 基准业务：美容美发连锁门店收银管理系统
>
> 目标不是复制某个行业 UI，而是证明 easy_saas 能以 SQL-first 方式配置出同等业务闭环。

## 1. 2.0 成功定义

easy_saas 2.0 应能在**不新增美容美发领域 Java Controller/Service** 的前提下，通过 SQL 资产、Page/Entity/Action Model、JS/Groovy Hook 和通用插件，承载以下闭环：

1. 多门店、员工、会员、商品、服务和卡类等基础资料；
2. 订单头行、购物车、挂单、结算、充值、次卡购买/扣次/退款；
3. 预约到店后生成待结算业务单据；
4. 门店、角色、动作、行和字段权限；
5. 收入、业绩、会员、工资等查询与聚合报表；
6. Excel 导入导出、打印、短信、备份和归档等外部或后台能力；
7. 关键写入具备原子性、并发保护、幂等、审计和可恢复性。

验收关注“能否由平台通用能力配置完成”，不要求复刻参考系统的视觉样式、组件名称或 API 路径。

## 2. 不变的架构原则

### 2.1 SQL-first 的含义

- SQL Repo 是查询、写入、断言、插件载荷和触发条件的数据真源；
- Page DSL 只组织页面骨架、区域、控件、状态和事件；
- JS Hook 负责客户端交互和临时状态，不作为权威业务状态；
- Groovy Hook 负责服务端编排、校验、参数加工和异常映射，不散落大量内联 SQL；
- Transaction Executor 掌握连接、事务、超时、提交和回滚；
- Provider/Plugin 只实现数据库之外的 I/O 能力；
- 业务模型不得硬编码进平台 Java Domain。

### 2.2 平台控制面与业务数据面

```text
easy_saas Runtime
├── Platform Control Plane（默认 PostgreSQL）
│   ├── JSONB DSL / 配置版本
│   ├── 权限、审计、日志
│   ├── Outbox / Job
│   ├── 全文、JSON、可选向量检索
│   └── 默认 Cache/Search/Queue Provider
└── Business Data Plane（DataSourceRegistry）
    ├── PostgreSQL
    ├── MySQL
    └── 后续 JDBC 方言
```

PostgreSQL 是平台推荐的一站式实现，可在早中期替代部分 MongoDB、Redis、全文搜索、队列和向量数据库需求；但业务 Query、CRUD、Action 和 DSL 不得假定业务库一定是 PostgreSQL。

### 2.3 模板数量收敛

2.0 核心只维护四类页面模板：

| 模板 | 职责 | 2.0 状态 |
|------|------|----------|
| `smartGridTemplate` | 单结果集查询和受控单实体 CRUD | 已有，继续打磨 |
| `masterDetailTemplate` | 一主多从、整单编辑和整单动作 | 新增，P0 |
| `dashboardTemplate` | 多 Query 只读聚合、指标、图表和钻取 | 新增，P0 |
| `workspaceTemplate` | 多区域、共享状态、事件驱动的业务操作台 | 新增，P0 |

Calendar、Wizard/Steps、Kanban、Tree、Timeline、Cart、Print 等作为通用 Region/Control/Plugin，不新增行业模板。

## 3. 通用运行时合同

### 3.1 Region

所有复合模板复用统一 Region 协议：

- `code`：页面内稳定标识；
- `component` / `plugin`：渲染器注册名；
- `queryCode`：SQL Repo 数据源；
- `bind`：从 page/master/region/session/forced context 绑定参数；
- `mapping`：结果列到控件输入的映射；
- `visibleWhen` / `disabledWhen`：声明式条件；
- `events`：标准事件输出；
- `refreshOn`：依赖事件与刷新策略；
- 独立 loading、empty、error、retry 状态。

### 3.2 页面状态与事件

- 页面状态区分 `ephemeral`、`draft`、`server`，不得把临时状态误作服务端事实；
- Region 只通过标准 Event Bus 交互，不直接引用其他 React 组件；
- 状态可以生成 Query/Action 参数，但 forcedParams 和权限参数只能由服务端覆盖；
- 页面刷新、路由切换和草稿恢复行为必须可配置和可测试。

### 3.3 插件注册

控件和外部能力通过 Registry 注册，模板不直接依赖具体实现：

- `ComponentPlugin`：chart、calendar、cart、steps、pivot 等；
- `ClientPlugin`：本地打印、文件保存等；
- `IoProvider`：短信、邮件、Webhook、对象存储等；
- `CacheProvider`、`SearchProvider`、`QueueProvider`、`LockProvider`；
- 插件声明输入 Schema、输出 Schema、权限、运行阶段、超时和错误类型。

## 4. Transaction Action / 简单 Workflow

2.0 不建设完整 BPMN 引擎。简单事务流基于现有 `sqlTransaction`，由 JS/Groovy Hook 嵌入式扩展。

### 4.1 标准执行阶段

```text
authorize / forcedParams
→ beforeValidate
→ begin transaction（单一 dataSourceCode）
→ beforeAction
→ assert / write statements
→ beforeCommit
→ commit
→ afterCommit / outbox
```

异常路径：

```text
onError → rollback → afterRollback → audit/error log
```

### 4.2 2.0 必备能力

- 命名参数和显式参数来源；
- SQL Asset 引用和版本固定；
- 多语句原子提交；
- SQL 结果输出到后续步骤；
- Groovy 条件、分支、循环和参数加工；
- 行锁、乐观锁和锁顺序；
- 幂等键和重复提交保护；
- 服务端金额、余额、库存和次数断言；
- 统一业务错误码、中文消息和审计；
- 同一事务内所有 SQL 必须解析到同一业务数据源；
- 外部 I/O 不参与本地数据库事务。

### 4.3 外部动作的 SQL-first Pipeline

```text
Trigger
→ Condition Query
→ Payload Query
→ Provider Plugin
→ Result Mapping
→ Success Action / Error Action
```

打印、短信、Webhook 等默认在 `afterCommit` 或 Outbox Worker 执行。需要可靠交付时，业务事务只写 `plugin_outbox`；Worker 通过 SQL 认领、重试、成功或转入 dead-letter。

## 5. 数据源、方言和 PG 边界

### 5.1 必须实现

- `DataSourceRegistry`：解密、连接池、健康检查、禁用和回收；
- Query、CRUD、Action、Options 按 `data_source_code` 路由；
- 解析优先级：Action/Query > Page > default；
- 平台 MetadataDataSource 与业务 DataSource 在代码中解耦；
- `SqlDialect` 至少覆盖 PostgreSQL 和 MySQL；
- 标识符、分页、模糊查询、布尔、时间、upsert、锁和 Schema introspection 方言化；
- 测试矩阵至少包含 PG 平台库 + PG 业务库、PG 平台库 + MySQL 业务库。

### 5.2 PG 默认 Provider

2.0 可以默认使用：

- JSONB：页面、动作、脚本和插件 DSL；
- GIN/`pg_trgm`：元数据与中等规模文本搜索；
- Outbox + `FOR UPDATE SKIP LOCKED`：异步任务；
- 进程内 L0 + PG L1：早期缓存；
- 可选 `pgvector`：AI/DSL/SQL 资产语义检索。

这些是 Provider 的默认实现，不得成为 Page DSL 的数据库方言要求。

## 6. 业务承载验收场景

### A. 基础资料与 Smart Grid

- 配置门店、部门、员工、会员、商品、服务和卡类页面；
- 支持分页、筛选、排序、字典、联想、导入、导出和软删除；
- MySQL 业务库上 CRUD 可用；
- 无美容美发领域 Java 代码。

### B. 主从单据

- 配置订单头和多行项目；
- 新增、编辑、删除明细并整单保存；
- 保存失败全部回滚；
- 主记录切换正确刷新所有 Detail；
- 整单 Action 可读取 master、details、session 和 forced context。

### C. 复合收银工作台

- 通过 Workspace 配置会员选择、项目选择、购物车、金额汇总和支付区域；
- Region 通过 State/Event 联动；
- 支持临时挂单和恢复；
- 结算可同时写订单、明细并更新余额/次卡/库存；
- 重复点击、余额不足、库存冲突时无部分提交；
- UI 可以不同于参考系统，但业务结果等价。

### D. Dashboard

- 全局日期和门店参数驱动至少四个独立 Query Region；
- 展示 KPI、趋势图、分类图、排行或 Pivot、明细表；
- 图表点击可钻取明细；
- 单一区块失败不破坏整页，支持重试；
- 可导出关键数据。

### E. 权限与多门店

- 页面、Query、Action、行范围和字段权限由后端执行；
- 客户端伪造 `store_number` 无法越权；
- 服务端门店上下文切换受授权范围控制；
- 敏感字段后端脱敏；
- 审计记录用户、门店、动作、数据源、配置版本和 requestId。

### F. 插件与后台任务

- 使用 SQL Condition/Payload 驱动一个打印插件和一个短信模拟 Provider；
- 插件失败不回滚已经提交的订单；
- Outbox 支持重试、幂等和 dead-letter；
- Job 可以引用 Query/Action 完成备份或归档样例；
- Provider 可替换且不修改 Page DSL。

## 7. 2.0 非目标

- 复刻参考系统全部 UI 和每张报表；
- 为某个行业增加 Java Domain；
- 任意 join 查询自动写回；
- 跨数据库分布式事务；
- 完整 BPMN、人工任务中心和复杂长流程；
- 第一版即引入 Redis、Mongo、OpenSearch、Kafka；
- 拖拽式自由页面设计器；
- 把任意前端 JS 或 Groovy 当作无限权限逃生舱。

## 8. 2.0 发布总门槛

只有同时满足以下条件，才能标记 2.0：

1. 四类模板有稳定 Schema、运行时和示例；
2. PG 平台库可驱动 MySQL 业务库的 Query/CRUD/Action；
3. 收银工作台验收场景在并发、异常和重复提交测试下保持一致性；
4. 数据权限在后端生效；
5. 插件使用 SQL Condition/Payload，并遵循 transaction/afterCommit/async/client 阶段；
6. 配置、SQL、脚本和动作有版本、审计及回滚依据；
7. 前后端构建、测试、迁移和两个数据库组合的集成测试通过；
8. 示例业务没有新增美容美发领域 Java Controller/Service。

执行拆分与逐里程碑证据见：[2.0 连锁门店承载实施计划](../superpowers/plans/2026-07-27-easy-saas-2.0-chain-salon-plan.md)。
