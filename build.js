#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const ENTRY = path.join(ROOT, 'phone', 'app.js')
const TEMPLATE = path.join(ROOT, 'phone', 'app.html')
const CLASSIC_SCRIPTS = [{ file: path.join(ROOT, 'extension', 'jsqr.js'), id: 'vv-jsqr' }]
const TEXT_SCRIPTS = [{ file: path.join(ROOT, 'extension', 'scanworker.js'), id: 'vv-scanworker' }]
const OUTPUT_DIR = path.join(ROOT, 'www')
const OUTPUT = path.join(OUTPUT_DIR, 'index.html')
const PLACEHOLDER = '<!--BUNDLE-->'
const IMPORT_PATTERN = /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;?[ \t]*$/gm
const BARE_IMPORT_PATTERN = /^import\s+['"][^'"]+['"]/m
const EXPORT_LIST_PATTERN = /^export\s*\{([\s\S]*?)\}\s*;?[ \t]*$/gm
const EXPORT_DEFAULT_PATTERN = /^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?[ \t]*$/gm
const INLINE_EXPORT_PATTERN = /^export\s+(const|let|var|function|async|class)\b/m
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

function fail(message) {
  console.error('build.js: ' + message)
  process.exit(1)
}

function moduleId(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function splitNames(list) {
  return list.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
    const pieces = part.split(/\s+as\s+/)
    const name = pieces[0].trim()
    const alias = (pieces[1] || pieces[0]).trim()
    if (!IDENTIFIER.test(name) || !IDENTIFIER.test(alias)) fail('cannot read binding "' + part + '"')
    return { name, alias }
  })
}

function bindingCode(clause, depRef, file) {
  const trimmed = clause.trim()
  const ns = trimmed.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/)
  if (ns) return 'const ' + ns[1] + ' = ' + depRef
  const named = trimmed.match(/^\{([\s\S]*)\}$/)
  if (named) {
    const parts = splitNames(named[1]).map((b) => (b.name === b.alias ? b.name : b.name + ': ' + b.alias))
    return 'const { ' + parts.join(', ') + ' } = ' + depRef
  }
  if (IDENTIFIER.test(trimmed)) return 'const ' + trimmed + ' = ' + depRef + '.default'
  fail('unsupported import "' + trimmed + '" in ' + moduleId(file))
}

function readModule(file) {
  if (!fs.existsSync(file)) fail('missing module ' + moduleId(file))
  const source = fs.readFileSync(file, 'utf8')
  if (INLINE_EXPORT_PATTERN.test(source)) fail('inline export in ' + moduleId(file) + ', use an export list')
  if (BARE_IMPORT_PATTERN.test(source)) fail('side-effect import in ' + moduleId(file))
  const imports = []
  let body = source.replace(IMPORT_PATTERN, (match, clause, spec) => {
    if (!spec.startsWith('.')) fail('non-relative import "' + spec + '" in ' + moduleId(file))
    const dep = path.resolve(path.dirname(file), spec)
    imports.push({ clause, dep })
    return ''
  })
  const exportsList = []
  body = body.replace(EXPORT_LIST_PATTERN, (match, list) => {
    for (const b of splitNames(list)) exportsList.push({ local: b.name, exported: b.alias })
    return ''
  })
  body = body.replace(EXPORT_DEFAULT_PATTERN, (match, name) => {
    exportsList.push({ local: name, exported: 'default' })
    return ''
  })
  if (/^export\b/m.test(body)) fail('unhandled export in ' + moduleId(file))
  return { file, id: moduleId(file), imports, exportsList, body: body.trim() }
}

function collect(entry) {
  const order = []
  const done = new Map()
  const visiting = new Set()
  const visit = (file) => {
    if (done.has(file)) return
    if (visiting.has(file)) fail('import cycle through ' + moduleId(file))
    visiting.add(file)
    const mod = readModule(file)
    for (const imp of mod.imports) visit(imp.dep)
    visiting.delete(file)
    done.set(file, mod)
    order.push(mod)
  }
  visit(entry)
  return order
}

function wrapModule(mod) {
  const lines = []
  for (const imp of mod.imports) lines.push(bindingCode(imp.clause, '__modules[' + JSON.stringify(moduleId(imp.dep)) + ']', mod.file))
  lines.push(mod.body)
  const exported = mod.exportsList.map((e) => JSON.stringify(e.exported) + ': ' + e.local)
  lines.push('return Object.freeze({ ' + exported.join(', ') + ' })')
  return '__modules[' + JSON.stringify(mod.id) + '] = (function () {\n' + lines.join('\n') + '\n})()'
}

function guardScript(code) {
  return code.replace(/<\/script/gi, '<\\/script')
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const version = String(pkg.version || '')
  const template = fs.readFileSync(TEMPLATE, 'utf8')
  if (!template.includes(PLACEHOLDER)) fail('template is missing ' + PLACEHOLDER)
  const modules = collect(ENTRY)
  const bundle = [
    '(function () {',
    '\'use strict\'',
    'const VALID_VAULT_VERSION = ' + JSON.stringify(version),
    'const __modules = Object.create(null)',
    modules.map(wrapModule).join('\n\n'),
    '})()'
  ].join('\n')
  const classic = CLASSIC_SCRIPTS.map((s) => '<script id="' + s.id + '">\n' + guardScript(fs.readFileSync(s.file, 'utf8')) + '\n</script>')
    .concat(TEXT_SCRIPTS.map((s) => '<script type="text/plain" id="' + s.id + '">\n' + guardScript(fs.readFileSync(s.file, 'utf8')) + '\n</script>'))
    .join('\n')
  const html = template.replace(PLACEHOLDER, () => classic + '\n<script>\n' + guardScript(bundle) + '\n</script>')
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(OUTPUT, html)
  console.log('Built ' + path.relative(ROOT, OUTPUT) + ' (v' + version + ', ' + modules.length + ' modules, ' + Math.round(html.length / 1024) + ' KB)')
  for (const mod of modules) console.log('  ' + mod.id)
}

main()
