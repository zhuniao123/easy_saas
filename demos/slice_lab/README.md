# Slice Lab（验收样例页）

用于手动观察 Slice 2–6 能力，不依赖业务表。

## 安装

```bash
# 后端已启动时
docker exec -i saas-demo-postgres psql -U lowcode -d lowcode < demos/slice_lab/install.sql

# 刷新权限目录（owner）
TOKEN=$(curl -s -X POST http://127.0.0.1:8081/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"loginName":"owner","password":"owner123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s -X POST http://127.0.0.1:8081/api/v1/admin/rbac/refresh-catalog \
  -H "Authorization: Bearer $TOKEN"
```

## 页面

| page_code | 路由 | 观察点 |
|-----------|------|--------|
| `slice_lab_guide` | `/demo/slice-lab` | 导览 |
| `slice_charts_lab` | `/demo/slice-charts` | stat/bar/line/pie/text + grid + controller |
| `slice_complex_sql` | `/demo/slice-complex-sql` | JOIN/CTE/UNION 只读 + countSql |
| `slice_controller_lab` | `/demo/slice-controller` | probe + bar + rowClick toast |

## 账号

- `owner` / `owner123`
- `clerk` / `clerk123`（若无 page 权限，用 owner）

## 动态端点冒烟

```bash
curl -s -X POST http://127.0.0.1:8081/api/v1/dynamic/ep_slice_echo \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"message":"hi","n":3}'
```
