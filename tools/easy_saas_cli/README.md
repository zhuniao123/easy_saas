# easy_saas CLI（原型 v0）

供 **人 / AI Agent** 通过 HTTP API 创建与配置页面，不写业务 Java。

## 安装

无额外依赖（Python 3.10+ 标准库）。

```bash
cd /root/saas-demo
chmod +x tools/easy_saas_cli/easy_saas_cli.py

export EASY_SAAS_URL=http://127.0.0.1:8081
export EASY_SAAS_USER=owner
export EASY_SAAS_PASSWORD=owner123
```

可选软链：

```bash
ln -sf "$(pwd)/tools/easy_saas_cli/easy_saas_cli.py" /usr/local/bin/easy-saas-cli
```

## 命令

| 命令 | 作用 |
|------|------|
| `templates` | 列出工厂模板 |
| `list-pages` | 页面列表 |
| `create` | 按模板建页 |
| `get-page` | 读页面配置 |
| `configure-page` | 提交 page DSL JSON |
| `configure-query` | 更新 SQL |
| `configure-entity` | 更新 entity fields |
| `apply` | **AI 主路径**：整份 page-spec |

## AI 一键

```bash
python3 tools/easy_saas_cli/easy_saas_cli.py apply \
  --spec .grok/skills/ai-page-scaffold/templates/example-page-spec.json
```

契约：`.grok/skills/ai-page-scaffold/references/page-spec-v0.md`  
Agent 技能：`/ai-page-scaffold`

## 预留（后续版本）

- 幂等 upsert、dry-run  
- 表结构 introspect 生成 spec  
- `dataSourceCode` 路由  
- 官方 `easy-saas` 发行包  

见 `docs/wiki/v1.5-to-2.0-summary-and-todos.md` Track G。
