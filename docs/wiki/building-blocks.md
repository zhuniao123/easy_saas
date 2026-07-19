# 积木边界：模板 vs 通用（1.x）

> 完整计划见：[v1.x 商品台账积木化](../superpowers/plans/2026-07-19-v1x-product-ledger-building-blocks.md)

## 一句话

**模板决定页面骨架；积木决定字段、按钮、导入导出与展示；SQL 事务决定业务副作用。**  
主从表是 **2.0**；1.x 目标是「网页版商品台账」可堆积木配置出来。

## 判定法则

| 问题 | 归类 |
|------|------|
| 换模板（将来主从、看板）还需要吗？ | 是 → **通用 Core** |
| 只有单表网格才需要的编译规则？ | 是 → **模板** |
| 字段怎么编辑、按钮干什么、文件怎么进出？ | **通用** |

## 1.x 模板（仅两个）

| 模板 | 承诺 | 不承诺 |
|------|------|--------|
| `rawSqlTemplate` | 自由 SQL → 只读 Smart Grid | 自动 CRUD |
| `singleTableTemplate` | 稳定筛选排序分页 + 主键明确时可写 | join 可写、主从 |

## 1.x 通用积木

- Query 执行器、Writable 判定、单行 CRUD  
- **Action**：builtin / **sqlTransaction** / client  
- Editor Registry、Option/Suggest、Column Decorators  
- **Import / Export（CSV）**  
- Form 弹层、i18n  

## 明确留给 2.0+

- masterDetail 主从表、可配置完整 `openPage` 弹出  
- 字典表落地、Query/Options 缓存、JS/Groovy 埋点补全  
- Tab 元数据预加载 / options batch  
- AuthzGateway、外部 IoPlugin  
- 详见 [v2-platform-capabilities-plan.md](./v2-platform-capabilities-plan.md)  

## 1.x 已可遵守（避免成为瓶颈）

- 业务只进 DSL + SQL 仓库，不进领域 Java  
- 枚举预留 `dictCode` 命名（可先 static 实现）  
- options 能 static 不 sql；列表 pageSize 保守  
- 执行集中在 Query/Action，便于 2.0 套缓存与权限  

## 样板验收

- 单页：商品台账（product_ledger）  
- 多页：小店 SaaS（`demos/shop_saas`，`/shop/*`）
