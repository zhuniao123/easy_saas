# Roadmap

## 阶段一

主题：`SQL-first Smart Grid`

### 已完成方向

- 配置态 / 运行态分离
- SQL 保存后自动生成默认配置草案
- 基础 JSON / SQL 校验链路
- 预览表格从主视图降级为配置态可切换 preview
- 保留 raw SQL 入口

### 待收尾

- 明确 CRUD 启用条件
- 完善文档和验收口径
- 提升编辑器体验
- 收敛 EntityModel 定位

## v1.5

主题：`Modular DSL + Single Table Writable Template`

### 目标

- 独立 `DataSourceModel`
- 区分 `rawSql` 与 `singleTableTemplate`
- 单表模板支持稳定筛选、排序、分页
- 单表模板在主键明确时支持 edit/delete
- 控件、下拉、自动补全、时间选择作为通用 DSL 模块
- DSL 支持前端 JS plugin 路径，用于自定义控件和 action

### 不做

- join 查询可写
- 完整主子表详情结构
- Groovy 流程控制
- 通用流程引擎

## 阶段二

主题：`Entity-aware Page Runtime`

### 目标

- 更强的实体语义模型
- 主从/层级页面结构
- 详情页替代单纯弹窗
- 更清晰的可写/只读模式

## 阶段三

主题：`SQL-driven SaaS Platform`

### 目标

- 更稳定的 DSL
- 多页面编排
- 可复用动作系统
- 更成熟的部署与权限控制
