# SQL 事务动作配置（Phase C / 1.6）

> 通用积木，**不绑模板**。主从 2.0 的「确认过账」应复用同一执行器。

## 配置原则（为什么这样设计）

| 原则 | 做法 | 反例（禁止） |
|------|------|----------------|
| SQL 不进浏览器请求体 | 请求只带 `actionCode` + `pageCode` + row/form 上下文 | 前端 POST 任意 SQL |
| 一条配置 = 一条语句 | `statements[]` 每项一条 SQL，后端数组顺序执行 | 一个字符串里拼 `;` 多语句 |
| 只接受命名参数 | `:id`、`:qty`；禁止字符串拼接用户输入 | `'...' + userInput` |
| 参数来源显式声明 | `bind` 声明 from=row/fixed/form/request | 隐式把整行所有列丢进 SQL |
| fixed 优先 | `fixed` / bind fixed 不可被 row 覆盖 | 用户改 row.status 绕过停用值 |
| 可复用 + 可审计 | 优先 `lc_action` 目录表 | 只把 SQL 散落在 page JSON 且无法审计 |

## 两层存储（推荐混合）

### 1. 动作目录 `lc_action`（执行真源，推荐）

可跨页复用；运维/审计看这一张表就知道「系统允许跑哪些 SQL」。

### 2. 页面只做 UI 绑定

Page `table.actions[]` 负责：按钮文案、scope、confirm、when、variant，并用 `actionCode`（默认等于 `code`）指向目录。

### 3. 嵌入式回落（可选，便于堆积木 demo）

若 `lc_action` 无记录，则允许从 **库内** `lc_page_model.config_json` 读取同名 action 的 `sqlTransaction` 块执行。  
仍禁止客户端上传 SQL 正文。

**解析顺序：**

1. `lc_action` where `action_code = :actionCode` and enabled  
2. else page config action with matching `code` / `actionCode` and `type=sqlTransaction`  
3. else 404

## `lc_action.config_json` 形态（推荐：语句引用 SQL 仓库）

```json
{
  "type": "sqlTransaction",
  "timeoutSeconds": 10,
  "refresh": true,
  "successMessage": "已停用",
  "bind": {
    "id": { "from": "row", "field": "id", "required": true },
    "status": { "from": "fixed", "value": 0 }
  },
  "statements": [
    {
      "name": "disable",
      "kind": "write",
      "sqlAssetCode": "sql_disable_product"
    }
  ]
}
```

SQL 正文在仓库资产 `sql_disable_product`（`lc_query_model`，`query_mode=dml`）中维护，可在 **SQL Repo** UI 编辑。

### statements

| 字段 | 说明 |
|------|------|
| **`sqlAssetCode`**（推荐） | 引用 SQL 仓库 `queryCode`；执行时服务端加载 `sql_text` |
| `sql` | 遗留：内联单条 SQL（兼容旧配置；新配置优先 asset） |
| `kind` | `write`（默认）或 `assert` |
| `name` | 可选，日志用 |

解析优先级：`sqlAssetCode` / `sql_asset_code` → 否则 `sql`。

- **write**：允许以 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 开头。  
- **assert**：必须是 `SELECT`；结果集至少 1 行，且若存在 `ok` 列则须为真；失败则整事务 rollback。

### bind

| from | 含义 |
|------|------|
| `row` | 当前行字段（行级按钮） |
| `form` | 将来动作表单（C 先预留） |
| `fixed` | 配置常量 |
| `request` | 客户端 `params` 显式传入的补充参数（白名单：仅 bind 声明了 from=request 的键） |

未在 `bind` 中声明的命名参数：若 SQL 用到了会报错（**缺参失败**，不静默 null，除非 `required: false`）。

### 安全校验清单（执行前）

1. 每条 statement 不含 `;`（除字符串字面量外——Phase C 简单策略：**整段禁止分号**）  
2. 禁止多语句；禁止 `COPY`/`ALTER`/`DROP`/`CREATE`/`TRUNCATE`/`GRANT`/`CALL`（CALL 可后开）  
3. write 必须以 INSERT/UPDATE/DELETE/SELECT 开头  
4. assert 必须以 SELECT 开头  
5. 参数名仅 `[a-zA-Z_][a-zA-Z0-9_]*`  
6. `statement_timeout` 按动作配置设置  

## 页面绑定示例

```json
{
  "code": "disable_product",
  "label": "停用",
  "type": "sqlTransaction",
  "actionCode": "disable_product",
  "scope": "row",
  "variant": "danger",
  "confirmText": "确认停用该商品？",
  "when": { "field": "status", "notEquals": 0 }
}
```

嵌入式（无 lc_action 时）：

```json
{
  "code": "qty_plus_one",
  "label": "库存+1",
  "type": "sqlTransaction",
  "scope": "row",
  "confirmText": "演示用简易调整，不是进销存过账",
  "sqlTransaction": {
    "refresh": true,
    "successMessage": "库存已 +1",
    "bind": {
      "id": { "from": "row", "field": "id", "required": true }
    },
    "statements": [
      {
        "kind": "write",
        "sql": "UPDATE demo_product SET qty_on_hand = qty_on_hand + 1, updated_at = NOW() WHERE id = :id"
      }
    ]
  }
}
```

## API

```http
POST /api/v1/actions/{actionCode}/execute
Content-Type: application/json

{
  "pageCode": "product_ledger",
  "row": { "id": 1, "sku": "A01", "status": 1 },
  "form": {},
  "params": {}
}
```

响应：

```json
{
  "status": "success",
  "message": "已停用",
  "refresh": true,
  "rowsAffected": [1]
}
```

## 与 raw SQL 控制台的边界

| | Raw SQL Studio | sqlTransaction Action |
|--|----------------|------------------------|
| 用途 | 开发调试 | 业务按钮 |
| 谁写 SQL | 开发者临时输入 | 元数据预置 |
| 生产是否依赖 | 否 | 是 |
| 事务/审计 | 弱 | 强（lc_action_log） |

## 非目标（Phase C）

- 前端任意 SQL  
- 流程引擎 / 条件分支 DSL  
- 主从过账 UI（2.0 复用本执行器即可）  
- 异步 Job  
