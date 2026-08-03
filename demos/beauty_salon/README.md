# 美容美发业务 Demo（真实表）

物理表 `beauty_*` + **纯配置** Action（无 `BeautyXxxService`）。  
原则见 [domain-generality.md](../../docs/wiki/domain-generality.md)。

## 安装

```bash
# 基础（表 + 前台/开单/向导）
psql ... -f demos/beauty_salon/install.sql
# 纵深店务（审单/改单/次卡/日结）
psql ... -f demos/beauty_salon/deep_ops.sql

# 本地 docker 示例：
docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/beauty_salon/install.sql
docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/beauty_salon/deep_ops.sql
```

硬刷新前端，用 `owner` / `owner123` 登录。

## 页面

| page_code | 能力 |
|-----------|------|
| `beauty_salon_guide` | 基础导览 |
| `beauty_ops_guide` | **纵深店务导览**（配置驱动原则） |
| `beauty_front_desk` | Workspace；点会员 → 开单 |
| `beauty_order_md` | MasterDetail；**仅 draft 可改** |
| `beauty_order_board` | **单据台**：提交/审单/改单/作废 |
| `beauty_session_cards` | **次卡账户**：核销 1 次 + 流水 |
| `beauty_day_close` | **日结**：锁当日已审单 |
| `beauty_members` / `beauty_services` | CRUD |
| `beauty_calendar_biz` | 预约日历 |
| `beauty_card_wizard` | 储值开卡向导 |

## 表

`beauty_member` · `beauty_staff` · `beauty_service` · `beauty_card_product` · `beauty_member_card` · `beauty_appointment` · `beauty_order` / `beauty_order_line`

## 建议验收路径

### 基础

1. `beauty_front_desk` 点会员 → 开单带入 → 草稿保存  
2. `beauty_card_wizard` 储值开卡  

### 纵深（反驳「流程软件做不了店务」）

1. **`beauty_order_board`**  
   - 对 `draft` 点 **提交待审** → `submitted`  
   - **审单** → `approved`（明细只读）  
   - **改单** → 回到 `draft` 且 version+1 → 打开明细可改 → 再提交审  
   - **作废** → `void`  
2. **`beauty_session_cards`**  
   - 对次卡点 **核销1次** → 余次 -1，有 consume 流水  
3. **`beauty_day_close`**  
   - 先把当日 draft/submitted 处理完  
   - **今日日结** → 已审单 `settled_flag=1`，再改单应失败  

## 映射（讲解用）

| 店务 | 通用模式 | 载体 |
|------|----------|------|
| 审单 | 状态迁移 + assert | `act_beauty_order_approve` |
| 改单 | 恢复可编辑态 | `act_beauty_order_reopen` |
| 次卡 | 账户扣减 + 流水 | `act_beauty_card_consume` |
| 日结 | 批量锁定 + 汇总头 | `act_beauty_day_close` |

表名可带 `beauty_`（演示模型）；**模式可抄到汽修/诊所**，只换 SQL 资产。

## 工厂模板

`workspace_lite` / `wizard_lite` / `dashboard_lite` 仍是通用壳。

## 插件（未做）

短信/邮件 → PluginHost；不进日结/核销主事务。
