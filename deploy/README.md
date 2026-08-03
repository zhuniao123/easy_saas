# easy_saas 演示部署（纯 HTTP / IP，无域名）

适用于讲解环境：`http://<服务器IP>:8080/`  
**不依赖 HTTPS、域名、Cloudflare。**

## 机器要求

- Docker + Docker Compose 插件
- 建议 ≥2GB 内存（本方案用预构建 jar + dist，避免在服务器上跑 Maven/Node 编译）
- 放行 **TCP 8080**（80 若已被占用可继续用 8080）

## 方式 A：服务器上从 Git 拉代码后构建（网络好时）

```bash
git clone git@github.com:zhuniao123/easy_saas.git /opt/easy_saas
# 或 https://github.com/zhuniao123/easy_saas.git
cd /opt/easy_saas

# 本机有 Java17 + Maven + Node20 时：
cd backend && mvn -DskipTests package && cd ..
cd frontend && npm ci && npm run build && cd ..

cd deploy
chmod +x *.sh
docker compose -f docker-compose.demo.yml up -d
# 等 API 起来后
bash install-demos.sh
```

访问：`http://<IP>:8080/`  
登录：`owner` / `owner123`

## 方式 B：本机构建产物，再 scp 到服务器（服务器内存小/编译慢）

在开发机：

```bash
cd backend && mvn -DskipTests package
cd ../frontend && npm ci && npm run build
```

上传：

```bash
# 目录结构需保持：
# /opt/easy_saas/backend/target/lowcode-1.0.0.jar
# /opt/easy_saas/frontend/dist/
# /opt/easy_saas/deploy/
# /opt/easy_saas/demos/

rsync -avz deploy demos backend/target/lowcode-1.0.0.jar \
  root@<IP>:/opt/easy_saas/
# frontend dist 单独同步
rsync -avz frontend/dist/ root@<IP>:/opt/easy_saas/frontend/dist/
```

服务器：

```bash
cd /opt/easy_saas/deploy
docker compose -f docker-compose.demo.yml up -d
bash install-demos.sh
```

## 方式 C：一键脚本（已在服务器目录时）

```bash
cd /opt/easy_saas/deploy
bash remote-up.sh
```

## 讲解建议入口

| 页面 code | 用途 |
|-----------|------|
| `beauty_salon_guide` | 业务导览 |
| `beauty_front_desk` | 三栏工作台；**点左栏会员 → 开单带入** |
| `beauty_order_md` | 主从开单（草稿/提交） |
| `beauty_card_wizard` | 开卡向导（真写入卡与余额） |
| `dash_lite_home` | Dashboard 栅格 |
| 工厂模板 | `workspace_lite` / `wizard_lite` / `dashboard_lite` |

## 运维

```bash
cd /opt/easy_saas/deploy
docker compose -f docker-compose.demo.yml ps
docker compose -f docker-compose.demo.yml logs -f backend
docker compose -f docker-compose.demo.yml down    # 停
docker compose -f docker-compose.demo.yml down -v # 停并清空库
```

## 说明

- 对外只有 **HTTP**，不要配强制 HTTPS。
- `nginx.demo.conf` 把 `/api/` 反代到 backend:8081，前端静态走 dist。
- Demo SQL：`install-demos.sh` 会装 beauty_salon、simple_tour、dashboard_lite、master_detail、slice_lab 等。
