# dsh-fabric

> **Fabric — the everything-is-a-plugin primitive** for [DeepSeek Harness](https://github.com) (`dsh`).

DSH 的每一项能力本身就是一个插件：Service、Tool、Skill、Command、Prompt Section、Event Listener、LLM Adapter、Subagent Provider、Web Route、Settings Namespace、Projection…… 但此前**「制造插件」这件事并不在运行时里**——它只能靠开发者用特殊工具来完成。

**Fabric 把这个缺口补上了：它让「扩展运行时」本身成为一个可编程、可查询、可组合的运行时原语。** 一套声明式 DSL 统一了所有可扩展接缝，并让"插件扩展插件"成为现实。

---

## 三条交付通道

| 通道 | 能力 | 使用者 |
| --- | --- | --- |
| `ctx.provide('fabric')` **Service** | `register` / `list` / `get` / `remove` / `graph` / `schema`，支持**带代码的扩展** | 其它插件（递归：插件扩展插件） |
| `fabric_extend` / `fabric_inspect` **模型工具** | 对话中即时注册纯声明式扩展、查看能力图谱 | 模型 |
| **prompt section + `fabric-dsl` skill** | 把 DSL 文档本身也作为插件注入，自描述闭环 | 所有人 |

---

## DSL：支持的全部接缝

| kind | needsCode | 用途 |
| --- | --- | --- |
| `tool` | ✅ | 注册模型工具（`name` / `description` / `parameters` / `execute`） |
| `skill` | ❌ | 注册技能（`name` / `description` / `whenToUse` / `content`） |
| `command` | ❌ | 注册人工命令（`CommandDefinition`） |
| `promptSection` | ❌ | 注入持久提示段（`name` / `order` / `text`） |
| `promptContext` | ❌ | 注入动态上下文（`name` / `order` / `text`） |
| `promptVariable` | ❌ | 注册提示变量（`name` / `value`） |
| `eventListener` | ✅ | 监听事件（`event` / `listener`） |
| `llmAdapter` | ✅ | 注册 LLM 适配器（`providers` / `adapter`） |
| `subagentProvider` | ✅ | 注册子代理提供者（`provider`） |
| `webRoute` | ✅ | 注册 Web 路由（`route`） |
| `settingsNamespace` | ❌ | 注册设置命名空间（`ns` / `schema` / `options`） |
| `projection` | ❌ | 注册会话投影（`definition`） |
| `service` | ✅ | （`ctx.provide` 已内置，用于发布 Service） |

> 带 `✅` 的 kind 携带可执行代码，必须由插件代码通过 `ctx.get('fabric').register(...)` 注册；带 `❌` 的 kind 是纯声明式，模型可直接用 `fabric_extend` 工具注册。

---

## 用法

### 1. 插件代码（递归：插件扩展插件）

```js
export function apply(ctx) {
  const fabric = ctx.get('fabric')
  if (!fabric) return

  // 注册一个带代码的新工具
  fabric.register({
    kind: 'tool',
    name: 'my_tool',
    description: 'A tool born from another plugin.',
    parameters: { message: { type: 'string' } },
    execute: async (args) => ({ echo: args.message }),
  })

  // 批量注册 + 查看结果
  const results = fabric.register([
    { kind: 'promptSection', name: 'my-rules', order: 800, text: 'Always be concise.' },
    { kind: 'skill', name: 'my-skill', description: '...', whenToUse: '...', content: '...' },
  ])
}
```

### 2. 模型工具（对话中即时扩展）

```
fabric_extend({ definitions: [
  { kind: 'skill', name: 'foo-bar', description: '...', whenToUse: '...', content: '# Foo\n...' },
  { kind: 'promptVariable', name: 'myvar', value: 'hello' },
]})

fabric_inspect({ detail: 'census' })   // 查看能力图谱
fabric_inspect({ detail: 'schema' })   // 查看 DSL 文档
```

### 3. Service API

```js
const fabric = ctx.get('fabric')
fabric.register(def | def[])   // -> [{ id, ok, kind, name, error? }]
fabric.list()                  // -> [{ id, kind, name, event }]
fabric.get(id) / fabric.remove(id)
fabric.graph()                 // -> { census: { tools, fabricExtensions }, seams, fabricExtensions }
fabric.schema()                // -> DSL 文档
```

---

## 安装

本机 web profile（`link:` 方式，勿用 `dsh plugin add`）：

1. 编辑 `/home/kevin/.dsh/profiles/web/package.json`：
   - `dependencies` 加 `"dsh-fabric": "link:/path/to/dsh-fabric"`
   - `dsh.profile.bundles` 数组加 `"dsh-fabric"`
2. 在该目录跑 `pnpm install`
3. 验证：`dsh --profile web --dump-config` 能看到 `# == dsh-fabric 层`

---

## 许可证

MIT
