// Fabric bundle smoke test — 用 mock ctx 验证 index.js 的 apply 注册与 fabric Service 行为
// 运行: node smoke-test.mjs (在仓库根目录,需能解析 @deepseek-ai/dsh-tools)
const calls = { tools: [], skills: [], sections: [], contexts: [], provided: {}, effects: 0 }

function makeDisposer(label) { return () => { calls['disposed_' + label] = (calls['disposed_' + label] || 0) + 1 } }

const mockCtx = {
  tools: {
    register(def) { calls.tools.push(def && def.name); return makeDisposer('tool') },
    schemas() { return [] },
  },
  webServer: {
    register() { calls.webRoute = (calls.webRoute || 0) + 1; return makeDisposer('webRoute') },
  },
  get(name) {
    if (name === 'systemPrompt') return {
      section(s) { calls.sections.push(s && s.name); return makeDisposer('section') },
      context(c) { calls.contexts.push(c && c.name); return makeDisposer('context') },
      variable(n) { return makeDisposer('variable:' + n) },
    }
    if (name === 'skills') return {
      register(s) { calls.skills.push(s && s.name); return makeDisposer('skill') },
    }
    if (name === 'commands') return { register() { calls.commands = (calls.commands || 0) + 1; return makeDisposer('command') } }
    if (name === 'llm') return { registerAdapter() { calls.llm = (calls.llm || 0) + 1; return makeDisposer('llm') } }
    if (name === 'subagents') return { registerProvider() { calls.subagents = (calls.subagents || 0) + 1; return makeDisposer('subagent') } }
    if (name === 'webServer') return { register() { calls.webRoute = (calls.webRoute || 0) + 1; return makeDisposer('webRoute') } }
    if (name === 'settings') return { register() { calls.settings = (calls.settings || 0) + 1; return makeDisposer('settings') } }
    if (name === 'sessionProjections') return { register() { calls.projection = (calls.projection || 0) + 1; return makeDisposer('projection') } }
    return undefined
  },
  provide(name, value) { calls.provided[name] = value; return makeDisposer('provide') },
  effect(fn) { calls.effects++; const d = fn && fn(); calls.effectDisposer = d; return d },
  on() { calls.listener = (calls.listener || 0) + 1; return makeDisposer('event') },
}

const mod = await import('./index.js')
console.log('exports:', Object.keys(mod))
mod.apply(mockCtx)

const fabric = calls.provided.fabric
if (!fabric) { console.error('FAIL: fabric service not provided'); process.exit(1) }

console.log('tools registered:', calls.tools)
console.log('skills registered:', calls.skills)
console.log('prompt sections:', calls.sections)
console.log('fabric service methods:', Object.keys(fabric))

// 1. 注册一个带代码的工具(递归演示)
const r1 = fabric.register({
  kind: 'tool', name: 'smoke_tool', description: 'x',
  parameters: { message: { type: 'string' } },
  execute: async (args) => ({ echo: (args && args.message) || null }),
})
console.log('register tool:', JSON.stringify(r1))

// 2. 注册声明式 promptSection + skill
const r2 = fabric.register([
  { kind: 'promptSection', name: 'smoke-sec', order: 700, text: 'hello' },
  { kind: 'skill', name: 'smoke-skill', description: 'd', whenToUse: 'w', content: 'body' },
])
console.log('register decl:', JSON.stringify(r2))

// 3. graph + list + remove
const g = fabric.graph()
console.log('graph census:', JSON.stringify(g.census))
console.log('list:', JSON.stringify(fabric.list()))
console.log('remove:', JSON.stringify(fabric.remove(r1[0].id)))
console.log('count after remove:', fabric.count())

// 4. 代码 kind 从 JSON 应被拒绝(execute 缺失)
const bad = fabric.register({ kind: 'tool', name: 'bad', execute: null })
console.log('reject code-from-json:', JSON.stringify(bad))

// 5. schema 文档
const s = fabric.schema()
console.log('schema kinds:', s.kinds.length, 'seams:', s.seams.length)

const ok = fabric && r1[0].ok === true && r2.every((r) => r.ok) && bad[0].ok === false && calls.effects === 1
console.log(ok ? '\nSMOKE TEST PASSED' : '\nSMOKE TEST FAILED')
process.exit(ok ? 0 : 1)
