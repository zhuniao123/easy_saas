# 2.0 前基础版打磨与 3.0 SQL 流程规划

> 日期：2026-07-21  
> 定位：把 `1.6 -> 2.0` 的基础版收口、`3.0` 的 SQL-driven Workflow、以及数据库/缓存/搜索/分区等低耦合接口一次说清楚。

## 0. 结论

`easy_saas` 的版本线应调整为：

```text
1.6 - 1.9：基础版打磨完整
2.0：主从模板 + 平台接口接驳
3.0：SQL-driven Workflow / Job / Integration
```

这意味着：

- **2.0 之前**：把最简单可用 SaaS 的基础能力打磨完整，不急着做完整流程引擎。
- **2.0**：交付主从模板、openPage、缓存/权限/日志/数据源等通用接口。
- **3.0**：开始把按钮动作升级为 SQL 驱动流程，包括指派、定时任务、跨系统联动。

## 1. 2.0 前必须打磨完整的基础版

### 1.1 基础版目标

基础版不是“功能越多越好”，而是要做到：

- AI 可以创建一个极小 SaaS 页面。
- 单表模板稳定支持查询、筛选、排序、分页、增删改。
- action 能完成普通业务过账。
- 权限、日志、数据源、字典、缓存字段都有统一入口。
- 运行时不写业务 Java Domain。

### 1.2 1.6 - 1.9 建议切片

| 版本 | 目标 | 说明 |
|------|------|------|
| `1.6` | 多数据源真正运行时可用 | Query / Action / CRUD 按 `data_source_code` 路由 |
| `1.7` | 基础版质量门 | CLI apply 幂等、AI 建页 smoke、前后端测试环境稳定、配置版本化 |
| `1.8` | 单表工作台 + 脚本埋点 | filter operator、editor registry、options/suggest、dict、JS plugin、Groovy hook |
| `1.9` | 基础版准生产 | 日志、备份、权限后端脱敏、慢查询可观测、配置变更审计、外挂 JobRegistry |

### 1.3 2.0 前不做

- 完整流程引擎
- 任意脚本平台
- join 查询通用可写
- 复杂主子多层 tab
- 跨系统编排平台

这些能力要留接口，但不要提前把基础版复杂化。

## 2. 2.0 的产品边界

2.0 的核心不是“流程”，而是“页面结构和平台接口”。

### 2.1 2.0 应交付

- `masterDetailTemplate`：主表 + 详情 + 子表。
- `openPage`：完整 Page 运行时弹出，不只是 openQuery 抽屉。
- `MetadataCache` / `OptionsCache` / 可选 `QueryCache` 接口。
- `AuthzGateway`：页面、查询、动作、字段、数据范围统一拦截。
- `ScriptRuntime`：前端 JS plugin + 后端 Groovy hook，像数据库触发器一样挂在 query/action/page/field 上。
- `PluginHost` / `Outbox` 接口：给 3.0 跨系统联动使用。
- `JobRegistry` 接口：给 3.0 定时任务使用。
- `Dialect` / `StorageProvider` / `SearchProvider` 接口：避免强绑定 PG。

### 2.2 2.0 应避免

- 不把“指派审批流”塞进单表 CRUD。
- 不在 ActionService 里写外部系统专用逻辑。
- 不让缓存、搜索、分区策略散落在 QueryEngine 里。
- 不把 Mongo/Redis 适配写成页面特例。
- 不把脚本变成无边界的远程代码执行平台。

### 2.3 复杂 SQL / join 支持边界

第一阶段到 2.0 必须把复杂查询“读”做好，但不能假装所有复杂 SQL 都能自动写。

必须支持：

- `rawSql` / `queryCode` 使用 `SELECT` 或 `WITH ... SELECT`。
- 支持普通 join、聚合、子查询、视图查询的只读表格。
- 平台在外层安全包裹筛选、排序、分页，避免直接拼接到用户 SQL 内部。
- 筛选字段必须来自 queryModel/pageModel 声明的允许字段或别名。
- 执行统计记录 queryCode、dsCode、耗时、行数、错误、调用入口。

明确不承诺：

- 自动识别 join 结果并生成多表 CRUD。
- 自动把复杂 SQL 反解成实体模型。
- 自动改写不同数据库方言的用户 SQL。

写路径规则：

- 单表明确主键：可启用 `singleTableTemplate` CRUD。
- 复杂 join：默认只读。
- 复杂写入：必须走显式 `sqlTransaction` action，由配置作者定义 SQL 仓库资产。

### 2.4 脚本埋点作为减压层

JS/Groovy 的目标不是取代 SQL，而是减少“为了展示、个性化、重复加工而打数据库”的压力。

前端 JS plugin 适合：

- 字段显示格式化。
- 控件行为和本地提示。
- 轻量校验。
- 根据当前页面数据控制 action 可见性。
- 本地化个性化，不回写权威状态。

后端 Groovy hook 适合：

- query/action before/after/onError。
- 参数标准化。
- 批量 enrichment。
- 调用缓存或外部接口。
- 写审计、清缓存、生成 outbox payload。

硬边界：

- 权威库存、金额、状态仍由 SQL transaction 保证。
- Groovy 必须窄接口、可禁用、可审计，后续加沙箱。
- 脚本引用 `scriptCode`，不把大段脚本塞进 Page JSON。

## 3. 3.0：SQL-driven Workflow

当前按钮机制已经具备流程雏形：`Action -> sqlTransaction -> 状态变更 -> openQuery/openPage`。

但真正的流程还缺三类能力：

- **人**：指派、认领、转交、待办。
- **时间**：定时任务、延迟执行、超时处理。
- **外部系统**：HTTP webhook、消息队列、文件/对象存储、第三方 API。

### 3.1 WorkflowModel 草案

```json
{
  "workflowCode": "order_approval",
  "entityCode": "shop_order",
  "stateField": "status",
  "assigneeField": "assignee_user_id",
  "transitions": [
    {
      "code": "submit",
      "from": "draft",
      "to": "pending",
      "actionCode": "act_order_submit",
      "assign": {
        "type": "role",
        "roleCode": "manager"
      }
    },
    {
      "code": "approve",
      "from": "pending",
      "to": "approved",
      "actionCode": "act_order_approve"
    }
  ]
}
```

### 3.2 指派能力

指派不要写死在业务表单里，应作为 workflow/action 的通用扩展：

```json
{
  "assign": {
    "type": "user|role|sql",
    "userId": 12,
    "roleCode": "manager",
    "queryCode": "q_find_next_approver"
  }
}
```

运行时要求：

- 指派结果进入统一待办表或实体字段。
- 权限系统能按 assignee/dataScope 过滤。
- 指派动作必须写审计日志。

### 3.3 定时任务

定时任务不能散落成系统 cron 脚本，应先进入统一 `JobRegistry`。

```json
{
  "jobCode": "stock_low_warning",
  "schedule": "0 */10 * * * *",
  "queryCode": "q_low_stock",
  "actionCode": "act_send_low_stock_warning",
  "enabled": true
}
```

要求：

- job 只引用 query/action，不直接写业务 Java。
- job 执行写 `job_log`。
- job 失败可重试，但必须有幂等键。
- 3.0 可以先单节点；多节点再做锁或 leader election。

### 3.4 跨系统联动

跨系统联动应走 outbox，而不是在事务中直接 HTTP。

```json
{
  "afterAction": {
    "outbox": {
      "topic": "order.approved",
      "payloadQuery": "q_order_approved_event",
      "plugins": ["http_webhook", "message_queue"]
    }
  }
}
```

原则：

- SQL 事务先落本地权威状态。
- outbox 记录事件。
- PluginHost 异步发送外部系统。
- 外部系统失败不回滚主事务，但可补偿/重试。

## 4. 性能与存储低耦合接口

### 4.1 不强依赖 PG 的基本原则

PG 是当前默认实现，不是架构边界。

必须低耦合的部分：

- SQL 方言生成
- 缓存
- 大文本/全文查询
- 分区分表策略
- 索引建议
- 外部 I/O
- 定时任务调度

### 4.2 推荐接口

```text
Dialect
  quote(identifier)
  limitOffset(sql, page, pageSize)
  likeIgnoreCase(field, param)
  upsert(...)
  lock(...)

CacheProvider
  get(key)
  put(key, value, ttl)
  invalidate(tags)

SearchProvider
  search(indexCode, query, filters, page)
  index(document)

PartitionAdvisor
  suggest(entity/query)
  explain(queryCode)

JobScheduler
  register(jobSpec)
  pause(jobCode)
  trigger(jobCode)

PluginHost
  execute(pluginCode, payload)
```

### 4.3 PG / Redis / Mongo 的定位

| 能力 | 默认实现 | 可替换接口 |
|------|----------|------------|
| 平台元数据 | PostgreSQL | 后续可 MySQL 方言 |
| 业务 SQL | JDBC 数据源 | DataSourceRegistry |
| 元数据缓存 | 进程内 | Redis |
| options/query 缓存 | 进程内短 TTL | Redis |
| 大文本查询 | PG trigram/full text 可选 | Mongo / OpenSearch / Elasticsearch |
| 事件外发 | outbox 表 | MQ / HTTP plugin |
| 定时任务 | 单节点 scheduler | Quartz / 外部调度器 |

### 4.4 智能索引与分区分表

智能索引和分区分表不应直接写成 PG 专用能力，而应分两层：

- **Advisor 层**：根据 query_log、慢 SQL、过滤字段、排序字段提出建议。
- **Executor 层**：按当前数据源 dialect 生成具体 SQL 或脚本。

DSL 占位：

```json
{
  "performance": {
    "indexHints": [
      { "fields": ["org_id", "status"], "reason": "common filter" }
    ],
    "partition": {
      "strategy": "time",
      "field": "created_at",
      "grain": "month"
    }
  }
}
```

注意：

- 1.x/2.0 可以只保存建议，不自动执行。
- 自动建索引必须进 change set / approval。
- 分区分表要由 dialect 或外部中间件实现，业务 DSL 只描述意图。

## 5. 大文本查询与混合存储

大文本、日志、商品描述、合同、备注等字段，不要强行都让 PG 承担。

建议抽象：

```json
{
  "field": "description",
  "search": {
    "provider": "defaultTextSearch",
    "indexCode": "product_description",
    "mode": "fulltext"
  }
}
```

运行时：

- 普通结构化列表仍走 QueryEngine。
- 大文本搜索走 SearchProvider。
- SearchProvider 返回主键集合，再回主数据源查结构化字段。
- 这样可以用 PG、Mongo、OpenSearch 等不同实现，不污染 PageModel。

## 6. 版本验收标准

### 1.9 基础版完成

- AI CLI 能幂等创建极小 CRUD SaaS。
- 单表 CRUD、filter、editor、dict、options 稳定。
- 多数据源路由可用。
- 权限和日志可审计。
- 测试环境可一键复现。

### 2.0 完成

- 主从模板可配置。
- openPage 可复用完整 runtime。
- 缓存/权限/日志/数据源/插件接口都接在统一入口上。
- PG 实现不阻碍未来 Redis/Mongo/SearchProvider 接入。

### 3.0 完成

- SQL/action 可以定义状态流转。
- 支持指派、待办、转交。
- 支持定时任务。
- 支持 outbox + plugin 跨系统联动。
- 流程配置仍不需要写业务 Java Domain。

## 7. 架构原则

- PG 是默认实现，不是唯一边界。
- 业务状态权威仍由 SQL transaction 保证。
- 外部 I/O 通过 outbox/plugin 异步化。
- 缓存通过 provider 接入，写路径默认失效。
- 搜索通过 SearchProvider 接入，不把大文本查询绑死在 QueryEngine。
- 索引/分区先做 advisor，再做 dialect executor。
- 3.0 流程基于现有 Action 机制演进，不推倒重来。
