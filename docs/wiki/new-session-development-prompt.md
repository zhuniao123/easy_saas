# 新会话开发提示词

下面提示词用于新开会话继续做计划和逐步开发。

```text
你是 Codex，请在 /root/easy_saas 仓库继续开发 easy_saas。

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
1. v1.5 要把 DSL、控件、数据源、过滤器、动作、插件做成独立公共模块。
2. 当前单表页面只是众多模板中的第一个模板，不要把 runtime 绑定死在 singleTableTemplate 上。
3. SQL 仍是第一入口：rawSql 默认只读，singleTableTemplate 支持稳定筛选、排序、分页和受控 CRUD。
4. 编辑和删除必须依赖主键：只有 anchorEntity、primaryKey、结果集中包含主键、写回目标明确时才启用。
5. 控件能力要独立于模板：text、select、autocomplete、date、datetime、number 都应通过 editor registry 复用。
6. 下拉和自动补全数据源要支持 static/sql，后续预留 decorator、cache、preload。
7. 过滤器不要靠前端拼 SQL 字符串，要由后端基于 QueryModel/PageModel/FilterModel 安全生成。
8. JS 扩展在 v1.5 只作为前端 plugin 加载，用于自定义控件、字段行为和 action，不要提前做流程引擎。
9. Groovy 和流程管理放到后续版本，只保留设计空间。

建议开发顺序：
1. 做一次代码结构 review，找出现有 PageLoader、QueryEngineService、PageService 中和 DSL/runtime/template 混在一起的部分。
2. 先提交一份小步重构计划，不要直接大改。
3. 第一批实现 rawSql/singleTableTemplate 的 mode 区分和单表模板查询生成。
4. 第二批修复过滤器，让排序、分页、筛选统一由后端执行。
5. 第三批补主键校验后的 edit/delete。
6. 第四批抽 editor registry 和 options/suggest provider。
7. 每一步都跑 frontend lint/build/test 和 backend test-compile 或相关测试。

约束：
- 不要提交 backend/target 或前端构建产物。
- 不要破坏现有演示站的配置态/运行态分离。
- 不要把任意 SQL 承诺成可写 CRUD。
- 不要把控件、数据源、插件能力写死到 singleTableTemplate。
- 保持文档和实现同步。
```
