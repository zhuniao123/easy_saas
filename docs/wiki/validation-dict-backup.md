# 保存校验 · 字典 · 备份与错误日志

## 1. 保存校验（Page / SQL / Action）

入口：

| 资源 | API | 校验内容 |
|------|-----|----------|
| Page | `POST /api/v1/pages/{code}/configure` | JSON、dataSource.queryCode 存在、actions/openQuery/sqlTransaction 引用、filter dict/sql、pageSize |
| SQL | `PUT /api/v1/sql-repo/{code}`、`POST /queries/{code}/configure` | 标识符、无分号、首词 SELECT/WITH/DML、mode |
| Action | `PUT /api/v1/actions/{code}` | label、statements 非空、sqlAssetCode 存在、bind 形态 |

失败统一 `400` + `{ status, code, message }`，并写入 `lc_error_log`。

实现：`ConfigValidationService`。

## 2. 字典最小实现

表：

- `lc_dict_type(dict_code, name, …)`
- `lc_dict_item(dict_code, item_value, item_label, sort_order, enabled)`

API：

- `GET /api/v1/dicts`
- `GET /api/v1/dicts/{dictCode}/items`
- `GET /api/v1/dicts/{dictCode}/options` → `[{label,value}]`

种子：`common.enabled_status`、`common.draft_posted`、`shop.move_type`。

前端 filter：

```json
{
  "field": "status",
  "type": "select",
  "options": { "source": "dict", "dictCode": "common.enabled_status" }
}
```

## 3. 错误日志

- 表：`lc_error_log`
- `GlobalExceptionHandler` 捕获异常落库
- 查询：`GET /api/v1/error-logs?limit=50`

另有既有：`lc_query_log`、`lc_action_log`、`lc_client_log`。

## 4. 备份

```bash
# 备份（默认 /root/saas-demo/backups，保留 14 份）
./scripts/backup_db.sh

# 恢复（需确认 YES）
./scripts/restore_db.sh backups/lowcode_YYYYMMDD_HHMMSS.sql.gz
```

环境变量：`PG_CONTAINER`、`BACKUP_DIR`、`BACKUP_KEEP`。
