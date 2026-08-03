# Domain 代码边界：通用性 / 组件性

> 原则：**能配置就不写 Domain；若必须写代码，只做跨行业可复用的组件/SPI，禁止垂直业务 Service。**

## 1. 禁区（反模式）

```text
❌ BeautyOrderService.approve()
❌ HairSalonDayCloseService
❌ SessionCardConsumeController（写死美发字段）
❌ 在 PageLoader 里 if (pageCode.startsWith("beauty_"))
```

这些会把平台锁死在一个垂直行业，后续美甲/汽修/诊所全部 fork。

## 2. 优先路径（按顺序）

| 优先级 | 手段 | 适用 |
|--------|------|------|
| P0 | SQL + Page/Query/Entity 配置 | 台账、只读、筛选 |
| P0 | `sqlTransaction` Action + assert | 审单、过账、核销、日结 |
| P0 | masterDetail / workspace / wizard 壳 | 单据编辑、前台、开卡步骤 |
| P1 | 发布态 JS Page Controller | 联动、预填、提示（不写权威账） |
| P1 | Groovy hook / Dynamic Endpoint | 编排、校验增强、出插件 payload |
| P2 | **通用 Java 组件/SPI** | 多行业重复出现的基础设施 |
| 禁止 | 行业 Domain Service | — |

## 3. 店务概念 → 通用能力映射

| 店务说法 | 平台通用说法 | 实现载体 |
|----------|--------------|----------|
| 审单 | 单据状态迁移 + 权限 | Action `assert` 原状态 + `UPDATE` 新状态 |
| 改单 | 可编辑态恢复 / 红冲 | Action：`approved → draft` 或新单冲销（配置策略） |
| 次卡核销 | **账户扣减 + 流水** | 余额/次数字段 + consume Action + ledger 表 |
| 储值开卡 | 账户入账 | 已有 open_card 模式 |
| 日结 | 批量锁定 + 汇总单据 | close 头表 + 批量 `UPDATE` 业务日 |
| 前台 | 多查询工作台 | workspace 壳 |
| 开卡流程 | 分步采集 + 一次过账 | wizard + finishAction |

**没有「美发流程引擎」**；有的是 **状态机式 Action 目录 + 账户式 SQL**。

## 4. 若必须写 Java：组件化检查清单

只有同时满足才允许加代码：

1. **去行业词**：命名用 `Document` / `Ledger` / `Settlement`，不用 `Beauty` / `Hair`  
2. **配置驱动**：状态转移表、账户字段、业务日字段来自元数据或 Action 配置，不写死  
3. **可单测**：不依赖具体表名时可注入 Dialect/SQL 模板  
4. **可替换**：实现落在 SPI（如 `LedgerPostingHandler`），默认实现可禁用  
5. **不挡 SQL 主路径**：权威仍在 DB 事务；Java 不另起一套账  

示例（允许的方向，非必须立刻实现）：

```text
✅ StatusTransitionAction（读 lc_action 配置：from/to/assertSql/writeSql）
✅ LedgerConsumeAction（通用：accountTable, balanceField, logTable）
✅ DayCloseAction（通用：bizDateParam, lockSql, summarySql）
❌ BeautyApproveService
```

## 5. Demo 约定

`demos/beauty_salon` 中的 `beauty_*` **表名可以行业化**（演示数据模型），  
但 **平台代码与 Action 模式必须可抄到别的行业**：只换表名/SQL 资产，不换引擎。

## 6. 与简道云类产品的边界话术

- 简道云：表单/流程中心，适合审批与轻逻辑。  
- 本平台：台账/单据/账户事务中心，适合审单规则、次卡流水、日结锁定。  
- 复杂店务 **不是靠更重的 BPM**，而是靠 **更清晰的状态 + 事务 Action + 账户模型**。
