# 上手导览 Demo（最简）

**目标：5 分钟搞懂「SQL → 页面 → 筛选 → 可写 → 点一下脚本」**，先别管多库 / Groovy / Ops。

## 安装（一次）

```bash
cd /root/saas-demo   # 或你的仓库路径
docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/simple_tour/install.sql
```

后端已跑时，刷新权限（owner）：

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8081/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"loginName":"owner","password":"owner123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -X POST http://127.0.0.1:8081/api/v1/admin/rbac/refresh-catalog \
  -H "Authorization: Bearer $TOKEN"
```

浏览器：**硬刷新**，用 `owner` / `owner123` 登录。

## 你怎么点

| 步骤 | 点哪里 | 你会看到 |
|------|--------|----------|
| 1 | 侧栏 **上手导览** | 一张步骤表（本 README 的网页版） |
| 2 | 侧栏 **我的便签** | 真实表 `tour_note` 的数据 |
| 3 | 标题筛「学会」→ 应用筛选 | 只剩标题含「学会」的行 |
| 4 | 状态选「进行中」 | 字典下拉 + `eq` 过滤 |
| 5 | **新建** 一条便签 | 单表 CRUD（不是写 Java） |
| 6 | **点某一行** | toast：「你点了：xxx」（JS Controller） |
| 7 | 看「状态」列 | 显示中文（`format=dict`） |

## 这背后只有 4 块积木

```text
表 tour_note          ← 业务数据（普通 PG 表）
lc_query_model        ← SQL：数据从哪来（queryCode）
lc_page_model         ← 页面：列/筛选/能不能写（pageCode）
lc_script             ← 可选：点行时的 JS（controller.scriptCode）
```

**不需要改前端工程、不需要写 Java Domain。**

## 对应元数据

| 东西 | code |
|------|------|
| 导览页 | `simple_tour_guide` → `/demo/simple-tour` |
| 便签页 | `simple_tour_notes` → `/demo/simple-notes` |
| 查询 | `q_tour_notes` |
| 实体 | `entity_tour_note` |
| 脚本 | `ctrl_tour_notes`（Scripts 控制台可打开改） |
| 字典 | `tour.note_status` |

## 学完再碰这些（可选）

| 想了解 | 去哪 |
|--------|------|
| 改 SQL | SQL Repo → `q_tour_notes` |
| 改 JS | Scripts → `ctrl_tour_notes` → Save → Publish |
| 权限差 | 退出，用 `clerk` / `clerk123` 登录（仍能看导览/便签） |
| 复杂店务 | Showcase / 小店 demo（别一上来就啃） |

## 卸载

```sql
DELETE FROM lc_page_model WHERE page_code LIKE 'simple_tour%';
DELETE FROM lc_query_model WHERE query_code LIKE 'q_tour%';
DELETE FROM lc_entity_model WHERE entity_code = 'entity_tour_note';
DELETE FROM lc_script WHERE script_code = 'ctrl_tour_notes';
DROP TABLE IF EXISTS tour_note;
```
