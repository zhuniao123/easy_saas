# 小店 SaaS 完整多页面 Demo

用 **纯 SQL + 元数据** 堆积木配置的小贩售店业务（1.x 能力边界内）。

## 安装

```bash
docker exec -i saas-demo-postgres psql -U lowcode -d lowcode \
  < demos/shop_saas/install.sql
```

刷新前端页面列表即可（侧栏按 `/shop/*` 归到 **Shop** 分组）。

## 页面清单（8 页）

| 页面 | route | 能力 |
|------|--------|------|
| 商品台账 | `/shop/products` | CRUD、停用/启用、钻取流水/销售 |
| 客户 | `/shop/customers` | CRUD、钻取客户销售 |
| 供应商 | `/shop/suppliers` | CRUD、钻取采购 |
| 库存流水 | `/shop/stock-moves` | 流水台账 + 手工登记 |
| 采购明细 | `/shop/purchases` | 明细行 CRUD、**确认入库**事务、同单钻取 |
| 销售明细 | `/shop/sales` | 明细行 CRUD、**确认出库**事务（校验库存）、同单钻取 |
| 低库存预警 | `/shop/low-stock` | 只读 SQL 视图 |
| 今日销售 | `/shop/today-sales` | 只读 SQL 视图 |

## 推荐演示路径

1. 打开 **低库存预警** → 看到矿泉水等缺口  
2. **采购明细** → 对草稿行点 **确认入库** → 库存增加、流水多一条 IN  
3. **销售明细** → 对草稿行点 **确认出库** → 库存扣减、流水 OUT；库存不足会 assert 失败  
4. **商品台账** → 行上 **流水** / **销售** 抽屉  
5. **客户** → **销售记录** 钻取  
6. **SQL Repo** → 查看 `sql_shop_*` / `q_shop_*` 资产  

## 1.x 边界说明

- **不是**主副表：采购/销售用「明细行 + 单号」模拟一单多行，用 `openQuery` 看同单。  
- **真·确认过账**已用 `sqlTransaction` + 仓库 `sqlAssetCode` 实现（行级）。  
- 完整头行同屏编辑 → 2.0 `masterDetailTemplate`。

## 与 product_ledger demo 关系

可并存。`shop_*` 为完整小店包；旧 `product_ledger` / `demo_product` 可保留作单页样板。
