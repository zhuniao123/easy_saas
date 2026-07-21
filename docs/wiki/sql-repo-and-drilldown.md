# SQL 仓库 + 关联钻取（1.6.x）

## 目标

1. **SQL 与 DSL 分离**：页面只引用 `queryCode`，SQL 正文在仓库资产中维护与试跑。  
2. **在主副表之前**用 `openQuery` 抽屉实现「类子表」查看（只读关联列表，不是单据头行编辑）。
3. **仓库治理**：页面主查询、关联查询、options SQL、action SQL 都进入仓库，job SQL 作为支线复用仓库资产，便于统计、版本管理和长期优化。

## SQL 仓库

- API 前缀：`/api/v1/sql-repo`
- 底层仍用 `lc_query_model`（薄仓库，避免双写）
- 能力：列表 / 详情 / 保存 / **Try run（仅 SELECT|WITH）**
- UI：应用壳 **SQL Repo** 入口 → `SqlRepoConsole`
- 统计：记录执行次数、平均耗时、慢查询次数、错误次数、最近执行时间
- 版本：SQL 正文、queryModel、pageModel、action config、script config 保存历史版本

### 约定

| 项 | 说明 |
|----|------|
| 资产 ID | `queryCode` |
| 页面引用 | `dataSource.queryCode` / `openQuery.queryCode` / filter options |
| **动作引用** | `lc_action.statements[].sqlAssetCode` → 同一仓库 |
| **任务引用（支线）** | `lc_job.query_code` / `lc_job.action_code` → 同一仓库和动作目录 |
| `query_mode` | `rawSql` / `singleTableTemplate` / **`dml`**（事务语句正文） / `options` |
| 试跑 | 仅 SELECT/WITH；DML 资产不可 try-run，只给 sqlTransaction 执行 |
| 反向引用 | 详情展示 `pageRefs` + `actionRefs` + `jobRefs` + `optionsRefs` |

### 事务 SQL 与查询 SQL 共用仓库

```text
sql_disable_product (dml)  ──sqlAssetCode──►  lc_action.disable_product
q_stock_moves_by_sku (select) ──queryCode──►  openQuery / page
```

改 SQL 只在仓库改一处；动作/页面配置只持有 code。

## 复杂 SQL 支持边界

第一阶段要把“SQL 网页端浏览器”做扎实，因此复杂查询必须能作为只读智能表格展示。

| 场景 | 支持策略 |
|------|----------|
| 单表 SELECT | 可读；主键明确时可写 |
| `WITH ... SELECT` | 可读；外层包裹筛选、排序、分页 |
| 多表 join | 可读；不自动 CRUD |
| 聚合/group by | 可读；不自动 CRUD |
| 视图查询 | 可读；是否可写由显式 action 决定 |
| 多语句 SQL | 查询入口禁止；事务 action 由 sqlTransaction 管理 |

平台生成筛选、排序、分页时，应把用户 SQL 当作子查询：

```sql
select *
from (
  /* user queryCode sql */
) q
where 1 = 1
order by q.created_at desc
limit :limit offset :offset
```

限制：

- 只允许筛选 pageModel/queryModel 声明过的字段或别名。
- 排序字段必须白名单。
- 不承诺自动跨方言改写用户 SQL。
- join 写入只能走显式 `sqlTransaction` action。

## SQL 资产统计与版本

仓库应为后续智能索引、缓存和优化提供数据。

建议记录：

- `queryCode`
- `dataSourceCode`
- `entry`: page/query/options/openQuery/action/job
- `durationMs`
- `rowCount`
- `success`
- `errorCode`
- `createdAt`

版本管理建议：

- SQL 正文每次保存生成版本。
- JSON 配置每次保存生成版本，包括 page/query/entity/action/script/job。
- 版本支持 diff、回滚、标记为发布版本。
- AI CLI apply 必须幂等，并在版本历史里留下来源标记。

## 外挂式定时任务

定时任务不是单独写 cron 脚本，而是引用仓库资产：

```json
{
  "jobCode": "daily_stock_check",
  "schedule": "0 0 2 * * *",
  "queryCode": "q_low_stock",
  "actionCode": "act_create_stock_warning",
  "enabled": true
}
```

定时任务作为支线，不阻塞 1.6-1.9 主线。可先做单节点外挂 scheduler；2.0 接入统一 JobRegistry；3.0 再补任务 UI、重试、幂等键和分布式锁。

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
