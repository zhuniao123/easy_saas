# 2.0 平台能力规划（缓存 / 脚本埋点 / Tab 性能 / 权限与插件）

> 原则：**业务尽量 DSL + SQL 配置**；静态枚举走**字典**；通用能力进运行时扩展点。
> 2.0 交付主从模板等能力时，下面能力必须「可接上」，但 **1.x 小店 SaaS 不能被它们卡住**。
> 2.0 不做完整流程引擎；3.0 再基于 Action/sqlTransaction 演进 SQL-driven Workflow。

---

## 0. 总原则：少意外、可配置

### 0.1 什么必须配置化（避免「藏在代码里的业务」）

| 类型 | 配置载体 | 禁止 |
|------|----------|------|
| 数据从哪来 | `Query` / SQL 仓库 `queryCode` | 前端拼业务 SQL |
| 页面怎么呈现 | `PageModel` DSL | 为单个客户写死页面组件 |
| 按钮干什么 | `Action`（builtin / openQuery / sqlTransaction / 后续 plugin） | Controller 里写死业务动作 |
| 事务副作用 | `sqlAssetCode` + 事务编排 | Java 里硬编码过账逻辑 |
| 静态选项 | **字典 Dictionary**（见下）或 static options | 到处散落 magic number |
| 下钻/关联 | `openQuery` bind + queryCode | 专用下钻 API |
| 缓存/搜索/任务/插件 | Provider / Registry / PluginHost | 在 QueryEngine 或业务 Service 里写死 Redis/Mongo/HTTP |

### 0.2 字典（Dictionary）— 1.x 就该立规矩，2.0 做完整

**问题：** `status=0/1`、`move_type=IN/OUT` 写在 page JSON 或 SQL 字面量里，难复用、难 i18n、难权限过滤。

**约定（现在配置就按这个长）：**

```json
{
  "field": "status",
  "format": "dict",
  "dictCode": "common.yes_no_status"
}
```

```json
{
  "type": "select",
  "options": { "source": "dict", "dictCode": "shop.move_type" }
}
```

**2.0 表结构草案（先占位，1.x 可继续 static/sql）：**

```text
lc_dict_type   (dict_code, name, ...)
lc_dict_item   (dict_code, value, label, sort, enabled, ext_json)
```

**1.x 不阻塞：** 继续 `static` / `sql` options；新配置**优先写 `dictCode` 字段名**，即使暂时前端映射到 static，2.0 换 provider 即可。

### 0.3 运行时只做「解释器」，不做「小店逻辑」

允许的代码增长：

- 通用：Query 执行、Action 事务、Drawer、缓存接口、权限钩子、插件 SPI  
- 不允许：`ShopSaleService.confirm()` 这类领域类成为默认路径  

Groovy/JS 只做**扩展点**，默认仍 SQL；脚本解决 SQL 不划算的事（见 §2）。

---

## 1. 缓存占位（防 SQL 过热）

### 1.1 目标

- 字典、options、页面元数据、重复只读查询可缓存  
- **可配置 TTL / 失效键**，不是全局瞎缓存导致脏读  

### 1.2 分层（2.0 实现，1.x 预留字段）

| 层级 | 缓存什么 | 失效 |
|------|----------|------|
| L0 进程内 | `PageModel` / `Entity` / `Action` 定义 | 配置更新 version 或 `NOTIFY` |
| L1 进程内 | `dict` / `options` SQL 结果 | TTL + dict_code 失效 |
| L2（可选） | 只读 query 结果（带 params hash） | 短 TTL；写动作后按 tag 失效 |
| L3（更后） | Redis 多实例 | 多节点时再上 |

### 1.3 DSL 占位（现在就可以写进规范，运行时 ignore）

```json
{
  "queryCode": "q_shop_category_options",
  "cache": {
    "enabled": true,
    "ttlSeconds": 300,
    "scope": "global",
    "tags": ["dict", "shop_product"]
  }
}
```

Action 执行成功后：

```json
"invalidateTags": ["shop_product", "shop_stock"]
```

### 1.4 1.x 不成为瓶颈的做法

| 现在就做 / 遵守 | 不要做 |
|-----------------|--------|
| options/dict 查询保持轻量、可缓存形状 | 每个 filter 渲染打全表重查询（已有 preload 方向） |
| 配置读取路径集中（便于以后套 Cache） | 到处 `jdbcTemplate.query` 散落无法拦截 |
| 写路径（CRUD/事务）默认 **不走结果缓存** | 给可写列表乱加长缓存 |
| SQL 仓库资产带稳定 `queryCode` 作 cache key | 匿名 SQL 字符串作 key |

**最小代码占位（2.0 前可只接口）：**

```text
QueryCache { get/put/invalidateByTag }
MetadataCache { page, entity, action, dict }
CacheProvider { get/put/invalidate(tags) }
```

`QueryEngineService.execute` / `options` 入口先 `if (cacheSpec.enabled)` 分支，默认 false。

### 1.5 Provider 边界

默认实现可以是进程内缓存；Redis 只应作为 `CacheProvider` 的一种实现。

禁止：

- 在 PageModel 里写 Redis key。
- 在业务 SQL 里写缓存逻辑。
- 在 ActionService 里直接依赖 Redis 客户端。

---

## 2. JS / Groovy 埋点（减负 SQL，不是替代 SQL）

### 2.1 定位

| 手段 | 适合 | 不适合 |
|------|------|--------|
| SQL / 事务 SQL | 数据正确性、一致性、过账 | 调 HTTP、复杂拼装 UI |
| **前端 JS plugin** | 控件、列展示、轻量校验、打开外链 | 权威库存扣减 |
| **后端 Groovy hook** | 查询前后 enrichment、调外部 API、补字段 | 绕过事务自己写半套账 |

原则：**权威状态仍以 SQL 事务为准**；脚本吃掉「重复读、展示加工、外部 I/O」。

### 2.2 埋点清单（与现有表对齐）

**已有雏形：**

- `lc_query_model.groovy_script_code` + `IGroovyActionInterceptor`（before/after query）  
- `lc_script`（FRONTEND_JS / BACKEND_GROOVY）  
- `ScriptController` 下发前端脚本  

**2.0 补齐埋点（配置声明，不写死页面）：**

```text
Query:
  beforeQuery(params) → params'
  afterQuery(rows) → rows'          // 已有
  afterColumns(columns) → columns'

Action (sqlTransaction):
  beforeAction(ctx) → ctx' | abort
  afterAction(ctx, result)          // 发消息、清缓存 tag
  onError(ctx, error)

Page:
  onLoad(pageDsl)                   // 前端 JS：预取 options
  onRowAction(action, row)          // 前端：确认框文案动态化

Field/Editor:
  format(value, row)                // 前端 JS 装饰，避免 SQL 算展示列
```

### 2.3 DSL 声明示例

```json
{
  "queryCode": "q_shop_products",
  "hooks": {
    "backend": { "groovy": "hook_product_list" },
    "frontend": { "scriptCode": "ui_product_list" }
  },
  "cache": { "enabled": true, "ttlSeconds": 60, "tags": ["shop_product"] }
}
```

```json
{
  "type": "sqlTransaction",
  "actionCode": "shop_post_sale_line",
  "hooks": {
    "after": { "groovy": "hook_after_sale_post", "invalidateTags": ["shop_product", "shop_stock"] }
  }
}
```

### 2.4 1.x 不成为瓶颈

| 现在 | 避免 |
|------|------|
| 展示用装饰器 / 前端 format，别用 SQL 拼 HTML | afterQuery 里 N+1 再打库 |
| 过账逻辑继续 sqlAsset 事务 | 过账全改 Groovy |
| `lc_script` 表继续用，script_code 稳定 | 脚本塞进 page JSON 无法复用 |
| Groovy 保持窄接口 + 以后沙箱 | 给 Groovy 任意 ClassLoader/文件系统 |

**负荷策略：** 热路径 options → 缓存；列表 enrichment → 批量 SQL 一次或 afterQuery 无 DB；外部 HTTP → afterAction 异步（2.0 job）。

---

## 3. Tab 页加载性能：瓶颈与预加载

### 3.1 当前链路（每个 Tab 打开 PageLoader）

```text
1. GET /pages/{pageCode}          // 元数据 + writable
2. GET /entities/{entityCode}     // 字段（可写时）
3. GET /queries/{queryCode}       // Studio 才强依赖
4. POST /queries/.../execute      // 主列表
5. 每个 SQL filter/options        // N 次 options/provide
6. openQuery 时再 execute         // 按需
```

### 3.2 瓶颈点（按影响）

| 优先级 | 瓶颈 | 现象 |
|--------|------|------|
| P0 | **元数据重复拉** | 切 Tab 每次全量 page+entity |
| P0 | **options 扇出** | 4 个 SQL 下拉 = 4 次请求 + 4 次 SQL |
| P1 | **主查询无缓存 / 过大 pageSize** | 慢查询拖死首屏 |
| P1 | **PageLoader 单体过大** | 解析/重渲染成本高 |
| P2 | **未用的 Studio 配置态逻辑** | runtime 仍带配置路径 |
| P2 | **下钻抽屉再拉全套** | 可接受（按需） |

### 3.3 预加载策略（2.0 做满，1.x 可部分）

**A. 会话级元数据缓存（前端）**

```text
sessionCache:
  page:{pageCode} → config
  entity:{entityCode} → fields
  dict:{dictCode} → items
```

切回已开过的 Tab：**只刷新 execute**，不重复打 page/entity（除非 version 变）。

**B. 菜单级预取（idle）**

进入 Shop 分组时：

```text
prefetch: page configs for visible pageCodes
prefetch: dicts used by those pages
不预取：主列表大数据 execute（除非 pin）
```

**C. Options 合并接口（减请求数）**

```http
POST /api/v1/options/batch
{ "requests": [ {queryCode, labelField, valueField}, ... ] }
```

一次 HTTP，服务端并行 + 各自 cache。

**D. Runtime / Config 分包**

- `PageRuntime` 与 `PageStudio` 拆开，runtime Tab 不加载 Monaco/大编辑器（若有）。

**E. 服务端**

- `statement_timeout` 已有方向；列表默认 pageSize≤50  
- 慢 query 进 `lc_query_log` 可观测  

### 3.4 1.x 现在可遵守（零大改）

1. 过滤器 options **能 static/dict 就不要 sql**  
2. 页面 `pageSize` 默认 20，禁止 demo 默认 500  
3. 下钻 SQL 必须带绑定键索引（sku、customer_code…）  
4. 不在首屏挂 10 个 SQL autocomplete  
5. Tab 切换时保留已加载数据（组件 `key` 勿无意义强制整拆，除非 pageCode 变）  

---

## 4. 权限系统与外部系统插件

### 4.1 权限（2.0，但模型现在就要「可挂」）

**对象级（建议）：**

```text
subject: user / role
resource:
  page:{pageCode}
  action:{actionCode}
  query:{queryCode}     // 是否允许 execute
  entity:{entityCode} + field
effect: allow | deny
+ row filter SQL fragment（可选，2.0+）
```

**请求路径挂钩（不改业务 SQL 本体）：**

```text
GET page     → 无权限 403
POST execute → 无 query 权限 403；可注入 tenant_id 强制 param
POST action  → 无 action 权限 403
```

**1.x 占位：**

- API 继续无登录也可跑 demo  
- 配置里**预留** `resourceCode` / `pageCode` 稳定 ID（已有）  
- **禁止**把权限 if 写进各个 Service 方法中心发散；将来一个 `AuthzGateway`  

### 4.2 外部系统插件（I/O 侧车）

与「SQL 事务驱动」对齐：

```text
主路径：SQL 事务（库内一致）
侧车：Plugin 读 outbox / 听 afterAction → HTTP/邮件/OSS
回写：结果表或回调再 SQL
```

**SPI 草案：**

```text
interface IoPlugin {
  String code();
  void execute(PluginContext ctx);  // 入参来自配置 + SQL 查出的 payload
}
```

Action DSL：

```json
{
  "type": "sqlTransaction",
  "statements": [...],
  "afterPlugins": [
    { "plugin": "http_webhook", "config": { "urlEnv": "SHOP_WEBHOOK" }, "payloadQuery": "q_sale_event" }
  ]
}
```

**1.x 占位：**

- `afterAction` / `invalidateTags` 字段可出现在文档  
- **不要**在 1.x 业务过账里直接 `RestTemplate` 调外部  

### 4.3 JobRegistry（给 3.0 定时任务）

定时任务应统一触发 query/action，不应散落成系统 cron 脚本。

```json
{
  "jobCode": "stock_low_warning",
  "schedule": "0 */10 * * * *",
  "queryCode": "q_low_stock",
  "actionCode": "act_send_low_stock_warning",
  "enabled": true
}
```

2.0 只需要预留接口和日志模型；3.0 再产品化任务 UI、重试、幂等和分布式调度。

### 4.4 SearchProvider（大文本 / 混合存储）

大文本搜索不应强绑 PG。PG 可以作为默认实现，但接口要允许 Mongo/OpenSearch/Elasticsearch 等替换。

```text
SearchProvider.search(indexCode, keyword, filters, page) -> primaryKeys
QueryEngine.loadByKeys(queryCode, primaryKeys) -> rows
```

原则：

- 结构化字段继续走 SQL/JDBC。
- 大文本、日志、描述、合同等可走 SearchProvider。
- SearchProvider 返回主键集合，再回主数据源查结构化字段。

### 4.5 Index / Partition Advisor

智能索引、分区分表先做建议层，再做执行层。

```text
PartitionAdvisor.suggest(queryLog, entity, filters)
DialectExecutor.apply(changeSet)
```

2.0 可以只保存建议和展示风险；自动建索引、分区、分表必须进入 change set / approval。

---

## 5. 版本切分：什么时候做什么

| 版本 | 交付 | 明确不做 |
|------|------|----------|
| **1.x 收尾** | DSL/SQL/字典命名约定；options 能 static 则 static；cache/hooks 字段可写进 wiki 与 JSON（可 ignore） | Redis、完整权限、插件市场 |
| **2.0a 主从** | masterDetailTemplate + 复用 action/query | 复杂流程引擎 |
| **2.0b 性能** | 元数据前端缓存、options batch、query cache 接口 | 上全量结果缓存 |
| **2.0c 扩展** | 字典表、JS plugin loader、Groovy 埋点补全 | 任意脚本改核心 |
| **2.0d 安全与集成** | AuthzGateway、租户 param、IoPlugin SPI + outbox | 每个外部系统 hardcode |
| **3.0 Workflow** | 指派、定时任务、outbox 联动、workflow audit | 把流程状态写死成 Java Domain |

---

## 6. 给当前简单 SaaS 的「防瓶颈清单」（立刻生效）

### 配置作者

- [ ] 新枚举用 `dictCode` 命名空间（即便暂用 static 列表）  
- [ ] 热 options 控制数量；禁止无 LIMIT 的 options SQL  
- [ ] 事务过账用 `sqlAssetCode`，一行一责  
- [ ] 下钻 query 必须参数化 + 索引字段  

### 平台开发

- [ ] 新逻辑优先扩展 **Action type / Query hook / Options source**，不新造业务 Controller  
- [ ] 所有执行入口集中：QueryEngine、ActionService、Options（便于 cache/authz）  
- [ ] Page 配置增加可选 `version` 或 `updatedAt` 回传（便于前端缓存失效）  
- [ ] 日志保留 query_log / action_log（性能与审计）  

### 明确技术债（已知，但不挡 1.x）

| 债 | 风险 | 化解版本 |
|----|------|----------|
| PageLoader 过大 | Tab 切换重 | 2.0b 拆 Runtime |
| options N 次请求 | 首屏慢 | 2.0b batch + cache |
| 抽屉非完整 Page | 弹出能力弱 | 2.0 `openPage` |
| 无 Authz | 不能上生产多用户 | 2.0d |
| Groovy 无沙箱 | 安全 | 2.0c |

---

## 7. 架构示意（目标态，不要求 1.x 一次建成）

```text
                    ┌──────────── DSL / SQL 配置（默认 PG）────────┐
                    │ Page Query Action Dict Script Plugin Job     │
                    └───────────────────┬─────────────────────────┘
                                        │
          ┌──────────────┬──────────────┼──────────────┬─────────────┬────────────┐
          ▼              ▼              ▼              ▼             ▼
     MetadataCache  QueryEngine   ActionRuntime   Options/Dict   PluginHost  JobRegistry
          │           │ cache?         │ hooks          │ cache      │          │
          │           ▼                ▼                ▼            ▼          ▼
          │        DataSource      SQL Tx + log      CacheProvider External I/O Scheduler
          │           ▲
          └───────────┴──── AuthzGateway（统一拦）──────────────────
                      │
                 SearchProvider / Dialect / PartitionAdvisor
```

---

## 8. 一句话

- **现在：** 业务继续堆在 **DSL + SQL 仓库 + 字典约定**；运行时只做通用解释。
- **2.0：** 缓存、JS/Groovy 埋点、Tab 预加载、权限、搜索、任务、外部插件 **接在统一入口上**，而不是打补丁进小店代码。
- **3.0：** 基于 Action/sqlTransaction 做 SQL-driven Workflow，补指派、定时任务、outbox 联动。
- **成功标准：** 加一个权限或加一层 options 缓存时，**小店 8 个页面配置一行都不用改业务 Java**。
