# 可扩展运行时、Dashboard 与 MasterDetail 实施计划

> 日期：2026-07-29  
> 状态：已确认，作为后续开发主线  
> 目标：先完善 Smart Grid、组件和脚本运行时，再交付通用 `dashboardTemplate`、`masterDetailTemplate` 与 MRFM Demo。

## 1. 背景与结论

现有项目已经具备 SQL-first Smart Grid、单表受控 CRUD、SQL Action、RBAC、字典、日志和多数据源目录等能力。下一阶段不应为每个 MRFM 页面增加领域 Controller，也不应一次实现五套相互独立的模板。

主线确定为：

```text
Smart Grid 基线
  → 统一 DataTable / DataSource
  → 注册式组件运行时
  → JS Page Controller
  → Groovy 服务端 ScriptRuntime
  → SQL 图表组件
  → dashboardTemplate
  → masterDetailTemplate
  → MRFM Demo
```

`workspaceTemplate`、`wizardTemplate`、`calendarTemplate` 暂不作为独立业务引擎开发。优先通过通用布局、组件注册、JS Controller、Groovy 动态端点和 Action 组合实现；重复模式稳定后再沉淀模板。

## 2. 防止框架膨胀的设计原则

### 2.1 稳定内核，注册式扩展

内核只负责：

- Page/Component 生命周期
- 统一 DataTable
- 数据源解析与请求调度
- 组件注册和组件句柄
- JS/Groovy 脚本加载与治理
- 权限、事务、数据源、审计和错误隔离

新增组件、数据源 Provider、前端控制器或服务端脚本，不应修改 PageLoader/QueryEngine 的核心分支。

### 2.2 三层扩展能力

| 层级 | 适用场景 | 是否修改框架 |
|---|---|---|
| 配置 | 更换 SQL、列绑定、布局、属性 | 否 |
| JS/Groovy | 新联动、新校验、新业务编排、新动态接口 | 否 |
| Java/React 插件 | 新基础设施、新底层组件、新安全能力 | 仅注册插件，不改业务模板 |

### 2.3 限制只放在平台边界

保留的强限制：

- 权限必须由后端执行
- 权威写入必须处于明确事务中
- 单个事务不伪装支持跨数据源原子性
- 前端 JS 不直接连接数据库或持有密钥
- 动态脚本必须有版本、权限、审计、超时和错误隔离

业务表达不使用大型条件 DSL 限制；复杂交互交给 JS，复杂服务端编排交给 Groovy/Action。

## 3. 核心契约

### 3.1 DataTable

```ts
interface DataTable {
  columns: ColumnMeta[]
  rows: Record<string, unknown>[]
  total?: number
  metadata?: Record<string, unknown>
}
```

SQL、静态数据和后期缓存 Provider 都输出同一结构。

### 3.2 DataSourceSpec

```ts
interface DataSourceSpec {
  type: string
  queryCode?: string
  cacheKey?: string
  params?: Record<string, unknown>
  options?: Record<string, unknown>
}
```

`type` 使用注册表解析。首版实现 `sql`、`static`；为 `cache` 保留契约，不在本阶段实现完整缓存系统。

### 3.3 ComponentSpec

```ts
interface ComponentSpec {
  componentCode: string
  type: string
  dataSource?: DataSourceSpec
  bindings?: Record<string, string>
  properties?: Record<string, unknown>
}
```

组件以 `type` 注册，不在核心运行时添加组件类型判断链。

### 3.4 JS Controller

页面 JS 可以：

- 管理页面状态
- 监听组件事件
- 获取组件句柄
- 刷新和修改组件属性
- 调用 Query、Action、Dynamic Endpoint
- 打开页面、抽屉和确认框

复杂联动写 JS；DSL 只保留简单事件快捷配置。

### 3.5 Groovy ScriptRuntime

Groovy 通过受控 Context 使用平台能力：

- 当前用户、组织、租户和权限
- Query/Action 调用
- 当前数据源事务
- 请求参数和 Schema 校验结果
- 日志、审计和 outbox 预留

不直接暴露 Spring ApplicationContext、数据库密码、任意进程或文件系统。

## 4. 实施切片

每个切片必须独立验证并独立提交 Git。提交前运行该切片相关的后端测试，以及前端 lint/test/build。

### Slice 1：Smart Grid 只读复杂查询基线

状态：**已完成并验收**（2026-07-30，ut1 / PostgreSQL 17）

验证：

- 基线：`fca4aee feat: harden smart grid complex query boundaries`
- 后端：Java 17 `mvn test` 全量通过（33 tests）
- 前端：`npm run lint` / `npm test -- --run` / `npm run build` 通过
- 部署机反馈：公开入口仅有扫描器噪音（非法 HTTP method），无用户功能缺陷报告
- 注意：已有库需执行 `schema.sql` 中的 `ALTER TABLE ... count_sql_text`（`CREATE TABLE IF NOT EXISTS` 不会补列）；应用以 `spring.sql.init.mode=always` 启动后会自动补齐

工作项：

- [x] 为 JOIN、CTE、聚合、窗口函数、UNION 增加测试。
- [x] 明确 `rawSql` 永远默认只读。
- [x] 只有稳定单实体、主键和写回表成立才生成 CRUD 能力。
- [x] 结果列 alias 作为过滤和排序白名单。
- [x] 支持可选显式 `countSql`，保留自动 count 回退。
- [x] 检查 SQL 内置排序和子查询包装兼容性。
- [x] 增加只读查询超时和最大页大小验收。

验收：多表 MRFM 查询可直接生成只读 Smart Grid，分页、排序、过滤正常，不能自动编辑。

已落地提交：

```text
fca4aee feat: harden smart grid complex query boundaries
```

### Slice 2：统一 DataTable 与注册式数据源

状态：**已完成并验收**（2026-07-30，ut1 / PostgreSQL 17）

工作项：

- [x] 后端查询响应和前端类型统一为 DataTable（`columns` / `rows` / `total` / `metadata`）。
- [x] 增加 DataSource Provider 注册表（后端 `DataSourceProviderRegistry`，前端 `registerDataSourceProvider`）。
- [x] 实现 `sql`、`static` Provider；`cache` 仅契约（抛出 not implemented + reserved metadata）。
- [x] Smart Grid（PageLoader）经 `resolveDataSource` 取数，默认 `type=sql`。
- [x] 新增 `POST /api/v1/datasources/resolve` 与 `GET /api/v1/datasources/types`；保留 `/queries/{code}/execute`。
- [x] 新增数据源类型只需注册 Provider，不必改 Smart Grid 组件。

验收：Smart Grid 行为不回退；新增数据源类型不需要修改组件代码。

验证：

- 后端：`mvn test`（含 DataSourceProviderTest）
- 前端：`npm run lint` / `npm test -- --run` / `npm run build`

### Slice 3：注册式组件运行时

状态：**已完成并验收**（2026-07-30）

工作项：

- [x] 建立 Component Registry（`registerPageComponent` / `ComponentHost`）。
- [x] 定义 ComponentSpec、ComponentHandle 和标准状态。
- [x] 支持 Loading、Empty、Error、Ready（`resolveComponentStatus` + 状态壳）。
- [x] 将 Smart Grid 注册为第一个组件（`type=smartGrid`，渲染下沉到 `runtime/components/SmartGrid.tsx`）。
- [x] 验收探针组件 `type=probe`：无需改 PageLoader 类型分支即可注册。
- [x] PageLoader 通过 `resolvePageComponentSpecs` + `ComponentHost` 装配；无 `components` 时默认单 smartGrid。
- [x] 配置 Studio / CRUD 抽屉仍由 PageLoader 持有（页面级编排，非组件类型分支）。

验收：可通过注册新增一个测试组件；Smart Grid 无功能回退。

**UI 回归注意（请人工点验）：** 运行态表格筛选/排序/分页、配置态 Preview、行编辑抽屉、action 按钮。

验证：

- 前端：`npm run lint` / `npm test -- --run` / `npm run build`
- 后端：本 Slice 无 Java 改动；可选择性跑 `mvn test`

### Slice 4：JS Page Controller

状态：**已完成并验收**（2026-07-30）

工作项：

- [x] 实现发布版本的 ES Module 脚本加载（blob `import()` + `/api/v1/scripts/{code}/runtime`）。
- [x] 支持 `onInit/onReady/onEvent/onDispose/onError`。
- [x] 提供 state、components、query、action、endpoint（占位）、navigation、ui API。
- [x] 统一事件信封（rowClick/itemClick 等）；ComponentHost 与 Smart Grid 转发。
- [x] 页面卸载时 `onDispose` + 清理 runtime。
- [x] 脚本失败隔离（hook try/catch，不白屏）。
- [x] 脚本 `DRAFT/PUBLISHED/DISABLED` + `version` 字段；仅 PUBLISHED 可被运行态加载。

Page DSL：

```json
"controller": { "scriptCode": "ctrl_demo", "enabled": true }
```

验收：JS 能监听组件事件并刷新 handle、调用 Query/Action；异常有日志。

**人工验证：** 绑定并 publish 一个 PAGE_CONTROLLER，确认 rowClick 不白屏、toast 可用。

验证：

- 后端：`mvn test`（含 PageControllerScriptTest）
- 前端：`npm run lint` / `npm test -- --run` / `npm run build`

### Slice 5：Groovy ScriptRuntime 与动态端点

状态：**已完成并验收**（2026-07-30）

工作项：

- [x] 将现有 Query Hook 迁入统一 `ScriptRuntimeService`（`GroovyScriptService` 为门面）。
- [x] `before/after query`、`before/after action`、`onError`（接口默认方法，兼容旧脚本）。
- [x] 脚本版本缓存键 `code@version`、发布前编译校验、保存/发布/禁用失效、`lc_script_exec_log`。
- [x] 受控 `DynamicContext`（query/action/require/log；无 ApplicationContext/密钥/文件系统）。
- [x] `POST /api/v1/dynamic/{endpointCode}` + 管理 API（save/publish/disable/list/get）。
- [x] `lc_dynamic_endpoint`：request/response schema、perm_code、tx_mode（NONE/READ_ONLY/REQUIRED）、timeout、status。
- [x] 单数据源边界：本 Slice 仅平台库（`dataSourceCode` 空或 `default`）。
- [x] 前端 `ctx.endpoint.call` 接入动态端点。

验收：Groovy 可实现有 schema 校验与事务模式的动态接口（见 `DynamicEndpointTest`）。

验证：

- 后端：`mvn test`（含 DynamicEndpointTest）
- 前端：`npm run lint` / `npm test -- --run` / `npm run build`

### Slice 6：SQL 驱动基础图表

状态：**已完成并验收**（2026-07-30）

工作项：

- [x] 注册 `stat`、`barChart`、`lineChart`、`pieChart`、`text`。
- [x] 图表只依赖 DataTable + 列名 `bindings`（`category`/`value`/`text`）。
- [x] Chart Adapter 隔离模型构建；ECharts option 映射独立（`chartModelToEchartsOption`）。
- [x] 标题、图例、格式化、空态、错误态、loading。
- [x] 点击发 `itemClick` 标准事件（payload 含 name/value/row）；PageLoader 转发到 Page Controller。
- [x] 非 grid 组件按各自 `dataSource` 独立加载（可替换 queryCode 复用绑定）。

Page DSL 示例：

```json
{
  "components": [
    {
      "componentCode": "kpi",
      "type": "stat",
      "dataSource": { "type": "sql", "queryCode": "q_today_revenue" },
      "bindings": { "value": "total" },
      "properties": { "title": "今日营收", "format": "money" }
    },
    {
      "componentCode": "by_day",
      "type": "barChart",
      "dataSource": { "type": "sql", "queryCode": "q_rev_by_day" },
      "bindings": { "category": "day", "value": "amount" },
      "properties": { "title": "按日", "legend": true }
    },
    { "componentCode": "grid", "type": "smartGrid" }
  ]
}
```

**UI 回归注意：** 含 charts 的页面需人工点验渲染与点击；默认单 grid 页面应无回归。

验证：

- 前端：`npm run lint` / `npm test -- --run` / `npm run build`
- 依赖：`echarts@5`

### Slice 7：DashboardTemplate

状态：**已完成**（2026-08-02）

工作项：

- [x] 实现固定 Row/Column/Section 网格，不做拖拽设计器。
- [x] 支持页面级共享参数（`sharedParams`）和组件独立数据源。
- [x] 支持组件独立刷新（section `refreshable` + handle.refresh）和 JS 联动（既有 controller 事件）。
- [x] 建立 Dashboard Lite 示例（`demos/dashboard_lite`）。

验收：展示今日预约、今日营收、待结算订单、员工业绩、项目分类和明细表。

落地：

- `frontend/src/runtime/layoutTypes.ts` — layout 规范化
- `frontend/src/runtime/components/DashboardLayout.tsx` — 12 列网格渲染
- `ComponentHost` / `PageLoader` / `pageDsl` 接入 `layout` + `sharedParams`
- Demo：`demos/dashboard_lite`（`dash_lite_home` / `dash_lite_guide`）

建议提交：

```text
feat: add dashboard layout and dashboard lite demo
```

### Slice 8：MasterDetailTemplate

工作项：

- 订单头表单与项目明细编辑。
- 临时行 ID、增改删状态和整单校验。
- 整单保存、提交、取消 Action。
- 单数据源事务、乐观锁和错误回滚。
- 支持 JS 前端编排和 Groovy 前后置校验。

验收：创建 MRFM 订单，选择会员并添加多个项目和员工，保存草稿后整单提交，头明细在同一事务写入。

建议提交：

```text
feat: add transactional master detail template
feat: add mrmf order and service line demo
```

## 5. 后置模板策略

### Workspace

先用三栏 Layout Component + JS Controller 实现。只有至少两个业务出现相同状态和事件模式时，再固化为 `workspaceTemplate`。

### Wizard

先实现通用 Stepper Component，由 JS 管理步骤与状态，Groovy/Action 做服务端校验。重复模式稳定后再固化模板。

### Calendar

先实现 Calendar Component，SQL 返回 `id/title/start/end/resourceId/status`。拖动和预约通过标准事件调用 Action/Dynamic Endpoint。

## 6. 提交与验证纪律

- 每个可独立验收的切片完成后立即提交，不将多个阶段压成一个大提交。
- 测试失败不得提交为“完成”；确属环境依赖时必须记录验证条件。
- 提交只包含当前切片，不混入无关格式化或生成物。
- 提交前检查 `git diff --check` 和 `git status`。
- 不提交 `target/`、`dist/`、`node_modules/`、数据库备份和密钥。
- 每个 Slice 完成时同步更新本计划的状态与当前能力矩阵。
- 未经明确指示只做本地提交，不自动 push 或发布部署。

## 7. 当前执行顺序

- Slice 1–6：**已完成**
- Slice 7：**已完成**（DashboardTemplate / Dashboard Lite）
- 下一步：**Slice 8** — MasterDetailTemplate
