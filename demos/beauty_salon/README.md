# 美容美发业务 Demo（真实表）

物理表 `beauty_*` + 页面配置，覆盖前台工作台、会员/项目 CRUD、主从开单、预约日历、开卡向导。

## 安装

```bash
docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/beauty_salon/install.sql
```

硬刷新前端，用 `owner` / `owner123` 登录。

## 页面

| page_code | 能力 |
|-----------|------|
| `beauty_salon_guide` | 导览 |
| `beauty_front_desk` | **Workspace** 真会员 + 预约 + KPI；按钮跳转开单/日历 |
| `beauty_order_md` | **MasterDetail** 服务开单（草稿/提交） |
| `beauty_members` | 会员 CRUD |
| `beauty_services` | 项目价目 CRUD |
| `beauty_calendar_biz` | **Calendar** 真预约 |
| `beauty_card_wizard` | **Wizard** 开卡（卡项真表） |

## 表

`beauty_member` · `beauty_staff` · `beauty_service` · `beauty_card_product` · `beauty_member_card` · `beauty_appointment` · `beauty_order` / `beauty_order_line`

## 建议验收路径（可用闭环）

1. **`beauty_front_desk`** — 左栏 **点击会员** → 自动打开 `beauty_order_md` 并带入会员名 → 填单号 → 加明细 → 保存草稿/提交  
2. **`beauty_card_wizard`** — 点选会员 → 点选卡项 → 确认开卡 → 查 `beauty_member_card` 与会员 `balance` 增加  
3. `beauty_members` / `beauty_services` CRUD  
4. `beauty_calendar_biz` 点预约  

## 工厂模板

工厂另有 **`workspace_lite` / `wizard_lite`** 一键骨架（不绑本店表）；本店业务用本 SQL 安装。

## 插件（未做）

开卡后短信：`act_beauty_open_card` 成功 → Groovy/outbox → PluginHost.sendSms（手机号已在 form.phone）。
