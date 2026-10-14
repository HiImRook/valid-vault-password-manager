const MAX_IMPORT_CHARS = 20 * 1024 * 1024
const DELIMITERS = [',', ';', '\t']
const URL_HEADERS = ['url', 'login_uri', 'login url', 'loginurl', 'login_url', 'website', 'web site', 'website url', 'web address', 'uri', 'origin', 'hostname', 'site']
const USER_HEADERS = ['username', 'login_username', 'user name', 'login', 'login name', 'user', 'userid', 'user id', 'email', 'e-mail', 'email address']
const EMAIL_HEADERS = ['email', 'e-mail', 'email address']
const PASS_HEADERS = ['password', 'login_password', 'pass', 'pwd']
const NOTE_HEADERS = ['note', 'notes', 'extra', 'comments', 'comment']
const TYPE_HEADERS = ['type', 'item type']
const LOGIN_TYPES = ['', 'login', 'password', 'logins', 'passwords', 'website', 'web login']
const DATE_HEADERS = ['timepasswordchanged', 'modifytime', 'last modified', 'last_modified', 'lastmodified', 'modified', 'modified at', 'revisiondate', 'password changed', 'last modification time']
const EPOCH_MS_THRESHOLD = 100000000000
const EPOCH_S_THRESHOLD = 100000000
const EARLIEST_DATE = Date.UTC(1995, 0, 1)
const FORMATS = [
  { name: 'Firefox', has: ['httprealm', 'formactionorigin'] },
  { name: 'Bitwarden', has: ['login_uri', 'login_password'] },
  { name: 'LastPass', has: ['grouping', 'extra'] },
  { name: 'Proton Pass', has: ['vault', 'createtime'] },
  { name: 'Dashlane', has: ['username2', 'title'] },
  { name: 'Apple Passwords', has: ['otpauth', 'title'] },
  { name: '1Password', has: ['title', 'archived'] },
  { name: 'KeePassXC', has: ['group', 'title', 'last modified'] },
  { name: 'NordPass', has: ['cardholdername'] },
  { name: 'Chrome, Edge, Brave, or Google Password Manager', has: ['name', 'url', 'username', 'password'] }
]

function tooLarge(text) {
  return typeof text !== 'string' || text.length > MAX_IMPORT_CHARS
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

function pickDelimiter(text) {
  let best = ','
  let bestCount = -1
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  for (const delimiter of DELIMITERS) {
    let count = 0
    let quoted = false
    for (const ch of firstLine) {
      if (ch === '"') quoted = !quoted
      else if (!quoted && ch === delimiter) count++
    }
    if (count > bestCount) { best = delimiter; bestCount = count }
  }
  return best
}

function readSepHint(text) {
  const match = /^sep=(.)\r?\n/i.exec(text)
  return match ? { delimiter: match[1], rest: text.slice(match[0].length) } : null
}

function parseCsv(input) {
  const raw = stripBom(String(input || ''))
  const hint = readSepHint(raw)
  const text = hint ? hint.rest : raw
  const delimiter = hint ? hint.delimiter : pickDelimiter(text)
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        quoted = false
        i++
        while (text[i] === ' ' || (text[i] === '\t' && delimiter !== '\t')) i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"' && field === '') { quoted = true; i++; continue }
    if (ch === delimiter) { row.push(field); field = ''; i++; continue }
    if (ch === '\r' || ch === '\n') {
      row.push(field)
      field = ''
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      if (ch === '\r' && text[i + 1] === '\n') i++
      i++
      continue
    }
    field += ch
    i++
  }
  row.push(field)
  if (row.some((value) => value !== '')) rows.push(row)
  return rows
}

function cleanHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function findColumn(headers, names) {
  for (const name of names) {
    const index = headers.indexOf(name)
    if (index !== -1) return index
  }
  return -1
}

function detectFormat(headers) {
  for (const format of FORMATS) {
    if (format.has.every((name) => headers.includes(name))) return format.name
  }
  return null
}

function guessMapping(headers) {
  const user = findColumn(headers, USER_HEADERS)
  const email = findColumn(headers, EMAIL_HEADERS)
  return {
    site: findColumn(headers, URL_HEADERS),
    username: user,
    email: email !== user ? email : -1,
    password: findColumn(headers, PASS_HEADERS),
    note: findColumn(headers, NOTE_HEADERS),
    type: findColumn(headers, TYPE_HEADERS),
    date: findColumn(headers, DATE_HEADERS)
  }
}

function siteFromAddress(raw) {
  const value = String(raw || '').trim().split(/[\s,]+(?=[a-z][a-z0-9+.-]*:\/\/)/i)[0].trim()
  if (!value) return { site: null, reason: 'site' }
  if (/^android(app)?:\/\//i.test(value)) return { site: null, reason: 'app' }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : 'https://' + value
  let url
  try { url = new URL(withScheme) } catch (e) { return { site: null, reason: 'site' } }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { site: null, reason: 'site' }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || (!host.includes('.') && host !== 'localhost')) return { site: null, reason: 'site' }
  return { site: host, reason: null }
}

function parseDate(raw) {
  const value = String(raw || '').trim()
  if (!value) return null
  let ms = null
  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value)
    if (n >= EPOCH_MS_THRESHOLD) ms = n
    else if (n >= EPOCH_S_THRESHOLD) ms = n * 1000
  } else {
    const parsed = Date.parse(value)
    if (!isNaN(parsed)) ms = parsed
  }
  if (ms === null || ms < EARLIEST_DATE || ms > Date.now() + 86400000) return null
  return Math.round(ms)
}

function cell(row, index) {
  return index >= 0 && index < row.length ? String(row[index]) : ''
}

function readLoginCsv(text, mapping) {
  if (tooLarge(text)) throw new Error('That file is too large to import.')
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('That file has no rows to import.')
  const headers = rows[0].map(cleanHeader)
  const map = mapping || guessMapping(headers)
  const result = {
    format: detectFormat(headers),
    headers: rows[0].map((value) => String(value || '').trim()),
    mapping: map,
    needsMapping: map.site < 0 || map.password < 0,
    entries: [],
    skipped: { notLogin: 0, app: 0, missing: 0 }
  }
  if (result.needsMapping) return result
  for (const row of rows.slice(1)) {
    if (map.type >= 0 && !LOGIN_TYPES.includes(cleanHeader(cell(row, map.type)))) { result.skipped.notLogin++; continue }
    const password = cell(row, map.password)
    const where = siteFromAddress(cell(row, map.site))
    if (where.reason === 'app') { result.skipped.app++; continue }
    if (!where.site || !password) { result.skipped.missing++; continue }
    let username = cell(row, map.username).trim()
    if (!username && map.email >= 0) username = cell(row, map.email).trim()
    const entry = { site: where.site, username, password }
    const note = cell(row, map.note).trim()
    if (note) entry.note = note
    const changedAt = map.date >= 0 ? parseDate(cell(row, map.date)) : null
    if (changedAt) entry.changedAt = changedAt
    result.entries.push(entry)
  }
  return result
}

function bookmarkEntry(href, title) {
  let url
  try { url = new URL(String(href || '').trim()) } catch (e) { return null }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return { url: url.href, title: String(title || '').replace(/\s+/g, ' ').trim() }
}

function readBookmarkHtml(text) {
  if (tooLarge(text)) throw new Error('That file is too large to import.')
  const doc = new DOMParser().parseFromString(String(text || ''), 'text/html')
  const links = Array.from(doc.querySelectorAll('a[href]'))
  const result = { found: links.length, entries: [], skipped: 0 }
  for (const link of links) {
    const entry = bookmarkEntry(link.getAttribute('href'), link.textContent)
    if (entry) result.entries.push(entry)
    else result.skipped++
  }
  return result
}

function readBookmarkTree(nodes) {
  const result = { found: 0, entries: [], skipped: 0 }
  const stack = Array.isArray(nodes) ? nodes.slice().reverse() : []
  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (typeof node.url === 'string') {
      result.found++
      const entry = bookmarkEntry(node.url, node.title)
      if (entry) result.entries.push(entry)
      else result.skipped++
    }
    if (Array.isArray(node.children)) {
      for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i])
    }
  }
  return result
}

export {
  MAX_IMPORT_CHARS,
  parseCsv,
  guessMapping,
  detectFormat,
  siteFromAddress,
  parseDate,
  readLoginCsv,
  readBookmarkHtml,
  readBookmarkTree
}
