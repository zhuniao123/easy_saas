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

### 待收尾（并入 1.x Phase A）

- 明确 CRUD 启用条件（默认只读）
- 收敛 EntityModel 定位
- 提升编辑器体验

## v1.x（当前主线）

主题：`积木化单表工作台 + 商品台账样板`

详细计划：[v1x-product-ledger-building-blocks](../superpowers/plans/2026-07-19-v1x-product-ledger-building-blocks.md)  
边界说明：[building-blocks.md](./building-blocks.md)

| 子阶段 | 主题 | 要点 |
|--------|------|------|
| **1.5 Core** | 模板/通用拆分 + 单表可写硬化 | `rawSql` / `singleTableTemplate`；writable 门禁；editor/decorator 地基 |
| **1.6 Actions** | 可配置 SQL 事务按钮 | 行/页动作、参数化、事务、审计日志 |
| **1.7 IO** | 通用导入导出 | CSV 进出，独立于模板 |
| **1.x Demo** | 商品台账 | 纯配置堆积木验收 |

### 1.x 做

- 网页版商品台账：增删改查
- 通用 Action（含 sqlTransaction）
- CSV 导入导出
- 实用控件与列装饰器
- 控件/动作/IO **不写死在模板里**

### 1.x 不做

- 主从表 / 单据头行（→ 2.0）
- join 查询可写
- 通用流程引擎 / Groovy 业务编排
- 完整权限与多租户

## 阶段二 / 2.0

主题：`masterDetailTemplate`（owtb 最常见模型）

### 目标

- 主从/层级页面结构
- 详情页替代单纯弹窗
- 采购/销售类单据 UI
- **复用 1.x 的 sqlTransaction、Editor、Decorator、IO**

## 阶段三

主题：`SQL-driven SaaS Platform`

### 目标

- 更稳定的 DSL
- 多页面编排与模板市场
- 权限、部署、插件 I/O 侧车成熟化
