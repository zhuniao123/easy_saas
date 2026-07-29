# Documentation

文档入口按“先看代码现状、再看边界、最后看规划”组织。

建议阅读顺序：

1. [根 README：当前代码基线](../README.md)
2. [1.5 收官与 1.6～2.0 待办](./wiki/v1.5-to-2.0-summary-and-todos.md)
3. [v1.6 多数据源：已实现/未实现边界](./wiki/v1.6-multi-datasource.md)
4. [可扩展运行时、Dashboard 与 MasterDetail 实施计划](./superpowers/plans/2026-07-29-extensible-runtime-dashboard-master-detail.md)
5. [阶段一验收说明](./wiki/stage-one-acceptance.md)
6. [模型边界](./wiki/model-boundaries.md)
7. [CRUD 设计说明](./wiki/crud-boundaries.md)
8. [Roadmap](./wiki/roadmap.md)
9. [新会话开发提示词](./wiki/new-session-development-prompt.md)
10. [早期需求与架构草案](../requirement.md)

## 文档状态约定

- `README.md`、`docs/wiki/roadmap.md`、`docs/wiki/v1.5-to-2.0-summary-and-todos.md` 描述当前状态。
- `docs/wiki/*-plan.md` 和 `docs/superpowers/plans|specs` 是设计与实施记录，不能单独作为“已经实现”的证据。
- `requirement.md` 是早期方案快照，其中部分里程碑已被当前代码超越。

当前最重要的结论：

- 阶段一的主目标是 `SQL -> 智能表格`
- `PageModel` 和 `EntityModel` 都应是增强层，不应成为第一个必填入口
- CRUD 不是“任意 SQL 自动可写”，而是“识别出稳定主键和实体语义后才启用”
- v1.5 开始，控件、数据源、过滤器、动作和插件都应作为通用 DSL 能力，而不是绑定到单表模板
- 2.0 前先打磨基础版，3.0 再基于 Action/sqlTransaction 演进 SQL-driven Workflow
