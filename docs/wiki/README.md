# easy_saas Wiki

## 阅读顺序

- [阶段一验收说明](./stage-one-acceptance.md)
- [模型边界](./model-boundaries.md)
- [CRUD 设计说明](./crud-boundaries.md)
- [积木边界：模板 vs 通用（1.x）](./building-blocks.md)
- [并行 Agent 分工](./AGENT_COORDINATION.md)
- [SQL 事务动作配置（Phase C）](./sql-transaction-actions.md)
- [v1.5 模块化 DSL 方案](./v1.5-modular-dsl-plan.md)
- [v1.x 商品台账积木化计划](../superpowers/plans/2026-07-19-v1x-product-ledger-building-blocks.md)
- [后续开发 Wiki](./dev-wiki.md)
- [Roadmap](./roadmap.md)
- [新会话开发提示词](./new-session-development-prompt.md)

## 项目定位

`easy_saas` 当前应被描述为：

`一个 SQL-first、配置驱动、以前端运行时为核心的 SaaS 原型`

第一阶段主目标：

`只配 SQL -> 先出智能表格 -> 再补 PageModel 和 EntityModel`

## 当前统一口径

### 1. SQL 是唯一第一入口

- 阶段一最小可用路径必须是“只写 SQL 就能出表格”
- 表格必须先具备分页、排序、筛选
- 配置模型是增强层，不应成为第一道门槛

### 2. PageModel 是页面增强层

- 负责列标题、列顺序、过滤器、动作、布局、多语言覆盖
- 不负责实体语义

### 3. EntityModel 是实体语义层

- 负责主键、label、只读、审计、字典、引用关系
- 不应退化成另一份列标题配置

### 4. CRUD 需要稳定主键

- 任意 SQL 可以查询
- 只有稳定单实体、稳定主键、稳定写回路径成立时才可写

这条规则应作为阶段一的正式边界，而不是实现细节。

### 5. 控件和数据源是通用 DSL

- 当前单表模板只是第一个模板
- 数据源、控件、过滤器、动作和插件必须独立于模板
- 后续新增主子表、join 只读、流程页时，应复用同一套 DSL 内核

## 文档更新原则

以后每次涉及以下变化，都应同步更新 wiki：

- 模型结构变化
- CRUD 启用规则变化
- DSL 结构变化
- 模板编译规则变化
- 配置态布局变化
- 阶段目标变化
- 对外演示口径变化

## 变更记录模板

后续可直接按下面格式追加：

```md
## YYYY-MM-DD 更新

### 完成

- TBD

### 影响

- TBD

### 风险 / 待补齐

- TBD
```

## 一句话总结

easy_saas 不是“页面拼装器优先”的低代码系统，而是一个以 SQL 为入口、以模型增强为骨架、以前端运行时为主战场的配置驱动 SaaS 原型。
