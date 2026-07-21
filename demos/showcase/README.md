# easy_saas 可展示 Demo（Showcase）

面向汇报 / 路演：约 **10–15 分钟** 跑通平台 1.x 基本能力。

## 一键安装 / 复位

```bash
# 需：postgres 容器 saas-demo-postgres、后端 8081、前端 5173
bash /root/saas-demo/demos/showcase/install.sh
```

会：

1. 清掉测试垃圾页（侧栏干净）  
2. 重装 **小店 shop_saas** + **product_ledger**  
3. 安装 **演示导览** 页  
4. 刷新 RBAC 目录，并给 clerk 配好业务页  

## 访问

| 项 | 值 |
|----|-----|
| 公网 | https://lowcode.lazyoldlearner.win/ |
| 备用 | https://tmp-5173.lazyoldlearner.win/ |
| 本地 | http://127.0.0.1:5173/ |
| 老板 | `owner` / `owner123` |
| 店员 | `clerk` / `clerk123` |

改完权限后请 **重新登录** 再看侧栏变化。

---

## 能力覆盖矩阵

| 能力 | 演示落点 |
|------|----------|
| 登录 + Token 会话 | 登录页 → Bearer |
| 角色差 | owner 见 Factory / SQL Repo / **权限**；clerk 不见 |
| 页面权限 | 侧栏按 `page:*` 过滤；权限台可改 |
| 字段权限 | clerk 商品页无 **成本价** |
| 单表 CRUD | 商品 / 客户 / 供应商 |
| rawSql 只读页 | 低库存预警、今日销售、演示导览 |
| sqlTransaction 过账 | 采购确认入库、销售确认出库 |
| assert 失败 | 销售超库存 |
| openQuery 钻取 | 商品流水/销售、同单明细、客户销售 |
| SQL 仓库 | owner → SQL Repo |
| 权限可配 | owner → 权限管理 |
| 配置态 | Factory 建页 / 改 DSL（可选） |
| 单页样板 | product_ledger |

---

## 推荐口播路径（约 12 分钟）

### 0. 开场（30s）

> 业务不写 Java Domain，页面 / 查询 / 动作都是 **元数据 + SQL 仓库**；权限运行时注入，不污染业务 SQL。

### 1. 双角色登录（1.5 min）

1. **owner** 登录 → 侧栏有：演示导览、Shop 全页、**权限 / SQL Repo / Factory**  
2. 退出 → **clerk** 登录 → **无** 三个系统入口；打开商品台账 → **无成本价列**  

### 2. 演示导览页（1 min）

打开 **演示导览 · Showcase**（`/demo/showcase-guide`）  
→ 整张表就是今天的 checklist（rawSql 静态清单页）。

### 3. 低库存 + 采购入库（3 min）

1. **低库存预警** → 矿泉水 `6 < 20`  
2. **采购明细** → 找到 `PO-2026-003` 草稿行  
3. 点 **确认入库** → 库存变、**库存流水** 多 `IN`  
4. 回到低库存/商品台账对照  

### 4. 销售出库 + 校验（3 min）

1. **销售明细** → `SO-2026-003` 草稿  
2. **确认出库** → 库存扣减、流水 `OUT`  
3. （可选）新建超大数量草稿再确认 → 展示 **assert 失败** 与错误提示  

### 5. 钻取 openQuery（2 min）

1. **商品台账** 行按钮 → 流水 / 销售抽屉  
2. **客户** → 销售记录  
3. 采购/销售行 → **同单明细**  

### 6. 配置与权限（owner，2 min）

1. **SQL Repo** → 打开 `sql_shop_post_sale_*`，说明动作引用仓库资产  
2. **权限** → 勾掉 clerk 的「今日销售」→ 保存  
3. clerk 重登 → 侧栏少一页（**页面权限可配**）  

### 7. 收尾

> 2.0 才做主副表同屏；1.x 用明细行 + 单号 + 钻取模拟。  
> 数据范围 org 隔离：表已预留，演示默认不做。

---

## 复位

演示「搞乱」数据后：

```bash
bash demos/showcase/install.sh
```

会整包重装 shop 种子（含草稿采购/销售），导览页与 clerk 页面矩阵一并复位。

---

## 文件

| 文件 | 作用 |
|------|------|
| `install.sh` | 一键安装 |
| `cleanup_test_pages.sql` | 清测试页 |
| `showcase_guide.sql` | 导览页元数据 |
| `../shop_saas/` | 小店 8 页业务 |
| `../product_ledger/` | 单页样板 |
