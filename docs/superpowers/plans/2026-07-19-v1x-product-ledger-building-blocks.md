# v1.x 商品台账积木化 Implementation Plan

> **For agentic workers:** 本计划是产品边界 + 分阶段实施蓝图。落地某一阶段时，再拆成细粒度 task plan（TDD 逐步提交）。  
> 主从表（masterDetail）明确为 **2.0**，本计划不包含。

**Goal:** 在现有 1.0 Smart Grid 上，把平台做成可「堆积木」的单表业务工作台：用配置拼出网页版商品台账（增删改查），并补齐**独立于模板**的通用能力——可配置 SQL 事务按钮、导入导出、实用控件与装饰器。

**Architecture:** 运行时只认 **Core DSL**（数据源、字段、控件、过滤器、动作、装饰器）；`singleTableTemplate` / `rawSqlTemplate` 只是把配置编译成同一套 Runtime Contract 的两种入口。SQL 事务动作、导入导出、控件注册表与模板解耦，主从表留给 2.0。

**Tech Stack:** 现有栈不变——Java 17 / Spring Boot JDBC / PostgreSQL 17；React 19 / TypeScript / Vite / Tailwind。优先配置与 SQL，少写领域 Java。

**验收样板应用:** `商品台账`（product ledger）——仅用 1.x 积木配置出来，不写定制业务后端。

---

## Global Constraints

1. **主从表 / 单据头行 = 2.0**，1.x 禁止实现 masterDetail 运行时。
2. **任意 raw SQL 默认只读**；可写仅限「稳定单实体 + 主键」或「显式 SQL 事务动作」。
3. **通用能力不得写死在 singleTableTemplate**；模板只编译，不实现控件/动作/导入导出。
4. **数据与配置权威源 = PostgreSQL**；动作、脚本、元模型均入库。
5. **SQL 事务动作必须参数化**；禁止字符串拼接用户输入进 SQL。
6. **不引入流程引擎、Groovy 编排、权限中心**（可预留钩子字段）。
7. 文档与实现同步：改边界必须改 `docs/wiki/*`。
8. 不提交 `backend/target`、前端 `dist`/`node_modules`。

---

## 0. 版本叙事（给自己和客户怎么讲）

| 版本 | 一句话 | 客户能得到什么 |
|------|--------|----------------|
| **1.0（现状）** | SQL → 智能表格 + 配置增强 | 查、部分改、Studio |
| **1.5 Core** | 积木底座：模板/通用拆开 | 单表模板稳定 CRUD + 控件体系 |
| **1.6 Actions** | 按钮可跑 SQL 事务 | 台账旁挂「批量改状态/调库存字段」等 |
| **1.7 IO** | 导入导出等横向能力 | 商品 Excel 进出 |
| **1.x Demo** | 配置出商品台账 | 堆积木验收，不写主从 |
| **2.0** | 主从单据模板 | 采购/销售单（你熟悉的 owtb 模型） |

说明：编号可合并交付（例如 1.5 一次做完 Core+Actions 的最小集），但**设计边界按层切开**，避免又糊成巨型 PageLoader。

---

## 1. 模板相关 vs 通用积木（核心界定）

### 1.1 判定法则

| 问题 | 归类 |
|------|------|
| 换一个模板（将来主从、看板）还需要吗？ | **是 → 通用 Core** |
| 只有「单表网格页」才需要的编译规则？ | **是 → 模板** |
| 是「某种页面骨架如何生成查询/表单」？ | **模板** |
| 是「字段怎么编辑、按钮干什么、文件怎么进出台」？ | **通用** |

### 1.2 模板相关（Template Layer）— 1.x 只做两个

| 模板 | 职责 | 承诺 | 不承诺 |
|------|------|------|--------|
| **`rawSqlTemplate`** | 用户 SQL 为唯一查询体；外层包过滤/排序/分页 | 只读 Smart Grid | 自动 CRUD、自动写回 |
| **`singleTableTemplate`** | 由 table/主键/列/baseWhere **编译**出稳定 SQL | 筛选排序分页 + 受控单表 CRUD | join 可写、主从、跨表自动写 |

模板**只负责**：

- 从模板配置 → 编译出 Runtime 需要的：`queryExecutable`、`writableProfile`、默认 columns/filters
- 单表可写时的默认 insert/update/delete 目标（表名、主键、可写列）

模板**不负责**：

- 控件渲染实现
- 导入导出协议
- SQL 事务动作执行器
- 装饰器（金额、状态色）实现
- 多页面菜单编排

### 1.3 通用积木（Core DSL + Runtime）— 跨模板复用

| 积木 | 说明 | 1.x 是否做 |
|------|------|------------|
| **Query 执行器** | 参数化执行、分页排序过滤外壳、query log | 强化现有 |
| **Writable 判定** | anchor + PK + 结果含 PK + 非聚合 | 硬化 |
| **单行 CRUD API** | 基于 Entity 写回（供单表模板与表单用） | 硬化 |
| **Action 系统** | 页面/行按钮：builtin + sqlTx + 前端 handler | **新增重点** |
| **SQL 事务动作** | 多语句同一事务、绑定行/表单/固定参数 | **新增重点** |
| **Editor Registry** | text/number/select/autocomplete/date/datetime/textarea/boolean | 补齐 |
| **Option / Suggest Provider** | static \| sql（预留 decorator provider） | 强化 |
| **Column Decorators** | money、percent、badge/dict、datetime、link、boolean 图标 | 新增 |
| **Import / Export** | CSV（先）、列映射、校验报告 | 新增 |
| **Form 弹层/抽屉** | 创建编辑表单（单实体） | 强化现有 |
| **i18n / 空态 / 密度** | 展示横切 | 保持 |
| **前端 Plugin（窄 API）** | 注册 editor/action（可选） | 1.5 末可选 |
| **DataSource 引用** | 结构预留，默认连主库 | 预留字段即可 |

### 1.4 明确不在 1.x 的（归 2.0 / 更后）

| 能力 | 归属 |
|------|------|
| 主从表、单据头行、行编辑器内嵌子表 | **2.0 masterDetailTemplate** |
| 确认入库出库跨多实体编排 UI | 2.0 + SQL 事务可部分复用 1.x Action |
| 流程引擎、状态机编排器 | 更后 |
| Groovy 业务流程控制 | 更后（查询钩子可保留但不扩展） |
| join 结果可写 | 不做 |
| 完整权限/多租户 | 更后 |
| Excel 复杂模板、异步大文件 Job | 1.x 只做同步小文件 CSV；大文件 2.x+ |

### 1.5 一张图：堆积木关系

```text
┌─────────────────────────────────────────────────────────┐
│  Page (菜单上的一页)                                      │
│  template: rawSql | singleTable                          │
│       │ compile                                          │
│       ▼                                                  │
│  Runtime Contract                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐  │
│  │ Grid     │ │ Filters  │ │ Editors  │ │ Decorators │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘  │
│  ┌──────────────────────┐ ┌───────────────────────────┐ │
│  │ Actions              │ │ IO: import / export       │ │
│  │ - builtin CRUD       │ │ (generic)                 │ │
│  │ - sqlTransaction     │ │                           │ │
│  │ - client handler     │ │                           │ │
│  └──────────────────────┘ └───────────────────────────┘ │
│                         │                                │
│                         ▼                                │
│              PostgreSQL（元数据 + 业务表）                  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 目标样板：网页版「商品台账」（用积木搭，不写死业务）

### 2.1 业务范围（小店可感知，仍是单表世界）

| 页面/对象 | 模板 | 能力 |
|-----------|------|------|
| **商品台账** | singleTable | 增删改查、筛选、排序、分页 |
| **分类字典**（可选） | singleTable 或仅 options SQL | 给商品分类下拉 |
| **库存流水只读**（可选） | rawSql | 展示进出记录（若表存在）；1.x **不提供**过账主从 |

**商品表示例字段（建议演示 schema，可放 `demos/product_ledger/`）：**

- `id` PK  
- `sku` 货号（唯一）  
- `name` 名称  
- `category` 分类  
- `unit` 单位  
- `cost_price` 进价  
- `sale_price` 售价  
- `qty_on_hand` 现存量  
- `safety_qty` 安全库存  
- `status` 启用/停用  
- `remark`  
- `created_at` / `updated_at`

### 2.2 台账上要「配出来」的通用动作示例（证明积木，不是硬编码）

| 按钮 | 类型 | 行为 |
|------|------|------|
| 刷新 | builtin | grid.refresh |
| 新增 / 编辑 / 删除 | builtin + writable | 单表 CRUD |
| 导出 CSV | builtin IO | 当前筛选结果或本页 |
| 导入 CSV | builtin IO | 映射到商品表 |
| **标记停用** | **sqlTransaction** | `UPDATE product SET status=0 WHERE id=:id` |
| **库存 +1 / 简易调整** | **sqlTransaction** | 单表更新 `qty_on_hand`（演示事务按钮，**不是**完整进销存过账） |
| **低于安全库存视图** | 另一 rawSql 页或同页 filter | 只读查询 |

> 故意不在 1.x 做「采购单确认入库」。那是 2.0 主从 + 同一套 sqlTransaction 的升级用法。

### 2.3 台账验收清单（Definition of Done for Demo）

- [ ] 零 Java 业务代码：仅 SQL + 元数据 JSON 安装演示
- [ ] 商品可增、改、删、查（主键明确）
- [ ] 分类/状态下拉、价格 money 展示、低库存 badge
- [ ] 至少一个 **页面级** 与一个 **行级** SQL 事务按钮可用
- [ ] 导出当前列表 CSV；导入 CSV 新增/更新（按 sku upsert 或仅 insert，需在动作配置中声明）
- [ ] Studio 可改 SQL/列/动作后运行态立即生效
- [ ] rawSql 页不能误开通用 CRUD

---

## 3. 通用能力详细规格（1.x）

### 3.1 ActionModel（通用）

```json
{
  "code": "disable_product",
  "label": "停用",
  "scope": "row",
  "variant": "danger",
  "confirmText": "确认停用该商品？",
  "type": "sqlTransaction",
  "sqlTransaction": {
    "statements": [
      "UPDATE product SET status = 0, updated_at = NOW() WHERE id = :id"
    ],
    "paramsFrom": "row",
    "successMessage": "已停用",
    "refresh": true
  },
  "when": { "field": "status", "notEquals": 0 }
}
```

**动作类型（1.x）：**

| type | 执行位置 | 说明 |
|------|----------|------|
| `builtin` | 前后端约定 | refresh、openCreate、openEdit、deleteRow、exportCsv、importCsv |
| `sqlTransaction` | **后端事务** | 多语句顺序执行，全部成功才 commit |
| `client` | 前端 | 打开链接、复制、调用已注册 handler（窄） |

**参数来源 `paramsFrom`：**

- `row`：当前行字段  
- `selection`：多选行（1.x 可先只做单行，多选后置）  
- `form`：弹窗表单字段  
- `fixed`：配置里的常量  
- 合并：`fixed` + `row`，row 覆盖同名键需禁止（安全：fixed 不可被 row 覆盖敏感键）

**安全规则：**

1. 仅允许配置在 `lc_action` 或 PageModel.actions 中的语句执行（**不是**前端传任意 SQL）。
2. 语句必须使用命名参数 `:param`，拒绝分号注入：每条 statement 为单条 SQL，由后端拆分配置数组执行。
3. 可选：语句前缀白名单 `UPDATE|INSERT|DELETE|SELECT`（SELECT 用于校验查询，写在事务内）。
4. 执行写 `lc_action_log`（actionCode、pageCode、params、success、error、duration）。
5. 超时：`statement_timeout` 会话级或动作级配置（默认 10s）。

**后端 API 草案：**

```http
POST /api/v1/actions/{actionCode}/execute
{
  "pageCode": "product_ledger",
  "row": { "id": 1, "sku": "A01" },
  "form": {},
  "params": {}
}
```

服务端加载动作定义 → 绑参 → `Connection` 手动事务 → 返回 `{ status, message, refreshSuggested }`。

**存储建议（二选一，推荐 B）：**

- A：仅嵌在 `lc_page_model.config_json.actions[]`（改动小）
- B：`lc_action` 表 + page 引用 actionCode（可复用、可审计）— **推荐 1.6**

```sql
CREATE TABLE IF NOT EXISTS lc_action (
  action_code     VARCHAR(100) PRIMARY KEY,
  action_type     VARCHAR(50)  NOT NULL,  -- builtin | sqlTransaction | client
  label           VARCHAR(200) NOT NULL,
  config_json     JSONB        NOT NULL,
  enabled         BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

### 3.2 Import / Export（通用，非模板）

| 能力 | 行为 | 绑定点 |
|------|------|--------|
| **exportCsv** | 按当前 filters + 可见列导出；可选 maxRows | Grid action，任意只读/可写页 |
| **importCsv** | 上传 CSV → 列映射 → 校验 → 批量 insert/upsert | 需 `writableProfile` 或显式 `target: { table, keyColumns }` |

**导入配置示例（Page 或独立 IO profile）：**

```json
{
  "code": "import_products",
  "type": "builtin",
  "builtin": "importCsv",
  "import": {
    "targetTable": "product",
    "mode": "upsert",
    "keyColumns": ["sku"],
    "columns": [
      { "csv": "货号", "field": "sku", "required": true },
      { "csv": "名称", "field": "name", "required": true },
      { "csv": "售价", "field": "sale_price", "type": "number" }
    ],
    "maxRows": 2000
  }
}
```

1.x 范围：同步、CSV only、有行数上限、错误返回行号列表。  
不做：异步 Job、xlsx 复杂格式、图片附件。

### 3.3 Editors（通用控件）

| editor type | 用于 filter / form /（将来）inline | 1.x |
|-------------|-------------------------------------|-----|
| text | ✓ | 有，补齐 |
| number | ✓ | 补齐 |
| textarea | form | 补齐 |
| boolean / switch | ✓ | 补齐 |
| select (static\|sql) | ✓ | 已有，抽 registry |
| autocomplete (sql) | ✓ | 已有，抽 registry |
| date / datetime | ✓ | 补齐统一 |
| money（number + 格式） | form + display | 装饰器协同 |

控件配置挂在 **Field/Editor 引用**上，不挂在模板类型上。

### 3.4 Decorators（展示装饰，通用）

列级 `format` / `decorator`（命名统一到 `format` 或 `decorator`，文档定一个）：

| decorator | 效果 |
|-----------|------|
| `text` | 默认 |
| `number` | 千分位 |
| `money` | 货币符号 + 2 位 |
| `percent` | 百分比 |
| `datetime` / `date` | 本地化时间 |
| `boolean` | 是/否或图标 |
| `badge` | 色块；可配 map：status→color |
| `dict` | value→label（static 或 sql 字典） |
| `link` | 外链或内部 route（只读跳转） |

低库存示例：`qty_on_hand` 用 badge + when 表达式（1.x 可用简单 `toneRules`）：

```json
{
  "field": "qty_on_hand",
  "format": "number",
  "toneRules": [
    { "when": "value <= row.safety_qty", "tone": "danger" },
    { "when": "value > row.safety_qty", "tone": "success" }
  ]
}
```

1.x `when` 先做极简：比较 value 与常量或同行字段，不做完整表达式引擎。

### 3.5 singleTableTemplate（模板侧最小集）

编译输入：

```json
{
  "mode": "singleTableTemplate",
  "tableName": "product",
  "primaryKey": "id",
  "select": ["id", "sku", "name", "category", "unit", "cost_price", "sale_price", "qty_on_hand", "safety_qty", "status", "updated_at"],
  "baseWhere": "1=1",
  "defaultOrderBy": "id desc"
}
```

编译输出 Runtime：

- 可执行查询 + writableProfile `{ table, primaryKey, columns }`
- 默认 features：pagination；create/edit/delete 仅当 PK 明确

与现有 `isPageWritable` 对齐并加强：结果列必须包含 PK。

---

## 4. 与现状代码的映射（实施时改哪里）

| 区域 | 现状 | 1.x 方向 |
|------|------|----------|
| `PageLoader.tsx` (~1450 行) | runtime+studio 耦合 | 拆：`runtime/GridPage`、`studio/*`、`editors/*`、`actions/*` |
| `actionRegistry.ts` | 前端 builtin | 扩展：调后端 sqlTransaction；import 入口 |
| `pageDsl.ts` | 页面 DSL normalize | 扩展 Action/Import/Decorator 类型 |
| `QueryEngineService` | 执行/过滤/introspect | 保留；过滤继续后端化 |
| `PageService` | CRUD | 收敛为 CrudService；writable 硬化 |
| 新增 `ActionService` | 无 | sql 事务执行 + 日志 |
| 新增 `ImportExportService` | 无 | CSV |
| `schema.sql` | 五表 | + `lc_action`、`lc_action_log`（若选表存） |
| 演示 | order demo | + `demos/product_ledger/*.sql` |

---

## 5. 分阶段实施计划（可独立验收）

### Phase A — 边界与硬化（约 1 周）· 对应「1.5 地基」

**目标：** 模板/通用边界写进文档与最小代码结构；CRUD 默认安全。

| 任务 | 产出 | 验收 |
|------|------|------|
| A1 文档 | 更新 `v1.5` wiki、roadmap、本 plan 链接；Core vs Template 表进 wiki | 新人只读文档能说清边界 |
| A2 模式字段 | Query/Page 支持 `mode: rawSql \| singleTableTemplate`（兼容旧数据默认 rawSql 或按是否可写推断） | 旧 demo 不挂 |
| A3 writable 硬化 | 默认 create/edit/delete=false；校验 PK 在结果中；前端按 `writable` 显示按钮 | rawSql 不可误写 |
| A4 前端目录骨架 | `src/dsl` `src/editors` `src/actions` `src/runtime`（可先 re-export，不一次大搬家） | 构建通过 |

**不做：** 主从、导入、sql 事务。

---

### Phase B — 单表台账 CRUD + 控件/装饰器（约 1–2 周）· 「能搭台账」

**目标：** 商品表 singleTable 增删改查体验完整；控件与装饰器可配置。

| 任务 | 产出 | 验收 |
|------|------|------|
| B1 singleTable 编译 | 后端按 table 生成 select + filter + sort + page | 不手写套壳 SQL 也能查 |
| B2 表单 editors | number/textarea/boolean/date 与 select/autocomplete 统一 registry | 商品表单不靠纯 text |
| B3 decorators | money/badge/dict/datetime | 售价、状态、时间好看 |
| B4 商品台账 demo SQL | 表+元数据+Page 一键安装脚本 | 新库执行即用 |
| B5 低库存 toneRules | 现存量对比安全库存 | 危险色可见 |

**不做：** 导入；复杂 sql 事务可先不做。

---

### Phase C — SQL 事务按钮（约 1 周）· 「1.6 Actions」

**目标：** 配置按钮执行后端事务 SQL，参数来自行。

| 任务 | 产出 | 验收 |
|------|------|------|
| C1 `lc_action` + API | 定义与执行接口、事务、日志 | 单测：成功 commit / 失败 rollback |
| C2 前端 action 桥 | type=sqlTransaction 调 API，confirm、toast、refresh | 行上「停用」可用 |
| C3 页面级动作 | 无 row 的 fixed 参数动作 | 例如「全部启用演示数据」类 |
| C4 Studio 编辑 | 配置态可编辑动作 JSON（可先 textarea） | 改语句保存即生效 |
| C5 台账示例动作 | 停用、简易数量调整 | demo 文档写清「非进销存过账」 |

**安全门禁：** 禁止前端传 SQL 正文；仅 actionCode。

---

### Phase D — 导入导出（约 1 周）· 「1.7 IO」

**目标：** 通用 CSV 进出，挂在任意可写单表页。

| 任务 | 产出 | 验收 |
|------|------|------|
| D1 exportCsv | 服务端或前端导出（大数据倾向服务端按 query 导出） | 筛选后导出列正确 |
| D2 importCsv | 上传、映射、upsert/insert、错误行报告 | 200 行商品可导入 |
| D3 与 writable 联动 | 无写权限则隐藏导入 | rawSql 页无导入写回 |

---

### Phase E — 打磨与积木说明（约 0.5 周）

| 任务 | 产出 |
|------|------|
| E1 积木手册 | `docs/wiki/building-blocks.md`：如何搭一个单表业务 |
| E2 默认只读 vs 可写对照表 | 更新 crud-boundaries |
| E3 回归 | 订单 demo + 商品台账 demo 双过 |
| E4 （可选）窄前端 plugin | 注册自定义 action，不挡主线 |

---

## 6. 建议实施顺序（依赖图）

```text
A 边界/writable ──┬──► B 单表+控件+台账 demo ──► C SQL 事务动作 ──► D 导入导出 ──► E 文档打磨
                  │
                  └──► （并行可做）前端目录骨架、decorator 纯展示
```

**最小可对外演示路径：** A + B → 已是「网页版商品台账」。  
**完整 1.x 故事：** A+B+C+D → 「台账 + 事务按钮 + 进出 CSV」。

---

## 7. 风险与决策

| 风险 | 缓解 |
|------|------|
| PageLoader 继续膨胀 | Phase A 先拆目录，新功能禁止再堆进单文件 |
| SQL 事务被滥用成任意写 | 仅预置 action、参数化、日志、timeout、权限后置但先做操作审计 |
| 与 2.0 主从混淆 | 文档与 demo 文案固定：「调整数量 ≠ 进销存过账」 |
| 导入弄脏数据 | maxRows、dry-run 可选（1.x 可只做正式写入+错误报告） |
| 旧 demo 不兼容 | mode 缺省兼容；迁移脚本只增不破 |

**开放决策（实施前拍板，默认值已写）：**

1. 动作存 `config_json` 还是 `lc_action` 表？ → **默认 `lc_action` 表**  
2. 导出前端拼还是后端流？ → **默认 ≤5000 行前端可接受则前端；否则后端**  
3. upsert 键？ → **demo 用 sku**  

---

## 8. 文档同步清单

实施过程中应更新：

- [ ] `docs/wiki/roadmap.md` — 写入 1.5–1.7 与 2.0 主从分界  
- [ ] `docs/wiki/v1.5-modular-dsl-plan.md` — 并入 Action/IO，或拆 `v1x-building-blocks.md`  
- [ ] `docs/wiki/crud-boundaries.md` — sqlTransaction 与单表 CRUD 并列  
- [ ] `docs/wiki/model-boundaries.md` — ActionModel  
- [ ] `docs/wiki/building-blocks.md` — **新建** 积木手册  
- [ ] `README.md` — 阶段表述改为可搭商品台账  
- [ ] `demos/product_ledger/README.md` — 安装与验收步骤  

---

## 9. 2.0 预留接口（1.x 只设计不实现）

1.x 的 **sqlTransaction Action** 与 **Editor Registry** 必须可被 2.0 主从页直接复用：  
主从「确认入库」= 单据模板 UI + 一条（组）已配置的 sqlTransaction，而不是新写一套 Java 过账引擎。

1.x 结束时的口号：

> **模板决定页面骨架；积木决定字段、按钮、进出与展示；SQL 事务决定业务副作用。**  
> **单表台账用 1.x 堆；采购销售主从用 2.0 模板 + 同一套积木。**

---

## 10. 本计划不包含的实现细节

细粒度 TDD 步骤（单测代码、逐文件 patch）在启动 Phase A/B/C/D 时分别开子 plan：

- `docs/superpowers/plans/YYYY-MM-DD-phase-a-writable-and-mode.md`
- `docs/superpowers/plans/YYYY-MM-DD-phase-b-single-table-ledger.md`
- `docs/superpowers/plans/YYYY-MM-DD-phase-c-sql-transaction-actions.md`
- `docs/superpowers/plans/YYYY-MM-DD-phase-d-csv-import-export.md`

---

## 11. 验收总表（1.x 完成时）

| # | 项 | 类型 |
|---|----|------|
| 1 | rawSql 只读网格 + 过滤排序分页 | 模板 |
| 2 | singleTable 可写网格 + 主键门禁 | 模板 |
| 3 | 商品台账 demo 可安装 | 样板 |
| 4 | Editor registry 常用控件 | 通用 |
| 5 | Column decorator money/badge/dict | 通用 |
| 6 | sqlTransaction 行/页按钮 | 通用 |
| 7 | CSV 导入导出 | 通用 |
| 8 | 文档：Core vs Template + 积木手册 | 文档 |
| 9 | 无主从、无流程引擎 | 边界 |

---

**Plan complete.** 路径：`docs/superpowers/plans/2026-07-19-v1x-product-ledger-building-blocks.md`
