import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'fabric'

// 只要 apply 里用了 ctx.tools / ctx.webServer 就必须声明 inject(标准 Cordis 硬依赖)
export const inject = ['tools', 'webServer']

// ============================================================
// Fabric — the everything-is-a-plugin primitive
//
// 把 DSH 每一种可扩展"接缝"统一成一套声明式 DSL,让"扩展运行时"
// 本身变成一个运行时原语。三条交付通道:
//   1. ctx.provide('fabric', service)  —— 其它插件可用 ctx.get('fabric')
//      注册带代码的扩展(tool / eventListener / ...),实现"插件扩展插件"。
//   2. fabric_extend / fabric_inspect    —— 模型工具,对话中即时注册
//      纯声明式扩展(skill / promptSection / promptContext / promptVariable)
//      并查看能力图谱。
//   3. prompt section + fabric-dsl skill —— 把 DSL 文档本身也作为插件注入,
//      形成自描述闭环。
// ============================================================

// ---- 所有接缝目录(部分已实现实例化,其余见 instantiate) ----
const SEAMS = [
  'tool',
  'skill',
  'command',
  'promptSection',
  'promptContext',
  'promptVariable',
  'eventListener',
  'llmAdapter',
  'subagentProvider',
  'webRoute',
  'settingsNamespace',
  'projection',
  'service',
]

export function apply(ctx) {
  const systemPrompt = ctx.get('systemPrompt')
  const skills = ctx.get('skills')

  // ---- 运行时扩展账本:id -> { id, kind, name, event, dispose } ----
  const ledger = new Map()
  let seq = 0
  const nextId = () => 'fx' + (++seq)

  // 归一化不同 registry 返回的 disposer:函数 / {dispose} / {stop} / {close} / 无
  function normalizeDisposer(raw) {
    if (typeof raw === 'function') return raw
    if (raw && typeof raw.dispose === 'function') return () => raw.dispose()
    if (raw && typeof raw.stop === 'function') return () => raw.stop()
    if (raw && typeof raw.close === 'function') return () => raw.close()
    return () => {}
  }

  // 插件停止时 dispose 所有运行时注册的扩展
  ctx.effect(() => () => {
    for (const rec of ledger.values()) {
      try { rec.dispose() } catch (e) { /* noop */ }
    }
    ledger.clear()
  })

  // ---- 把一个声明式扩展实例化到它对应的真实 registry ----
  function instantiate(def) {
    if (!def || typeof def !== 'object') throw new Error('extension definition must be an object')
    const kind = def.kind
    if (kind === 'tool') {
      if (typeof def.execute !== 'function') {
        throw new Error("kind 'tool' carries executable code and cannot come from JSON; register it from plugin code via ctx.get('fabric').register(...)")
      }
      return ctx.tools.register(defineTool({
        name: def.name,
        description: def.description || '',
        parameters: def.parameters || {},
        output: {
          schema: { type: 'json' },
          render: (_a, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        },
        execute: def.execute,
      }))
    }
    if (kind === 'skill') {
      if (!skills) throw new Error('skills service unavailable')
      return skills.register({
        name: def.name,
        description: def.description || '',
        whenToUse: def.whenToUse || '',
        content: def.content || '',
        source: 'runtime',
      })
    }
    if (kind === 'promptSection') {
      if (!systemPrompt) throw new Error('systemPrompt service unavailable')
      return systemPrompt.section({
        name: def.name,
        order: typeof def.order === 'number' ? def.order : 500,
        text: def.text,
      })
    }
    if (kind === 'promptContext') {
      if (!systemPrompt) throw new Error('systemPrompt service unavailable')
      return systemPrompt.context({
        name: def.name,
        order: typeof def.order === 'number' ? def.order : 500,
        text: def.text,
      })
    }
    if (kind === 'promptVariable') {
      if (!systemPrompt) throw new Error('systemPrompt service unavailable')
      const value = def.value
      return systemPrompt.variable(def.name, () => value)
    }
    if (kind === 'eventListener') {
      if (typeof def.listener !== 'function') {
        throw new Error("kind 'eventListener' carries executable code and cannot come from JSON")
      }
      return ctx.on(def.event, def.listener)
    }
    // ---- 扩展接缝:command / llmAdapter / subagentProvider / webRoute / settingsNamespace / projection ----
    if (kind === 'command') {
      const commands = ctx.get('commands')
      if (!commands) throw new Error('commands service unavailable')
      return commands.register(def.command)
    }
    if (kind === 'llmAdapter') {
      const llm = ctx.get('llm')
      if (!llm) throw new Error('llm service unavailable')
      return llm.registerAdapter(def.providers, def.adapter)
    }
    if (kind === 'subagentProvider') {
      const subagents = ctx.get('subagents')
      if (!subagents) throw new Error('subagents service unavailable')
      return subagents.registerProvider(def.provider)
    }
    if (kind === 'webRoute') {
      const webServer = ctx.get('webServer')
      if (!webServer) throw new Error('webServer service unavailable')
      return webServer.register(def.route)
    }
    if (kind === 'settingsNamespace') {
      const settings = ctx.get('settings')
      if (!settings) throw new Error('settings service unavailable')
      return settings.register(def.ns, def.schema, def.options)
    }
    if (kind === 'projection') {
      const projections = ctx.get('sessionProjections')
      if (!projections) throw new Error('sessionProjections service unavailable')
      return projections.register(def.definition)
    }
    throw new Error('unsupported kind: ' + kind + ' (supported: ' + SEAMS.join(', ') + ')')
  }

  const registerExt = (input) => {
    const defs = Array.isArray(input) ? input : [input]
    const results = []
    for (const def of defs) {
      const id = nextId()
      try {
        const dispose = normalizeDisposer(instantiate(def))
        ledger.set(id, {
          id,
          kind: def && def.kind,
          name: (def && def.name) || null,
          event: (def && def.event) || null,
          dispose,
        })
        results.push({ id, ok: true, kind: def && def.kind, name: (def && def.name) || null })
      } catch (e) {
        results.push({ id, ok: false, kind: def && def.kind, name: (def && def.name) || null, error: String((e && e.message) || e) })
      }
    }
    return results
  }

  const listExt = () => {
    const out = []
    for (const rec of ledger.values()) out.push({ id: rec.id, kind: rec.kind, name: rec.name, event: rec.event })
    return out
  }

  const getExt = (id) => {
    const rec = ledger.get(id)
    return rec ? { id: rec.id, kind: rec.kind, name: rec.name, event: rec.event } : null
  }

  const removeExt = (id) => {
    const rec = ledger.get(id)
    if (!rec) return { ok: false, error: 'no extension with id ' + id }
    try { rec.dispose() } catch (e) { /* noop */ }
    ledger.delete(id)
    return { ok: true, id }
  }

  const schema = () => ({
    purpose: 'Fabric unifies every DSH extensibility seam (tool / skill / command / prompt section / context / variable / event listener / llm adapter / subagent provider / web route / settings namespace / projection / service) behind one declarative DSL, so extending the runtime becomes a runtime primitive.',
    kinds: [
      { kind: 'tool', needsCode: true, shape: { name: 'string (required)', description: 'string', parameters: 'ParameterSchemaSpec DSL', execute: 'async (args, exec) => json' } },
      { kind: 'skill', needsCode: false, shape: { name: 'kebab-case (required)', description: 'string (required)', whenToUse: 'string?', content: 'markdown' } },
      { kind: 'command', needsCode: true, shape: { command: { name: 'string', description: 'string', handler: '(invocation) => {kind:"success",text?} | {kind:"error",text}', input: '{hint}?', recordInput: 'boolean?' } } },
      { kind: 'promptSection', needsCode: false, shape: { name: 'string', order: 'number', text: 'string' } },
      { kind: 'promptContext', needsCode: false, shape: { name: 'string', order: 'number', text: 'string' } },
      { kind: 'promptVariable', needsCode: false, shape: { name: 'string', value: 'string' } },
      { kind: 'eventListener', needsCode: true, shape: { event: 'string', listener: 'function' } },
      { kind: 'llmAdapter', needsCode: true, shape: { providers: 'string[] (non-empty)', adapter: '{ stream(options), providerInfo(), providerRetryPolicy() } (abstract LlmAdapter)' } },
      { kind: 'subagentProvider', needsCode: true, shape: { provider: { name: 'string', capabilities: '{ outputSchema, depthLimit, toolFilter, persona } all boolean', inheritsParentContext: 'boolean', start: '(request) => Promise' } } },
      { kind: 'webRoute', needsCode: true, shape: { route: { kind: 'exact | prefix', path: 'string', handler: '(req, res) => void' } } },
      { kind: 'settingsNamespace', needsCode: true, shape: { ns: 'SettingsNamespace (branded)', schema: 'schemastery z schema', options: '{ base?, applies?, validate? }?' } },
      { kind: 'projection', needsCode: true, shape: { definition: 'ProjectionDefinition (6 required fields; schema is zod, apply reducer is sync pure JSON)' } },
    ],
    seams: SEAMS,
    note: 'Kinds marked needsCode:true carry executable functions and must be registered through the fabric Service by plugin code, not through the JSON-only fabric_extend tool. Note: settingsNamespace is fiber-scoped and returns no public disposer, so fabric.remove() on it is a no-op; it is cleaned up when the Fabric plugin stops.',
  })

  const graph = () => {
    let toolCount = 0
    try { toolCount = ctx.tools.schemas().length } catch (e) { /* noop */ }
    return { census: { tools: toolCount, fabricExtensions: ledger.size }, seams: SEAMS, fabricExtensions: listExt() }
  }

  const fabric = {
    register: registerExt,
    list: listExt,
    get: getExt,
    remove: removeExt,
    count: () => ledger.size,
    schema,
    graph,
  }

  // 发布 fabric Service —— 其它插件可 ctx.get('fabric')
  ctx.provide('fabric', fabric)

  // ---- 能力图谱数据路由(供 Client 半 UI fetch,同时演示 webRoute 接缝) ----
  const fullCensus = async () => {
    let skillCount = 0
    if (skills) {
      try { skillCount = (await skills.list()).length } catch (e) { /* noop */ }
    }
    return { ...graph().census, skills: skillCount, seams: SEAMS }
  }
  ctx.webServer.register({
    kind: 'exact',
    path: '/fabric/census',
    handler: async (_req, res) => {
      try {
        const body = JSON.stringify(await fullCensus())
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(body)
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: String((e && e.message) || e) }))
      }
    },
  })

  // ---- 模型工具:fabric_extend / fabric_inspect ----
  ctx.tools.register(defineTool({
    name: 'fabric_extend',
    description: 'Extend the DSH runtime on the fly by registering declarative extensions through the Fabric DSL — the everything-is-a-plugin primitive. Register new skills, persistent instruction sections, dynamic contexts, or prompt variables during a conversation without editing files. Returns per-definition results plus the updated capability census. Code-bearing kinds (tool, eventListener, llmAdapter, subagentProvider, webRoute) must be registered by plugin code via the fabric Service instead.',
    parameters: {
      definitions: {
        type: 'array',
        items: { type: 'json' },
        required: true,
        description: 'Extension definitions. Each needs a "kind": skill {name,description,whenToUse,content}; promptSection {name,order,text}; promptContext {name,order,text}; promptVariable {name,value}.',
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_a, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async (args) => {
      const defs = (args && args.definitions) || []
      const results = registerExt(defs)
      return { registered: results, census: graph().census }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'fabric_inspect',
    description: 'Inspect the live Fabric: list registered extensions, the capability census (how many tools and fabric extensions are plugged in), or the full DSL schema and available seams.',
    parameters: {
      detail: { type: 'string', enum: ['census', 'extensions', 'schema'], description: 'Which view to return; defaults to census.' },
    },
    output: {
      schema: { type: 'json' },
      render: (_a, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async (args) => {
      const detail = (args && args.detail) || 'census'
      if (detail === 'extensions') return { extensions: listExt() }
      if (detail === 'schema') return { schema: schema() }
      return { census: graph().census, seams: SEAMS, extensions: listExt() }
    },
  }))

  // ---- 把 DSL 文档本身也作为 prompt section + skill 注入(自描述闭环) ----
  if (systemPrompt) {
    systemPrompt.section({
      name: 'fabric',
      order: 900,
      text: [
        '# Fabric — the everything-is-a-plugin primitive',
        'This session runs the Fabric plugin. It unifies DSH extensibility seams behind one declarative DSL and exposes two model tools:',
        '- fabric_extend: register declarative extensions at runtime (kind: skill / promptSection / promptContext / promptVariable) to grow the runtime during a conversation.',
        '- fabric_inspect: list registered extensions, the capability census, or the DSL schema.',
        'Prefer fabric_extend to teach a new skill, inject a persistent instruction, or add a prompt variable without editing files. Code-bearing kinds are registered by plugin code via the fabric Service.',
      ].join('\n'),
    })
  }

  if (skills) {
    skills.register({
      name: 'fabric-dsl',
      description: 'Author extensions for the DSH Fabric: the declarative DSL that turns tools, skills, commands, prompt sections, contexts, variables, event listeners, llm adapters, subagent providers, web routes, settings namespaces, and projections into live runtime capabilities. Use when the task needs to extend the runtime itself, add a new skill or instruction mid-conversation, or inspect the capability graph.',
      whenToUse: 'When asked to extend the runtime, register a new capability, add a persistent instruction or skill without editing files, or inspect what is plugged into DSH.',
      content: [
        '# Fabric DSL',
        'Fabric unifies DSH extensibility seams behind one declarative DSL. Register extensions with ctx.get("fabric").register(...) from plugin code, or with the fabric_extend tool from the model (declarative kinds only).',
        '',
        '## JSON-safe kinds (usable via fabric_extend)',
        '- skill: { kind:"skill", name:"kebab", description, whenToUse, content }',
        '- promptSection: { kind:"promptSection", name, order, text }',
        '- promptContext: { kind:"promptContext", name, order, text }',
        '- promptVariable: { kind:"promptVariable", name, value }',
        '',
        '## Code-bearing kinds (via the fabric Service only)',
        '- tool: { kind:"tool", name, description, parameters, execute(args, exec) }',
        '- command: { kind:"command", command:{ name, description, handler(invocation)=>{kind:"success"|"error",text}, input?:{hint}, recordInput? } }',
        '- eventListener: { kind:"eventListener", event, listener(...) }',
        '- llmAdapter: { kind:"llmAdapter", providers:[non-empty], adapter:{ stream(options), providerInfo(), providerRetryPolicy() } }',
        '- subagentProvider: { kind:"subagentProvider", provider:{ name, capabilities:{outputSchema,depthLimit,toolFilter,persona} all boolean, inheritsParentContext, start(request) } }',
        '- webRoute: { kind:"webRoute", route:{ kind:"exact"|"prefix", path, handler(req,res) } }',
        '- settingsNamespace: { kind:"settingsNamespace", ns, schema:schemastery z, options?:{base,applies,validate} }',
        '- projection: { kind:"projection", definition: ProjectionDefinition (schema is zod, apply reducer sync pure JSON) }',
        '',
        '## Service API (ctx.get("fabric"))',
        '- register(def | def[]) -> results',
        '- list() -> extensions',
        '- get(id) / remove(id)',
        '- graph() -> { census, seams, fabricExtensions }',
        '- schema() -> DSL documentation',
      ].join('\n'),
      source: 'runtime',
    })
  }
}
