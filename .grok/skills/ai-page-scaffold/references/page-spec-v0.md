# page-spec v0（AI 建页契约）

AI / 人工写一份 JSON，CLI `apply` 一键落到 easy_saas。

## 最小字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `pageCode` | 是 | `[a-zA-Z][a-zA-Z0-9_]*` |
| `title` | 建议 | 显示标题 |
| `routePath` | 建议 | 如 `/demo/items` |
| `template` | 否 | `crud_grid` \| `status_board` \| `readonly_sql` \| `blank` |

## 可选覆盖（create 之后）

| 字段 | 说明 |
|------|------|
| `sqlText` | 覆盖默认 query SQL |
| `queryMode` | `rawSql` \| `singleTableTemplate` |
| `entityFields` | entity fields 数组 |
| `primaryKey` | 默认 `id` |
| `pageConfig` | 完整 Page DSL（columns/filters/actions/features） |
| `dataSourceCode` | 预留 1.6+；当前可写但引擎未必路由 |

## 模板选择指引

| 用户意图 | template |
|----------|----------|
| 可增删改的台账 | `crud_grid` |
| 带状态筛选的工单/草稿 | `status_board` |
| 报表/预警只读 | `readonly_sql`（再改 sqlText） |
| 完全自定义 | `blank` 再填 sql + pageConfig |

## 约束（AI 必须遵守）

1. **不写业务 Java**；只配置元数据 + SQL  
2. rawSql 页不要指望可写 CRUD（writable=false）  
3. singleTableTemplate 的 SQL 应对单一实体表、含主键列  
4. pageConfig.table.actions 里 sqlTransaction 需仓库里已有 action  
5. 创建后若侧栏不可见：owner 刷新权限 / 重新登录  

## CLI

```bash
export EASY_SAAS_URL=http://127.0.0.1:8081
export EASY_SAAS_USER=owner
export EASY_SAAS_PASSWORD=owner123

python3 tools/easy_saas_cli/easy_saas_cli.py apply \
  --spec .grok/skills/ai-page-scaffold/templates/example-page-spec.json
```
