# 模型边界

## 目标

厘清 `QueryModel`、`PageModel`、`EntityModel` 三者的职责，避免配置重叠。

## 推荐边界

### QueryModel

负责数据来源：

- `queryCode`
- `sqlText`
- 参数
- 基础分页/排序入口

一句话：`QueryModel` 回答“数据从哪来”。

### PageModel

负责页面展示与交互编排：

- 列显示顺序
- 页面上的列标题
- 页面过滤器
- 页面动作
- 分页配置
- 空态、描述、多语言覆盖
- 配置态/运行态布局

一句话：`PageModel` 回答“页面怎么呈现”。

### EntityModel

负责实体语义和通用行为：

- `tableName`
- 主键
- 默认 label 字段
- 默认 id 字段
- 审计字段
- 只读字段
- 字典字段
- 引用关系
- CRUD 所需的稳定约束

一句话：`EntityModel` 回答“这条数据在业务上是什么”。

## 当前问题

如果 `EntityModel.fields` 既定义字段类型，又定义页面列标题，而 `PageModel.columns` 也定义列标题，那么就会出现职责重叠。

这会导致：

- `EntityModel` 退化成默认列名配置
- `PageModel` 和 `EntityModel` 难以分工
- 自动生成配置时不清楚该写哪一层

## 推荐优先级

前端渲染读取优先级建议固定为：

`PageModel.columns > EntityModel.fields > SQL introspect`

解释：

- 页面上的最终展示，优先听 `PageModel`
- 如果页面没写，再落回 `EntityModel`
- 如果两者都没写，再用 SQL/数据库自动推导

## EntityModel 的正确演化方向

`EntityModel` 不应该只是：

- `field`
- `label`
- `type`

它应该演化为更完整的实体描述，例如：

- `idColumnName`
- `labelAttr`
- `autoIncrementField`
- `service`
- `description`
- `fields[*].readonly`
- `fields[*].dictionary`
- `fields[*].audit`
- `fields[*].required`

这样它才是真正的“实体模型”，而不是另一份页面列配置。
