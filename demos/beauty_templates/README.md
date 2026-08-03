# 美容美发 · 前端模板 Demo

目标：用 **SQL + 页面 DSL** 搭前台工作台 / 开卡向导 / 预约日历。  
**短信、邮件、开卡通道** 后续做成「SQL 出参 + Groovy → PluginHost」插件，本切片只定前端模板与事件点。

## 安装

```bash
docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/beauty_templates/install.sql
```

## 页面

| page_code | 模板 | 说明 |
|-----------|------|------|
| `beauty_tpl_guide` | grid | 导览 |
| `beauty_workspace` | **workspace** | 左会员 / 中预约 / 右 KPI |
| `beauty_wizard` | **wizard** | 开卡三步向导 |
| `beauty_calendar` | **calendar** 组件 | 周视图预约 |

## DSL 摘要

```json
"workspace": {
  "enabled": true,
  "left": { "span": 3, "components": ["member_grid"] },
  "center": { "span": 6, "components": ["appt_grid"] },
  "right": { "span": 3, "components": ["kpi_appts"] }
}
```

```json
"wizard": {
  "enabled": true,
  "steps": [
    { "code": "profile", "title": "资料", "components": ["step_profile"] },
    { "code": "package", "title": "套餐", "components": ["step_packages"] }
  ]
}
```

```json
{
  "type": "calendar",
  "dataSource": { "type": "sql", "queryCode": "q_beauty_cal" },
  "bindings": { "id": "id", "title": "title", "start": "start_at", "resourceId": "staff_name" }
}
```

## 插件衔接点（未实现）

| 能力 | 配置方向 |
|------|----------|
| 开卡短信 | Action after / Groovy：query 手机号 → 模板 → `PluginHost.sendSms` |
| 邮件小票 | 同上 `sendEmail` |
| 实体卡/电子卡 | Dynamic Endpoint + 外部 SPI；权威余额仍在 SQL 事务 |

事件：`rowClick` / `itemClick` / `wizardFinish` 已由 `ctrl_beauty_tpl` toast，便于后续接插件。
