# CRUD 设计说明

## 结论先行

阶段一里，CRUD 不能被定义为“任意 SQL 自动可写”。

对于一个 SQL-first 的 web 客户端来说：

- 查询能力可以直接来自任意 SQL
- 但写能力必须建立在更稳定的实体语义之上

所以 CRUD 是否启用，必须看是否已经识别出一个稳定可写的实体，而不是只看“有 SQL”。

## 为什么纯 SQL 模板下 CRUD 有缺陷

SQL 结果集可能来自：

- 单表直接查询
- 多表 join
- 子查询
- 聚合查询
- 计算列
- 视图

这些情况里，很多结果集根本不具备“安全回写原表”的条件。

如果系统仅凭结果列就默认开启新增/编辑/删除，会出现几个问题：

- 不知道应该写回哪张表
- 不知道哪一列是真主键
- join 结果可能一行对应多张表
- 聚合结果没有可逆写入路径
- SQL alias 会掩盖真实字段

## 阶段一推荐规则

### 只读模式

默认情况下，只要有 SQL，就应该先能展示表格。

这是第一阶段必须成立的最小能力。

### 可写模式

只有满足下面条件时，才应该启用 CRUD：

1. `QueryModel` 明确绑定单一 `anchor entity`
2. `EntityModel` 明确声明主键
3. 查询结果包含主键
4. 写回目标表明确
5. 不是聚合/汇总/不可逆结果集

## 阶段一建议的开关策略

### 推荐做法

- 默认 `create/edit/delete = false`
- 只有通过校验后，才自动或手动启用

### 不推荐做法

- 只要 entity 存在就直接启用
- 只要查询结果里有 `id` 字段就直接启用
- 直接把“web SQL 客户端”理解成“通用低代码写库引擎”

## 产品表达建议

对外讲法应该明确：

- 第一阶段主卖点：`SQL-first Smart Grid`
- 第二阶段增强：`Entity-aware CRUD`

这样产品叙事就清楚了，不会让阶段一背上过重的通用写能力目标。

## 后续开发建议

后续如果继续做 CRUD，建议补一个显式能力：

- `Can this query be writable?`

由系统根据以下信息判断：

- anchor entity
- primary key
- query shape
- result columns
- page mode

输出：

- `readonly`
- `single-entity writable`
- `requires custom action`

这样比单纯暴露三个 `create/edit/delete` 开关更稳。
