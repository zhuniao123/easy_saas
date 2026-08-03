# Dashboard Lite Demo（Slice 7）

固定 **Row / Column / Section** 网格 + SQL 驱动组件，**不做拖拽设计器**。

## 工厂一键建页

页面工厂模板 **`dashboard_lite`** 已注册：

1. 打开工厂 → 选模板 **Dashboard Lite**
2. 填 pageCode / 标题 / 路由 → 创建
3. 运行态即可看到 KPI 行 + 趋势图 + 明细表
4. 在 SQL 仓库改 `q_<pageCode>` / `_kpi` / `_series` 接入真实数据

不建业务表；删页时会清理主 query 与 companion `_kpi` / `_series`。

## 安装完整门店看板 Demo

```bash
psql "$DATABASE_URL" -f demos/dashboard_lite/install.sql
# 或在已登录的本地库：
# PGPASSWORD=... psql -h localhost -U lowcode -d lowcode -f demos/dashboard_lite/install.sql
```

刷新前端后打开页面：

| page_code | 说明 |
|-----------|------|
| `dash_lite_guide` | 导览步骤 |
| `dash_lite_home` | 门店运营看板（KPI + 图表 + 明细） |

## 布局 DSL

```json
{
  "layout": {
    "type": "dashboard",
    "gap": 16,
    "rows": [
      {
        "cols": [
          { "span": 3, "components": ["kpi_a"] },
          { "span": 9, "section": { "title": "区标题", "refreshable": true }, "components": ["chart_x"] }
        ]
      }
    ]
  },
  "components": [ /* componentCode 与 layout 对应 */ ]
}
```

- `span`：1–12 列
- `section`：可选标题 / 描述 / 分区刷新
- 未出现在 `layout` 中的组件会堆在底部（不会丢）
- 每个组件可独立 `dataSource.queryCode`；页面 `sharedParams` 会并入请求，筛选值覆盖同名键

## 验收点

1. 首行四枚 KPI 横排  
2. 第二行：左预约趋势（8）+ 右项目分类饼图（4）  
3. 第三行：员工业绩条形图 + 明细 Smart Grid  
4. Section「刷新」只重载该区独立组件数据  
5. 无 `layout` 的旧页面仍纵向堆叠（兼容）

## 下一步

Slice 8：`masterDetailTemplate`（头行同屏编辑 + 整单事务）。
