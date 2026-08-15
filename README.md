# dsh-fabric

> **Fabric — the everything-is-a-plugin primitive** for [DeepSeek Harness](https://github.com) (`dsh`).

DSH 的每一项能力本身就是一个插件：Service、Tool、Skill、Command、Prompt Section、Event Listener、LLM Adapter、Subagent Provider、Web Route、Settings Namespace、Projection……但此前「制造插件」这件事并不在运行时里——它只能靠开发者用特殊工具来完成。

**Fabric 把这个缺口补上了：它让「扩展运行时」本身成为一个可编程、可查询、可组合的运行时原语。** 一套声明式 DSL 统一了所有可扩展接缝，并让「插件扩展插件」成为现实。

---

## Overview

**解决什么问题**：在 DSH 中给运行时添加能力（新工具、新技能、新提示段、新事件监听、新 LLM 适配器、新子代理、新 Web 路由……）过去每条接缝都有一套不同的注册 API 和生命周期。Fabric 把它们收敛成**一套声明式 DSL + 一个 `fabric` Service + 两个模型工具**，让「扩展」本身变成可编程、可查询、可撤销的运行时原语。

**适合谁**：

- **DSH 插件开发者**：写一个插件就能通过 `ctx.get('fabric').register({...})` 注册任何带代码的扩展，并被统一追踪、统一清理。
- **模型 / 用户**：在对话中用 `fabric_extend` 工具即时注册纯声明式扩展（技能、提示段、变量），无需改文件。
- **想观察「当前运行时挂了哪些能力」的人**：`fabric_inspect` / 能力图谱 UI 给出实时 census。

**三条交付通道**：

| 通道 | 能力 | 使用者 |
| --- | --- | --- |
| `ctx.provide('fabric')` **Service** | `register` / `list` / `get` / `remove` / `graph` / `schema`，支持**带代码的扩展** | 其它插件（递归：插件扩展插件） |
| `fabric_extend` / `fabric_inspect` **模型工具** | 对话中即时注册纯声明式扩展、查看能力图谱 | 模型 |
| **prompt section + `fabric-dsl` skill** | 把 DSL 文档本身也作为插件注入，自描述闭环 | 所有人 |

---

## Compatibility

| 项 | 值 |
| --- | --- |
| 验证的 DSH 主包 | `@deepseek-ai/dsh@0.1.0-rc.6` |
| 验证的依赖 | `@deepseek-ai/dsh-tools@0.1.0-rc.6`（peerDependency） |
| 最后验证日期 | 2026-08-15（冒烟测试通过） |
| 验证方式 | 语法检查 + mock-ctx 冒烟测试（fabric Service 全方法、工具注册、递归注册、代码 kind 从 JSON 拒绝、schema 文档） |

> 尚未在真实 DSH 进程中做端到端运行实测（加载 + 工具调用）；已通过静态语法检查与 mock 上下文冒烟测试。若你在别的 DSH 版本上验证过，欢迎反馈。

---

## Install / Uninstall

### 安装（本机 web profile，link 方式）

> 注意：不要用 `dsh plugin --profile web add ./dir`，它会把本地目录当 git 源解析而失败。用 `link:` 手动写入。

1. 编辑 `/home/kevin/.dsh/profiles/web/package.json`：
   - `dependencies` 加：`"dsh-fabric": "link:/path/to/dsh-fabric"`
   - `dsh.profile.bundles` 数组加：`"dsh-fabric"`
2. 在 profile 目录执行：
   ```bash
   export PATH=/home/kevin/.local/lib/nodejs/node-v24.19.0-linux-x64/bin:$PATH
   cd /home/kevin/.dsh/profiles/web && pnpm install
   ```
3. 验证：`dsh --profile web --dump-config` 能看到 `# == dsh-fabric` 层。
4. **重启 host 进程**使 Host + Client 半生效。

### 升级

- 更新本地目录后，在 profile 目录重跑 `pnpm install`（link 包会指向同一路径，重启 host 即生效）。
- 从 Git 拉取后同上。

### 禁用（临时）

- 从 `dsh.profile.bundles` 数组中移除 `"dsh-fabric"`，`pnpm install` 后重启；或直接停掉对应 host 进程。

### 彻底移除

1. 从 profile `package.json` 的 `dependencies` 和 `dsh.profile.bundles` 中删除 `dsh-fabric`。
2. `pnpm install` 后重启 host。
3. 如需删除本地源码，删除 `dsh-fabric` 目录即可（Fabric 不写任何持久化状态，无残留数据）。

---

## Quick start

### 1. 插件代码：注册一个带代码的新工具

```js
// 在任意插件的 apply(ctx) 里
const fabric = ctx.get('fabric')
if (!fabric) return

fabric.register({
  kind: 'tool',
  name: 'hello_fabric',
  description: 'A tool born from another plugin via the Fabric DSL.',
  parameters: { who: { type: 'string' } },
  execute: async (args) => ({ hello: (args && args.who) || 'world' }),
})
```

### 2. 模型工具：对话中即时注入能力

```
fabric_extend({ definitions: [
  { kind: 'promptVariable', name: 'myvar', value: 'hello' },
  { kind: 'promptSection', name: 'my-rules', order: 800, text: 'Always be concise.' },
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

### 支持的接缝（14 种）

| kind | needsCode | 用途 |
| --- | --- | --- |
| `tool` | ✅ | 注册模型工具（`name` / `description` / `parameters` / `execute`） |
| `skill` | ❌ | 注册技能（`name` / `description` / `whenToUse` / `content`） |
| `command` | ✅ | 注册人工命令（`name` / `description` / `handler` / `input?` / `recordInput?`） |
| `promptSection` | ❌ | 注入持久提示段（`name` / `order` / `text`） |
| `promptContext` | ❌ | 注入动态上下文（`name` / `order` / `text`） |
| `promptVariable` | ❌ | 注册提示变量（`name` / `value`） |
| `eventListener` | ✅ | 监听事件（`event` / `listener`） |
| `llmAdapter` | ✅ | 注册 LLM 适配器（`providers` / `adapter`） |
| `subagentProvider` | ✅ | 注册子代理提供者（`provider`） |
| `webRoute` | ✅ | 注册 Web 路由（`route`） |
| `settingsNamespace` | ✅ | 注册设置命名空间（`ns` / `schema` / `options`） |
| `projection` | ✅ | 注册会话投影（`definition`） |
| `blueprint` | ✅ | 注册插件蓝图到 Foundry（`id`/`name`/`category`/`description`/`whenToUse`/`params`/`render`，需 `dsh-foundry`） |
| `service` | ✅ | （`ctx.provide` 已内置，用于发布 Service） |

> 带 ✅ 的 kind 携带可执行代码，必须由插件代码通过 `ctx.get('fabric').register(...)` 注册；带 ❌ 的 kind 是纯声明式，模型可直接用 `fabric_extend` 工具注册。精确字段契约见 `fabric_inspect({ detail: 'schema' })`。

---

## Configuration

Fabric **零配置**：无配置项、无环境变量、无敏感项（无 API key / token / 凭据）。

- `fabric` Service 与工具名称固定，无法重命名。
- 无持久化状态；所有运行时扩展在插件停止时自动 dispose。

---

## Permissions & data

| 类别 | 说明 |
| --- | --- |
| 文件系统 | **不读写任何文件** |
| 网络 | 在 DSH 自带 web server 上注册一个只读路由 `GET /fabric/census`，返回能力计数（tools/skills/fabric 扩展数）+ 接缝列表 + 已注册扩展的 id/kind/name。Client 半 UI 仅 fetch 该路由 |
| 凭据 | 不读取、不存储任何凭据 |
| 用户数据 | **不读取会话内容**；census 只含计数与扩展元数据（id/kind/name），不含消息、文件内容或个人信息 |
| 进程内副作用 | 通过 `ctx.provide` / `ctx.effect` / `ctx.on` 注册，全部随插件 fiber 回收 |

---

## Troubleshooting

| 现象 | 原因 / 处理 |
| --- | --- |
| `fabric service not found` | Fabric bundle 未装入 bundles 或未 `pnpm install`；按安装步骤检查 `dump-config` |
| `kind 'tool' carries executable code and cannot come from JSON` | 你通过 `fabric_extend`（JSON）传了带 `execute` 的 tool；代码 kind 必须走插件代码 `ctx.get('fabric').register(...)` |
| pnpm 报 peer 依赖缺失（`@deepseek-ai/dsh-tools`） | 确保 profile 能解析 dsh-tools；link 包不会自动装 peer，需在 profile `dependencies` 显式声明 `@deepseek-ai/dsh-tools` |
| Client 能力图谱页空白或报错 | host 进程可能未重启（Client 半在启动时进 boot 图）；`curl http://127.0.0.1:<port>/fabric/census` 确认路由可用 |
| 想回滚 | 从 `dsh.profile.bundles` 移除 `"dsh-fabric"`，`pnpm install` 后重启；源码目录可直接 `git checkout <commit>` |

---

## Development

- **无构建步骤**：Host 半是标准 Cordis ESM（`index.js`），Client 半是经典 script 自注册 bundle（`client.js`），均纯手写、无需 bundler。
- **语法检查**：`node --check index.js && node --check client.js`。
- **冒烟测试**（mock ctx，无需真实进程，仓库内 `smoke-test.mjs`）：
  ```bash
  node smoke-test.mjs
  ```
  覆盖：fabric Service 全方法、`fabric_extend`/`fabric_inspect` 注册、递归注册 tool、代码 kind 从 JSON 拒绝、`graph`/`list`/`remove`、schema 文档。
- **贡献**：Fork 本仓库，改 `index.js` / `client.js`，跑冒烟测试后提 PR。注意：动态插件的 `harness.*` API 与正式 bundle 的 `ctx.tools.register(defineTool(...))` 不同，勿混用。

---

## License & security

- **许可证**：[MIT](./LICENSE)。
- **安全报告**：如发现安全问题，请通过 GitHub 的 **private vulnerability reporting**（仓库 `Security` 标签 → `Report a vulnerability`）私下报告，不要公开 issue。
