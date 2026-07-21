# Documentation

文档入口按“先验收、再架构、后路线”组织。

建议阅读顺序：

1. [阶段一验收说明](./wiki/stage-one-acceptance.md)
2. [模型边界](./wiki/model-boundaries.md)
3. [CRUD 设计说明](./wiki/crud-boundaries.md)
4. [v1.5 模块化 DSL 方案](./wiki/v1.5-modular-dsl-plan.md)
5. [Loading & Logging DSL 规范](./wiki/loading-and-logging-dsl.md)
6. [2.0 前基础版打磨与 3.0 SQL 流程规划](./wiki/v2-foundation-and-v3-workflow-plan.md)
7. [Roadmap](./wiki/roadmap.md)
8. [新会话开发提示词](./wiki/new-session-development-prompt.md)
9. [需求与架构方案](../requirement.md)

当前最重要的结论只有三条：

- 阶段一的主目标是 `SQL -> 智能表格`
- `PageModel` 和 `EntityModel` 都应是增强层，不应成为第一个必填入口
- CRUD 不是“任意 SQL 自动可写”，而是“识别出稳定主键和实体语义后才启用”
- v1.5 开始，控件、数据源、过滤器、动作和插件都应作为通用 DSL 能力，而不是绑定到单表模板
- 2.0 前先打磨基础版，3.0 再基于 Action/sqlTransaction 演进 SQL-driven Workflow
