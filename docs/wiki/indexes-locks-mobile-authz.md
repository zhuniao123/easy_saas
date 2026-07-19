# 索引 · 锁 · 移动端/第三方接入 · 权限与 SQL 灵活性

> 补充 [v2-platform-capabilities-plan](./v2-platform-capabilities-plan.md)。  
> 核心矛盾：**SQL 仓库要干净可复用** vs **权限/多端/一致性要硬**。  
> 解法：**业务 SQL 不写死 user/role；运行时注入约束与锁。**

---

## 1. 除了缓存，是不是「只能加索引」？

**不是只能，但索引应是第一优先、性价比最高的手段。**

| 手段 | 何时用 | 成本 |
|------|--------|------|
| **索引** | 过滤、排序、下钻 bind、FK、过账 WHERE | 低，几乎必做 |
| pageSize / timeout | 防一次拉爆 | 已有方向 |
| 缓存 | 字典、options、元数据、极少变只读查询 | 中，防脏读 |
| 读写分离/物化视图 | 报表很重时 | 高，后置 |
| 脚本减负 | 展示加工、外呼 | 中 |

### 1.x / 小店建议立刻有的索引习惯

对 `shop_*` 及同类表：

```text
shop_product (sku) UNIQUE 已有
shop_stock_move (sku, created_at DESC)
shop_sale_line (sale_no), (customer_code, sale_date), (sku, sale_date), (status)  -- 草稿过账
shop_purchase_line (purchase_no), (supplier_code), (sku), (status)
```

**原则：**

- openQuery / filter 里出现的等值字段 → 索引  
- 事务 `WHERE id = :id AND status = 0` → `(id)` 主键足够；批量按单号 → `sale_no`  
- **不要**指望缓存解决「缺索引的全表扫」  

**配置化可选（2.0）：** SQL 仓库资产旁挂 `suggested_indexes` 或迁移脚本目录 `demos/*/indexes.sql`，与业务 demo 一起装。

---

## 2. 手机 App 兼容

### 推荐姿态：**同一套后端 API，多客户端**

```text
Web (PageLoader)  ──┐
Mobile App        ──┼──►  /api/v1/pages|queries|actions|sql-repo(只配置态)
第三方集成        ──┘
```

| 要做 | 不要做 |
|------|--------|
| 稳定、版本化 REST/JSON | App 直连解析 page DSL 当唯一 UI 引擎（早期可，长期别绑死） |
| 鉴权 Header（Bearer/JWT） | 只靠 Cookie 且无 CORS/移动端方案 |
| 列表/动作/字典独立 API | 强制 App 跑完整 React 壳 |
| 错误码、分页约定统一 | Web 专用字段无文档 |

**渐进：**

1. **1.x：** Web 为主；API 已是 JSON → App 可先调 queries/actions 做 POC  
2. **2.0：** 出「Runtime API 契约」文档 + OpenAPI；可选 BFF 聚合  
3. **更后：** 若要「配置驱动原生 UI」，再做 Mobile DSL 子集，而不是 100% 复用 Web PageLoader  

---

## 3. 第三方：挂 API，还是直接用库？

| 接入方式 | 建议 | 原因 |
|----------|------|------|
| **官方 API** | ✅ 默认、唯一对外方式 | 鉴权、审计、限流、版本、锁与权限注入都在这一层 |
| **只读副本 + 受控账号** | ⚠️ 仅内部 BI/数仓 | 无业务动作、无写 |
| **第三方直连业务库** | ❌ 禁止 | 绕过权限/锁/事务编排；schema 一变全炸；无法多租户 |

**例外：** 你们自己的运维、迁移脚本、SQL 仓库管理员 —— 仍是「平台所有者」，不是第三方租户。

第三方若要「像用数据库一样灵活」：提供 **受控 Query 发布**（只开放部分 `queryCode` + 参数白名单），而不是给 connection string。

---

## 4. 锁管理（事务不够时）

事务保证 **ACID 语句组**；锁保证 **并发下业务不双花/双入**。

### 4.1 分层

| 层级 | 机制 | 适用 |
|------|------|------|
| **行锁** | `SELECT … FOR UPDATE` 写在 sqlAsset 里 | 过账前锁住 sale_line / product 行 |
| **业务键锁** | `pg_advisory_xact_lock(hashtext(:sku))` | 同 SKU 并发过账串行 |
| **应用锁表** | `lc_lock(resource, owner, expires_at)` | 长操作、跨请求「编辑锁」（少用） |
| **分布式锁** | Redis 等 | 多实例 + 非 PG 资源；后置 |

### 4.2 与 SQL 仓库的配合（推荐）

**不要**单独搞一套与 SQL 无关的神秘锁服务挡所有请求；优先：

```sql
-- sql_shop_lock_product_for_sale (assert/write 前)
SELECT id FROM shop_product WHERE sku = :sku FOR UPDATE;

-- 或
SELECT pg_advisory_xact_lock(hashtext('product:' || :sku));
```

**Action DSL 可选声明（2.0）：**

```json
{
  "locks": [
    { "type": "advisory", "key": "product:{{row.sku}}" },
    { "type": "row", "sqlAssetCode": "sql_lock_sale_line" }
  ],
  "statements": [ ... ]
}
```

引擎在事务开头执行 locks，失败则整单回滚。  
**1.x：** 过账 SQL 里直接写 `FOR UPDATE` / advisory 即可，无需等锁框架。

### 4.3 原则

- 锁粒度尽量小（行/业务键），时间尽量短（单事务内）  
- 锁顺序全局约定（先单行后商品）防死锁  
- 锁与权限一样：**配置/SQL 声明，引擎保证执行顺序**  

---

## 5. 权限模型建议（经典 + 不污染 SQL 仓库）

### 5.1 经典拆分（同意你的方向）

| 层级 | 负责 | 例子 |
|------|------|------|
| **页面/能力权限（RBAC）** | 菜单、按钮、是否可点「确认出库」 | `page:shop_sales`、`action:shop_post_sale_line` |
| **数据权限（行/列）** | 能看哪些行、哪些字段 | 仅本 org 的销售；成本价列对店员隐藏 |
| **前端** | 按后端下发的 **权限清单** 藏菜单/按钮/列 | **不可**当安全边界 |
| **后端** | 每个 API 强制校验；查询注入数据范围 | **唯一可信** |

经典模型足够起步：

- **RBAC：** User → Role → Permission（page/action/query）  
- **数据范围：** Role/User 绑定 `org_id` / `data_scope`（全部 / 本组织 / 本组织及下级 / 本人）  
- 以后要 ABAC 再在规则引擎加属性，不必推翻  

### 5.2 你担心的点：SQL 里到处写 user/role/org？

**不要这么做。** 那会毁掉 SQL 仓库的复用性，也会让试跑/调试噩梦。

### 5.3 正确做法：业务 SQL 保持「领域纯净」，约束在运行时注入

#### 模式 A — 强制参数（Forced Bind，推荐 2.0 首选）

仓库 SQL：

```sql
SELECT * FROM shop_sale_line
WHERE (:org_id IS NULL OR org_id = :org_id)
  AND sale_date >= :from_date
```

- 作者写业务条件时可用可选 `:org_id`  
- **客户端传来的 org_id 一律丢弃**  
- `AuthzGateway` 根据登录用户写入 `forcedParams.org_id = session.orgId`  
- 没有组织维度的查询：不出现该参数即可  

#### 模式 B — 外层包装（零改历史 SQL）

资产 SQL 保持：

```sql
SELECT id, sale_no, customer_code, amount FROM shop_sale_line WHERE status = 1
```

引擎执行：

```sql
SELECT * FROM (
  /* asset sql */
) AS _q
WHERE (_q.org_id = :_auth_org_id)   -- 由权限配置的 rowFilter 生成
```

要求：结果集或基表能关联到权限列（或 join 映射表）。  
复杂 SQL 用 **模式 A** 更清晰。

#### 模式 C — PostgreSQL RLS（库级兜底，2.0+/强多租户）

```sql
ALTER TABLE shop_sale_line ENABLE ROW LEVEL SECURITY;
CREATE POLICY ... USING (org_id = current_setting('app.org_id')::bigint);
```

连接后：`SET LOCAL app.org_id = '...'`  
**业务 SQL 完全不写权限**；适合强隔离。代价：运维与调试成本高，demo 阶段不必上。

#### 模式 D — 预定义 Query 视图

`q_shop_sales_for_clerk` vs `q_shop_sales_for_owner` 两个 queryCode，权限只控制「能调哪个 code」。  
简单粗暴，角色少时很好；角色一多会膨胀。

### 5.4 前后端分工（推荐时序）

```text
登录 → 后端返回:
  { user, roles, menus[], actions[], pages[],
    dataScope: { type, orgIds[] },
    fieldDenies: { entity_shop_product: ["cost_price"] } }

前端:
  - 菜单/按钮/是否显示「确认出库」看 actions[]
  - 列隐藏看 fieldDenies（体验）

后端每次请求:
  - JWT/Session → user
  - 鉴权 page/action/query
  - forcedParams / rowFilter / RLS 注入
  - 再执行 SQL 仓库资产
```

**前端带的「用户数据」只能当提示（如当前门店切换请求）**；是否允许以服务端会话与权限表为准。  
切门店：调 API `POST /context/switch-org`，服务端改 session，而不是信 body 里的 orgId。

### 5.5 SQL 灵活性如何保留？

| 做法 | 灵活性 |
|------|--------|
| 每个 SQL 手写 `role='admin' OR ...` | ❌ 僵死 |
| 业务 SQL 纯领域 + 强制参数/包装/RLS | ✅ 同一 `q_shop_sales` 所有角色复用 |
| 权限配置在 `lc_permission` / data_scope 规则 | ✅ 改权限不改 SQL |
| 仅少数报表拆 queryCode | ✅ 可接受 |

**结论：** 权限底座很重要，但应做成 **Query/Action 执行管线的一截**，而不是 **SQL 文本规范的一部分**。

---

## 6. 和现有 1.x 的衔接（现在就避免挖坑）

1. **表设计：** 可能多租户/多门店的表预留 `org_id`（可先默认 1），避免 2.0 大迁移  
2. **过账 SQL：** 关键路径加 `FOR UPDATE` 或 advisory（小改 sqlAsset 即可）  
3. **索引：** demo/install 附带 `indexes.sql`  
4. **API：** 保持 `/api/v1/...` 稳定，App/第三方只走 API  
5. **SQL 仓库：** 禁止文档鼓励「在 SQL 里写死 user_id=」  
6. **权限：** pageCode/actionCode/queryCode 三元组当 permission resource（已有命名习惯）  

---

## 7. 建议优先级（务实）

| 顺序 | 项 | 说明 |
|------|-----|------|
| P0 | 索引 + 过账 FOR UPDATE/advisory | 一致性与性能，立刻有感 |
| P0 | 对外只 API、禁止第三方直连库 | 架构红线 |
| P1 | 登录 + RBAC（page/action） | 菜单按钮先控住 |
| P1 | forcedParams / 包装 row filter | 数据权限，SQL 保持干净 |
| P2 | 缓存 / options batch | 负荷 |
| P2 | 锁 DSL 声明化 | 从「写在 SQL 里」升级到可编排 |
| P3 | RLS、移动端专用 DSL、插件市场 | 体量大再上 |

---

## 8. 一句话回答你的几个问号

| 问题 | 建议 |
|------|------|
| 除缓存只能加索引？ | **优先索引**；还有超时、分页、缓存、读写分离，索引是第一刀 |
| 兼容手机 App？ | **同一 API**；Web DSL 不绑死 App UI |
| 第三方挂库？ | **只挂 API**；库仅内部 |
| 事务外还要锁？ | **要**；优先 SQL/`FOR UPDATE`/advisory，再锁管理配置化 |
| 经典权限？ | **要 RBAC + 数据范围**；前端展示、后端强制 |
| SQL 会不会不灵活？ | **会，如果写进每条 SQL**；应 **运行时注入**，仓库 SQL 保持领域纯净 |
