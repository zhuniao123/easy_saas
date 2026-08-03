# 上手 Demo：联表 / Script / 动态接口

三个侧栏页，点一遍就懂。

## 安装

```bash
docker exec -i saas-demo-postgres psql -U lowcode -d lowcode \
  < demos/simple_tour/install.sql

TOKEN=$(curl -s -X POST http://127.0.0.1:8081/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"loginName":"owner","password":"owner123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -X POST http://127.0.0.1:8081/api/v1/admin/rbac/refresh-catalog \
  -H "Authorization: Bearer $TOKEN"
```

登录：`owner` / `owner123`，**硬刷新**浏览器。

## 三页对照

| 侧栏 | 你看什么 | 对应能力 |
|------|----------|----------|
| **上手导览** | 步骤清单 | 入口 |
| **我的便签** | 单表 CRUD；**点一行** | **Script 改当前页** + **动态接口** |
| **联表只读** | 分类名来自 JOIN | **联表查询（只读）** |

### ① 联表查询

- 页：`联表只读`（`/demo/simple-join`）
- SQL：`q_tour_join` = `tour_note JOIN tour_category`
- 特点：能筛、能分页；**没有新建/编辑**（联表默认不可写）

### ② Script 改当前页面

- 页：`我的便签`
- 脚本：`ctrl_tour_notes`（Scripts 控制台可改）
- 操作：**点任意行** → toast「点了：xxx」
- 改法：Scripts → `ctrl_tour_notes` → 改 `onEvent` → **Publish** → 刷新页面

### ③ 动态接口

- 端点：`POST /api/v1/dynamic/ep_tour_echo`
- Groovy：`groovy_tour_echo`（把 priority ×2）
- 页面上：点便签行时，Controller 里 `ctx.endpoint.call('ep_tour_echo', …)` 自动调用
- 控制台：Scripts → **端点** Tab → `ep_tour_echo` → Try invoke
- 命令行：

```bash
curl -s -X POST http://127.0.0.1:8081/api/v1/dynamic/ep_tour_echo \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"demo","priority":3}'
# 期望 doubled=6
```

### ④ 页面间跳转

两种方式：

**A. 按钮（page DSL `openPage`）** — 导览/便签/联表页顶部已有：

```json
{
  "code": "go_notes",
  "type": "openPage",
  "label": "打开「我的便签」",
  "scope": "page",
  "openPage": { "pageCode": "simple_tour_notes", "title": "我的便签" }
}
```

**B. Script 里跳转：**

```js
ctx.navigation.openPage('simple_tour_join')
```

**区别：**

| 方式 | 效果 |
|------|------|
| `openPage` | 新开/切换 **整页 Tab**（另一个 pageCode） |
| `openQuery` | 右侧 **抽屉** 钻取（还是当前页） |

## 和 Slice Lab 的关系

仓库里还有更全的 **Slice Lab**（图表 / CTE / Controller Lab）：

| 页 | 路由 |
|----|------|
| 复杂 SQL（JOIN/CTE/UNION） | `/demo/slice-complex-sql` |
| JS Controller Lab | `/demo/slice-controller` |
| 动态 echo | `ep_slice_echo` |

上手建议先用本 Demo 三页，再进 Slice Lab。
