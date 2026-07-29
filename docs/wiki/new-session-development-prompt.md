# 新会话开发提示词

下面提示词用于新开会话继续做计划和逐步开发。

```text
你是 Codex，请先定位当前 easy_saas 仓库根目录，再继续开发。

项目定位：
easy_saas 是一个 SQL-first、配置驱动、以前端运行时为核心的 SaaS 原型。当前阶段目标不是完整低代码平台，而是先把 “SQL -> 智能表格 -> DSL 增强 -> 单表可控 CRUD” 做扎实。

请先阅读这些文档并按它们执行：
- README.md
- docs/README.md
- docs/wiki/README.md
- docs/wiki/stage-one-acceptance.md
- docs/wiki/model-boundaries.md
- docs/wiki/crud-boundaries.md
- docs/wiki/v1.5-modular-dsl-plan.md
- docs/wiki/dev-wiki.md
- docs/wiki/roadmap.md

核心方向：
1. 当前基线是 1.5 可演示收官；DSL、控件、过滤器和动作已有公共模块，继续避免能力回流到单一模板。
2. 当前单表页面只是众多模板中的第一个模板，不要把 runtime 绑定死在 singleTableTemplate 上。
3. SQL 仍是第一入口：rawSql 默认只读，singleTableTemplate 支持稳定筛选、排序、分页和受控 CRUD。
4. 编辑和删除必须依赖主键：只有 anchorEntity、primaryKey、结果集中包含主键、写回目标明确时才启用。
5. 控件能力要独立于模板：text、select、autocomplete、date、datetime、number 都应通过 editor registry 复用。
6. 下拉和自动补全数据源要支持 static/sql，后续预留 decorator、cache、preload。
7. 过滤器不要靠前端拼 SQL 字符串，要由后端基于 QueryModel/PageModel/FilterModel 安全生成。
8. JS 前端扩展和 Groovy 后端 hook 已有实现；继续保持受控加载，不要把它们演化成无约束流程引擎。
9. 多数据源目录、加密存储和管理台已经实现，但 Query/Action/CRUD 的运行时路由尚未实现。

建议开发顺序：
1. 先阅读 `v1.5-to-2.0-summary-and-todos.md` 与 `v1.6-multi-datasource.md`，确认本次切片。
2. 做代码结构 review，定位 QueryEngineService、ActionService、PageService 的数据源执行入口。
3. 优先完成 PostgreSQL 业务库的 DataSourceRegistry、resolveDs、安全校验和连接池生命周期。
4. 明确禁止单个 Action 跨数据源事务，元数据读写始终走平台库。
5. 每一步都跑 frontend lint/build/test 和 backend tests。

约束：
- 不要提交 backend/target 或前端构建产物。
- 不要破坏现有演示站的配置态/运行态分离。
- 不要把任意 SQL 承诺成可写 CRUD。
- 不要把控件、数据源、插件能力写死到 singleTableTemplate。
- 保持文档和实现同步。
```
