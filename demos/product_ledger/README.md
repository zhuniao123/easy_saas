# 商品台账 Demo（Phase B）

用 **SQL + 元数据** 堆积木配置的单表商品台账，不写业务 Java。

## 安装

```bash
# 需已有 lowcode 库与 lc_* 元表（应用启动 schema.sql 即可）
psql -h 127.0.0.1 -U lowcode -d lowcode -f demos/product_ledger/install.sql
```

默认密码见 `backend/src/main/resources/application.properties`。

## 验收

1. 打开前端，页面列表出现 **商品台账 Product Ledger**（route: `/inventory/products`）。
2. 运行态可：筛选、排序、分页、新增/编辑/删除。
3. 进价/售价以 **money** 展示；库存低于安全库存为 **danger** 色。
4. `GET /api/v1/pages/product_ledger` 返回 `"writable": true`。
5. 分类下拉来自 SQL options query。

## 积木对照

| 能力 | 配置位置 |
|------|----------|
| 单表可写 | `query_mode=singleTableTemplate` + entity PK |
| CRUD 按钮 | `features.create/edit/delete: true` + server `writable` |
| 金额/色条 | `table.columns[].format` / `toneRules` |
| 筛选下拉 | `filters[].options.source=sql\|static` |

## 非目标

- 主从采购/销售单 → 2.0  
- SQL 事务按钮 / CSV 导入 → Phase C/D  
