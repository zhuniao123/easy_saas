# MasterDetail Demo（Slice 8）

头表 + 明细行同屏编辑；**保存草稿 / 整单提交** 走同一数据库事务。

## 安装

```bash
docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/master_detail/install.sql
```

## 页面

| page_code | 说明 |
|-----------|------|
| `md_order_guide` | 导览 |
| `md_order_workbench` | 服务订单主从工作台 |

## 验收路径

1. 打开 `md_order_workbench`
2. **新建** → 填单号、会员 → **添加明细**（多项目/员工）
3. **保存草稿** → 列表出现单据；再打开可改行
4. **整单提交** → 状态 `submitted`，编辑器只读
5. （可选）两浏览器并发改同一草稿再保存 → 乐观锁 CONFLICT

## API

```http
POST /api/v1/pages/{pageCode}/master-detail/save
{
  "mode": "draft" | "submit",
  "header": { "id"?: number, "order_no": "...", "member_name": "...", "version": 1 },
  "lines": [
    { "_rowState": "added", "service_name": "...", "staff_name": "...", "qty": 1, "unit_price": 100, "amount": 100 },
    { "_rowState": "modified", "id": 3, "qty": 2, ... },
    { "_rowState": "deleted", "id": 4 }
  ]
}
```

## 配置要点

```json
"masterDetail": {
  "enabled": true,
  "header": { "entityCode": "...", "loadQueryCode": "...", "versionField": "version", "requiredMemberField": "member_name" },
  "lines": { "entityCode": "...", "fkField": "order_id", "loadQueryCode": "..." }
}
```

平台通用服务 `MasterDetailService`，不写业务 Domain。
