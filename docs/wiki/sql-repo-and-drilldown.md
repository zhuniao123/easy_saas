# SQL 仓库 + 关联钻取（1.6.x）

## 目标

1. **SQL 与 DSL 分离**：页面只引用 `queryCode`，SQL 正文在仓库资产中维护与试跑。  
2. **在主副表之前**用 `openQuery` 抽屉实现「类子表」查看（只读关联列表，不是单据头行编辑）。

## SQL 仓库

- API 前缀：`/api/v1/sql-repo`
- 底层仍用 `lc_query_model`（薄仓库，避免双写）
- 能力：列表 / 详情 / 保存 / **Try run（仅 SELECT|WITH）**
- UI：应用壳 **SQL Repo** 入口 → `SqlRepoConsole`

### 约定

| 项 | 说明 |
|----|------|
| 资产 ID | `queryCode` |
| 页面引用 | `dataSource.queryCode` / `openQuery.queryCode` / filter options |
| **动作引用** | `lc_action.statements[].sqlAssetCode` → 同一仓库 |
| `query_mode` | `rawSql` / `singleTableTemplate` / **`dml`**（事务语句正文） |
| 试跑 | 仅 SELECT/WITH；DML 资产不可 try-run，只给 sqlTransaction 执行 |
| 反向引用 | 详情展示 `pageRefs` + `actionRefs` |

### 事务 SQL 与查询 SQL 共用仓库

```text
sql_disable_product (dml)  ──sqlAssetCode──►  lc_action.disable_product
q_stock_moves_by_sku (select) ──queryCode──►  openQuery / page
```

改 SQL 只在仓库改一处；动作/页面配置只持有 code。

## openQuery 钻取

页面 action：

```json
{
  "code": "view_stock_moves",
  "type": "openQuery",
  "label": "流水",
  "scope": "row",
  "openQuery": {
    "queryCode": "q_stock_moves_by_sku",
    "title": "库存流水 · {{row.sku}}",
    "bind": { "sku": { "from": "row", "field": "sku", "required": true } }
  }
}
```

- 运行时打开 `DrillDownDrawer`，调用既有 `/api/v1/queries/{code}/execute`
- **不是** masterDetail；子网格默认只读
- 2.0 主从仍用独立模板；钻取长期用于跨实体关联查看

## Demo

`demos/product_ledger/install.sql`：

- `demo_stock_move` + `q_stock_moves_by_sku`
- 商品行按钮 **流水** → 抽屉

## 非目标

- 文件型 Git SQL 同步  
- 试跑 DML  
- 可写主从同事务  
