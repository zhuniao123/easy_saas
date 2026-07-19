# 通用 Loading 效果与可配置 Event Logging 规范

在 v1.5 及更高版本中，为了提供更专业、更美观且具备高度生产力的 SaaS 操作面板，我们设计并实现了以下两套核心低代码 DSL 功能扩展：

---

## 1. 通用 Loading 效果配置 (Page Loading Options)

传统的 Loading 通常是全屏或局部写死的 Spinner，容易导致界面抖动或交互生硬。现在的架构支持通过 `PageModel.features.loading` 控制三种不同的加载态视觉样式，并能实现**静默局部刷新**。

### A. 配置 Schema

```json
{
  "features": {
    "loading": {
      "enabled": true,
      "style": "skeleton",
      "showDefault": true
    }
  }
}
```

### B. 属性说明

| 字段名 | 类型 | 默认值 | 可选值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `enabled` | `boolean` | `true` | `true`, `false` | 是否启用 Loading 效果。设为 `false` 则完全禁用任何加载视觉。 |
| `style` | `string` | `"spinner"` | `"spinner"`, `"skeleton"`, `"glow"` | 指定加载动画的视觉风格。 |
| `showDefault` | `boolean` | `true` | `true`, `false` | 是否在数据拉取时显示占位遮罩。如果设为 `false`，则启用静默无感刷新（局部无遮盖更新）。 |

### C. 视觉类型定义

1. **`spinner` (默认样式)**: 
   - 动态居中的旋转环环相扣设计，自动匹配当前应用主题色（Ocean Dark, Cyberpunk, Solarized, Emerald）。
2. **`skeleton` (骨架屏)**:
   - 动态匹配当前页面表头列宽 (`runtimeColumns`) 的多脉冲行骨架动画。最大程度模拟真实数据填充效果。
3. **`glow` (极客微光)**:
   - 具有暗色霓虹发光粒子背景与动画告警图标的科技感卡片，适合展示高密度的复杂分析页面。

---

## 2. 通用 Event Logging 系统配置 (Event Logger Options)

可配置的前端日志追踪系统支持在低代码控制台配置对用户点击、表格翻页、应用筛选、CRUD 写入等动作的监控，可配置**本地打印**和**远程数据库归档**。

### A. 配置 Schema

```json
{
  "logging": {
    "enabled": true,
    "console": true,
    "reportToServer": true,
    "events": ["click", "query", "create", "edit", "delete", "filter"]
  }
}
```

### B. 属性说明

| 字段名 | 类型 | 默认值 | 可选值 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `enabled` | `boolean` | `true` | `true`, `false` | 是否开启页面日志模块。 |
| `console` | `boolean` | `true` | `true`, `false` | 是否在浏览器开发者控制台 (Chrome Console) 美化打印日志。 |
| `reportToServer` | `boolean` | `false` | `true`, `false` | 是否将操作日志推送到后端数据库进行持久化归档。 |
| `events` | `array` | `all` | `click`, `query`, `create`, `edit`, `delete`, `filter` | 监听并记录的特定交互事件列表。 |

### C. 事件类型与归档规范

1. **`click` (动作点击)**: 记录用户点击任意 DSL 注册动作按钮的行为（包含 Action Code、按钮标签及行上下文 ID）。
2. **`query` (查询生命周期)**: 记录 SQL 查询获取数据的开始、成功（包含行数、总行数）及异常捕获（包含报错详情）。
3. **`create` / `edit` / `delete` (CRUD 变更)**: 记录用户通过新增、更新、删除操作成功写入表数据的时刻（包含表单提交 Payload 与记录 ID）。
4. **`filter` (过滤器应用)**: 记录用户输入并提交高级过滤器筛选表格的时刻（包含过滤器参数详情）。

### D. 数据库日志存储结构 (`lc_client_log`)

若配置了 `reportToServer: true`，前端会将每次事件异步发送至后端 `POST /api/v1/pages/{pageCode}/logs` 接口，写入 PostgreSQL 表：

```sql
CREATE TABLE IF NOT EXISTS lc_client_log (
    id                 BIGSERIAL PRIMARY KEY,
    page_code          VARCHAR(100) NOT NULL,
    event_type         VARCHAR(50) NOT NULL, -- 'click', 'filter', 'query', etc.
    element_code       VARCHAR(100),         -- 按钮编码，表单项编码等
    message            TEXT,                 -- 日志详情文字
    details_json       JSONB NOT NULL DEFAULT '{}'::jsonb, -- 参数载荷
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
