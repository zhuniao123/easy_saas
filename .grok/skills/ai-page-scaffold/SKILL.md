---
name: ai-page-scaffold
description: >
  Scaffold simple easy_saas pages from natural language via page-spec JSON and
  the easy-saas CLI (create/configure/apply). Use when the user asks to AI-create
  a page, generate a factory template page, "帮我建个页面", "配置一个台账页",
  /ai-page-scaffold, or when an agent should configure Page/Query/Entity without
  writing Java domain code.
metadata:
  short-description: "AI scaffold easy_saas pages via CLI"
---

# AI Page Scaffold（easy_saas）

通用型 **AI 建简单模板页** 技能：把自然语言 → **page-spec JSON** → **CLI apply** → 平台可运行页面。

## 原则

- **只配元数据 + SQL**，禁止写业务 Java / Controller  
- 优先工厂模板：`crud_grid` | `status_board` | `readonly_sql` | `blank`  
- 通过 CLI 调 HTTP API（owner 权限），不直连改库（除非 CLI 失败再排查）  
- 契约见 [references/page-spec-v0.md](references/page-spec-v0.md)

## 何时触发

- 「用 AI 建一个 XX 台账页」  
- 「生成只读销售日报页」  
- 「给 easy_saas 加一个简单 CRUD 页」  
- `/ai-page-scaffold`

## 前置

- 后端 `8081`、前端可选  
- 账号具备 `perm:config`（默认 `owner` / `owner123`）  
- 仓库根：`/root/saas-demo`（或当前 saas-demo 根）

```bash
export EASY_SAAS_URL="${EASY_SAAS_URL:-http://127.0.0.1:8081}"
export EASY_SAAS_USER="${EASY_SAAS_USER:-owner}"
export EASY_SAAS_PASSWORD="${EASY_SAAS_PASSWORD:-owner123}"
CLI="python3 tools/easy_saas_cli/easy_saas_cli.py"
```

## 工作流（必须按序）

### 1. 澄清（缺省可猜，但写进 spec 备注）

向用户确认或合理默认：

| 项 | 默认 |
|----|------|
| pageCode | 英文蛇形，如 `inv_materials` |
| title | 中文名 |
| routePath | `/{pageCode 中 _ 换 -}` |
| template | 台账→`crud_grid`；状态→`status_board`；报表→`readonly_sql` |
| 字段 | 最少 id + name；有状态加 status |

### 2. 列出模板（可选）

```bash
$CLI templates
```

### 3. 写 page-spec JSON

- 可复制 [templates/example-page-spec.json](templates/example-page-spec.json)  
- 写入临时文件，例如 `/tmp/page-spec-<pageCode>.json`  
- **字段名 / SQL 列名一致**；`dataSource.queryCode` 一般为 `q_<pageCode>`

### 4. Apply

```bash
$CLI apply --spec /tmp/page-spec-<pageCode>.json
```

成功 stdout 含 `pageCode` / `queryCode` / `entityCode`。

### 5. 验证

```bash
$CLI get-page --page-code <pageCode>
$CLI list-pages
```

浏览器：owner 登录 → 侧栏应出现新页；可开「配置」微调。

### 6. 增量修改（CLI 预留）

```bash
$CLI configure-query --query-code q_xxx --sql-file /tmp/q.sql
$CLI configure-page --page-code xxx --config-file /tmp/page.json
$CLI configure-entity --entity-code xxx_entity --fields-file /tmp/fields.json
```

## 从自然语言到 template 的速查

| 用户说法 | template | 后续 |
|----------|----------|------|
| 增删改、台账、主数据 | `crud_grid` | 可选改 label |
| 草稿/已完成、工单状态 | `status_board` | 可加 filter |
| 只读报表、预警、统计 | `readonly_sql` | **必填** 合理 `sqlText` |
| 先占坑再慢慢配 | `blank` | 再 configure |

## 禁止

- 为单个页面新建 Spring Controller / Service 领域类  
- 在 SQL 里写死角色/权限（用 RBAC + 后续 forcedParams）  
- 把密码写进 page-spec  
- 未确认就 `DELETE` 用户已有 page  

## 失败排查

| 现象 | 处理 |
|------|------|
| HTTP 401/403 | 用 owner；检查 token；`refresh-permissions` |
| HTTP 400 create | pageCode 冲突或非法；换 code 或先 list-pages |
| 侧栏没有新页 | 重新登录 / refresh permissions；确认 page 权限 |
| writable=false | rawSql 模板；改 singleTableTemplate + entity |
| SQL 报错 | get-page 看 queryCode，configure-query 修正 |

## 版本预留（未实现，勿假装有）

见项目 wiki `docs/wiki/v1.5-to-2.0-summary-and-todos.md` Track G：

- `dataSourceCode` 真正路由到多库  
- NL→spec LLM 服务化 / 官方 `easy-saas` npm/bin  
- 从现有表 introspect 生成 spec  
- 动作 sqlTransaction 自动脚手架  

当前雏形：**spec + CLI apply + 本 skill 流程** 足够 AI 配简单页。

## 交付给用户时

说明：

1. pageCode / 路由  
2. 使用的 template  
3. 如何打开（登录角色）  
4. 若改了 SQL/列，是否已 apply  
