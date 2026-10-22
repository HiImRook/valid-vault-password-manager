import { readLoginCsv, newLoginResult, addLogin, stripBom, MAX_IMPORT_CHARS } from './fileimport.js'

const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_ENTRY_BYTES = MAX_IMPORT_CHARS
const ZIP_LOCAL_SIGNATURE = 0x04034b50
const ZIP_CENTRAL_SIGNATURE = 0x02014b50
const ZIP_END_SIGNATURE = 0x06054b50
const ZIP_END_MIN_BYTES = 22
const ZIP_COMMENT_MAX_BYTES = 65535
const ZIP_CENTRAL_BYTES = 46
const ZIP_LOCAL_BYTES = 30
const ZIP_STORED = 0
const ZIP_DEFLATED = 8
const ZIP_ENCRYPTED_FLAG = 1
const ZIP_FULL_SIZE = 0xFFFFFFFF
const SPASS_SALT_BYTES = 20
const SPASS_IV_BYTES = 16
const SPASS_ITERATIONS = 70000
const SPASS_MIN_CHARS = 64
const SPASS_TABLE_MARKER = 'next_table'
const SPASS_CSV_VERSION = 'spass_export_v1'
const SPASS_TABLE_VERSION = '31'
const SPASS_TABLE_HEADER = '_id;origin_url;'
const SPASS_ABSENT = '&&&NULL&&&'
const SPASS_FORMAT = 'Samsung Pass'
const AES_BLOCK_BYTES = 16
const BITWARDEN_FORMAT = 'Bitwarden'
const BITWARDEN_LOGIN_TYPE = 1
const BITWARDEN_PBKDF2 = 0
const BITWARDEN_MAX_ITERATIONS = 10000000
const BITWARDEN_ENC_STRING = /^2\.([A-Za-z0-9+/=]+)\|([A-Za-z0-9+/=]+)\|([A-Za-z0-9+/=]+)$/
const ONEPASSWORD_FORMAT = '1Password'
const ONEPASSWORD_LOGIN_CATEGORY = '001'
const ONEPASSWORD_DATA_FILE = 'export.data'
const DASHLANE_FORMAT = 'Dashlane'
const DASHLANE_LOGINS_FILE = /(^|\/)credentials\.csv$/i
const WRONG_PASSWORD = 'That password did not open the file. Use the password you set when you exported it.'
const UNREADABLE_ZIP = 'That zip file could not be read.'
const UNKNOWN_ZIP = 'That zip file has no password list Valid Vault recognizes.'
const UNKNOWN_SPASS = 'This Samsung Pass file uses a newer layout Valid Vault does not know yet. Nothing was imported.'
const UNKNOWN_JSON = 'Valid Vault does not recognize this file. Export from your password manager as CSV, or as a Bitwarden JSON, 1Password 1PUX, or Samsung Pass file.'
const TOO_LARGE = 'That file is too large to import.'

const UTF8 = new TextDecoder('utf-8')
const UTF8_ENCODER = new TextEncoder()

function utf8(bytes) {
  return UTF8.decode(bytes)
}

function base64Bytes(text) {
  const clean = String(text || '').replace(/\s+/g, '')
  const binary = atob(clean)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function u16(bytes, at) {
  return bytes[at] | (bytes[at + 1] << 8)
}

function u32(bytes, at) {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
}

function isZip(bytes) {
  return bytes.length >= ZIP_LOCAL_BYTES && u32(bytes, 0) === ZIP_LOCAL_SIGNATURE
}

function zipEntries(bytes) {
  const lowest = Math.max(0, bytes.length - ZIP_END_MIN_BYTES - ZIP_COMMENT_MAX_BYTES)
  let end = -1
  for (let at = bytes.length - ZIP_END_MIN_BYTES; at >= lowest; at--) {
    if (u32(bytes, at) === ZIP_END_SIGNATURE) { end = at; break }
  }
  if (end < 0) throw new Error(UNREADABLE_ZIP)
  const count = u16(bytes, end + 10)
  let at = u32(bytes, end + 16)
  const entries = []
  for (let n = 0; n < count; n++) {
    if (at + ZIP_CENTRAL_BYTES > bytes.length || u32(bytes, at) !== ZIP_CENTRAL_SIGNATURE) throw new Error(UNREADABLE_ZIP)
    const nameLength = u16(bytes, at + 28)
    const entry = {
      flags: u16(bytes, at + 8),
      method: u16(bytes, at + 10),
      compressed: u32(bytes, at + 20),
      size: u32(bytes, at + 24),
      local: u32(bytes, at + 42),
      name: utf8(bytes.subarray(at + ZIP_CENTRAL_BYTES, at + ZIP_CENTRAL_BYTES + nameLength))
    }
    if (!entry.name.endsWith('/')) entries.push(entry)
    at += ZIP_CENTRAL_BYTES + nameLength + u16(bytes, at + 30) + u16(bytes, at + 32)
  }
  return entries
}

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_ENTRY_BYTES) {
      try { await reader.cancel() } catch (e) {}
      throw new Error(TOO_LARGE)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length }
  return out
}

async function zipRead(bytes, entry) {
  if (entry.flags & ZIP_ENCRYPTED_FLAG) throw new Error('That zip file has its own password. Export it again without a zip password.')
  if (entry.compressed === ZIP_FULL_SIZE || entry.size === ZIP_FULL_SIZE || entry.size > MAX_ENTRY_BYTES) throw new Error(TOO_LARGE)
  const at = entry.local
  if (at + ZIP_LOCAL_BYTES > bytes.length || u32(bytes, at) !== ZIP_LOCAL_SIGNATURE) throw new Error(UNREADABLE_ZIP)
  const start = at + ZIP_LOCAL_BYTES + u16(bytes, at + 26) + u16(bytes, at + 28)
  const data = bytes.subarray(start, start + entry.compressed)
  if (data.length !== entry.compressed) throw new Error(UNREADABLE_ZIP)
  if (entry.method === ZIP_STORED) return data
  if (entry.method !== ZIP_DEFLATED) throw new Error(UNREADABLE_ZIP)
  try { return await inflate(data) } catch (e) { throw new Error(e && e.message === TOO_LARGE ? TOO_LARGE : UNREADABLE_ZIP) }
}

function csvResult(text, format) {
  const result = readLoginCsv(text)
  result.csvText = text
  if (format) result.format = format
  return result
}

function parseJson(text, message) {
  try { return JSON.parse(text) } catch (e) { throw new Error(message) }
}

function read1pux(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(UNREADABLE_ZIP)
  const result = newLoginResult(ONEPASSWORD_FORMAT)
  for (const account of Array.isArray(data.accounts) ? data.accounts : []) {
    for (const vault of Array.isArray(account && account.vaults) ? account.vaults : []) {
      for (const item of Array.isArray(vault && vault.items) ? vault.items : []) {
        if (!item || typeof item !== 'object') continue
        if (item.state === 'archived') { result.skipped.archived++; continue }
        if (item.categoryUuid !== ONEPASSWORD_LOGIN_CATEGORY) { result.skipped.notLogin++; continue }
        const details = item.details && typeof item.details === 'object' ? item.details : {}
        const overview = item.overview && typeof item.overview === 'object' ? item.overview : {}
        const fields = Array.isArray(details.loginFields) ? details.loginFields.filter((f) => f && typeof f.value === 'string') : []
        const user = fields.find((f) => f.designation === 'username') || fields.find((f) => f.fieldType === 'E' || f.fieldType === 'T')
        const pass = fields.find((f) => f.designation === 'password') || fields.find((f) => f.fieldType === 'P')
        const addresses = [overview.url].concat((Array.isArray(overview.urls) ? overview.urls : []).map((u) => (u && typeof u.url === 'string' ? u.url : '')))
        addLogin(result, {
          addresses,
          username: user ? user.value : '',
          password: pass ? pass.value : '',
          note: typeof details.notesPlain === 'string' ? details.notesPlain : '',
          changedAt: item.updatedAt ? String(item.updatedAt) : '',
          label: typeof overview.title === 'string' ? overview.title : ''
        })
      }
    }
  }
  return result
}

function readBitwardenItems(data) {
  const result = newLoginResult(BITWARDEN_FORMAT)
  for (const item of Array.isArray(data.items) ? data.items : []) {
    if (!item || item.type !== BITWARDEN_LOGIN_TYPE || !item.login || typeof item.login !== 'object') { result.skipped.notLogin++; continue }
    const login = item.login
    const addresses = (Array.isArray(login.uris) ? login.uris : []).map((u) => (u && typeof u.uri === 'string' ? u.uri : ''))
    addLogin(result, {
      addresses,
      username: typeof login.username === 'string' ? login.username : '',
      password: typeof login.password === 'string' ? login.password : '',
      note: typeof item.notes === 'string' ? item.notes : '',
      changedAt: login.passwordRevisionDate || item.revisionDate || '',
      label: typeof item.name === 'string' ? item.name : ''
    })
  }
  return result
}

async function hmacKey(raw, usage) {
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

async function hkdfExpand(prk, info) {
  const label = UTF8_ENCODER.encode(info)
  const message = new Uint8Array(label.length + 1)
  message.set(label)
  message[label.length] = 1
  return new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(prk, 'sign'), message))
}

async function openEncString(value, keys) {
  const match = BITWARDEN_ENC_STRING.exec(String(value || ''))
  if (!match) throw new Error(UNKNOWN_JSON)
  const iv = base64Bytes(match[1])
  const data = base64Bytes(match[2])
  const mac = base64Bytes(match[3])
  const signed = new Uint8Array(iv.length + data.length)
  signed.set(iv)
  signed.set(data, iv.length)
  if (!(await crypto.subtle.verify('HMAC', keys.mac, mac, signed))) throw new Error(WRONG_PASSWORD)
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, keys.enc, data)) } catch (e) { throw new Error(WRONG_PASSWORD) }
}

async function openBitwarden(data, password) {
  const iterations = Number(data.kdfIterations)
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > BITWARDEN_MAX_ITERATIONS || typeof data.salt !== 'string') throw new Error(UNKNOWN_JSON)
  const base = await crypto.subtle.importKey('raw', UTF8_ENCODER.encode(password), 'PBKDF2', false, ['deriveBits'])
  const master = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: UTF8_ENCODER.encode(data.salt), iterations }, base, 256))
  const keys = {
    enc: await crypto.subtle.importKey('raw', await hkdfExpand(master, 'enc'), { name: 'AES-CBC' }, false, ['decrypt']),
    mac: await hmacKey(await hkdfExpand(master, 'mac'), 'verify')
  }
  await openEncString(data.encKeyValidation_DO_NOT_EDIT, keys)
  const inner = parseJson(utf8(await openEncString(data.data, keys)), UNKNOWN_JSON)
  if (!inner || typeof inner !== 'object' || !Array.isArray(inner.items)) throw new Error(UNKNOWN_JSON)
  return readBitwardenItems(inner)
}

async function readJson(text, askPassword) {
  const data = parseJson(text, UNKNOWN_JSON)
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(UNKNOWN_JSON)
  if (data.encrypted === true) {
    if (data.passwordProtected !== true) throw new Error('This Bitwarden file is locked to your Bitwarden account, so only Bitwarden can open it. Export again and choose JSON with a file password, or plain JSON or CSV.')
    if (data.kdfType !== undefined && data.kdfType !== BITWARDEN_PBKDF2) throw new Error('This Bitwarden file is locked with Argon2, which Valid Vault can\'t open. Export again as plain JSON or CSV, then delete the file after importing.')
    return markEncrypted(await askPassword(BITWARDEN_FORMAT, (password) => openBitwarden(data, password)))
  }
  if (Array.isArray(data.items)) return readBitwardenItems(data)
  if (Array.isArray(data.accounts)) return read1pux(data)
  throw new Error(UNKNOWN_JSON)
}

function looksLikeSpass(name, text) {
  if (/\.spass$/i.test(name || '')) return true
  if (/\.(csv|txt|json)$/i.test(name || '')) return false
  return text.length >= SPASS_MIN_CHARS && /^[A-Za-z0-9+/\s]+=*\s*$/.test(text)
}

function spassSections(text) {
  const sections = [[]]
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === SPASS_TABLE_MARKER) sections.push([])
    else sections[sections.length - 1].push(line)
  }
  return sections
}

function spassValue(field) {
  if (!field) return ''
  const value = utf8(base64Bytes(field))
  return value === SPASS_ABSENT ? '' : value
}

function readSpassTable(lines) {
  const rows = lines.filter((line) => line.trim() !== '')
  const result = newLoginResult(SPASS_FORMAT)
  if (rows.length === 0) return result
  const header = rows[0].trim().split(';').map((name) => name.trim().toLowerCase())
  const at = (name) => header.indexOf(name)
  const column = {
    origin: at('origin_url'),
    host: at('host_url'),
    username: at('username_value'),
    password: at('password_value'),
    modified: at('modified_time'),
    created: at('created_time'),
    title: at('title'),
    appName: at('app_name'),
    pkg: at('package_name'),
    memo: at('credential_memo'),
    blocked: at('blacklisted_by_user')
  }
  if (column.origin < 0 || column.username < 0 || column.password < 0) throw new Error(UNKNOWN_SPASS)
  for (const row of rows.slice(1)) {
    const fields = row.trim().split(';')
    if (fields.length !== header.length) throw new Error(UNKNOWN_SPASS)
    const read = (index) => (index >= 0 ? spassValue(fields[index]) : '')
    const blocked = read(column.blocked).trim().toLowerCase()
    if (blocked === '1' || blocked === 'true') { result.skipped.notLogin++; continue }
    addLogin(result, {
      addresses: [read(column.origin), read(column.host)],
      app: read(column.pkg),
      username: read(column.username),
      password: read(column.password),
      note: read(column.memo),
      changedAt: read(column.modified) || read(column.created),
      label: read(column.appName) || read(column.title)
    })
  }
  return result
}

function readSpassText(text) {
  const sections = spassSections(text)
  const head = sections[0].map((line) => line.trim())
  const version = head[0] || ''
  if (version === SPASS_CSV_VERSION) {
    if (sections.length < 2) throw new Error(UNKNOWN_SPASS)
    return csvResult(sections[1].join('\n'), SPASS_FORMAT)
  }
  if (!/^\d+$/.test(version)) throw new Error(WRONG_PASSWORD)
  const table = sections.length > 1 ? sections[1].filter((line) => line.trim() !== '') : []
  const knownTable = table.length > 0 && table[0].trim().toLowerCase().startsWith(SPASS_TABLE_HEADER)
  if (version !== SPASS_TABLE_VERSION && !knownTable) throw new Error(UNKNOWN_SPASS)
  const modules = (head[1] || '').split(';').map((value) => value.trim())
  if (modules[0] !== 'true') {
    if (version === SPASS_TABLE_VERSION && (modules[0] === 'false')) return newLoginResult(SPASS_FORMAT)
    throw new Error(UNKNOWN_SPASS)
  }
  if (!knownTable) throw new Error(UNKNOWN_SPASS)
  try {
    return readSpassTable(sections[1])
  } catch (e) {
    throw new Error(UNKNOWN_SPASS)
  }
}

async function openSpass(text, password) {
  let raw
  try { raw = base64Bytes(text) } catch (e) { throw new Error(UNKNOWN_SPASS) }
  const bodyLength = raw.length - SPASS_SALT_BYTES - SPASS_IV_BYTES
  if (bodyLength < AES_BLOCK_BYTES || bodyLength % AES_BLOCK_BYTES !== 0) throw new Error(UNKNOWN_SPASS)
  const salt = raw.subarray(0, SPASS_SALT_BYTES)
  const iv = raw.subarray(SPASS_SALT_BYTES, SPASS_SALT_BYTES + SPASS_IV_BYTES)
  const body = raw.subarray(SPASS_SALT_BYTES + SPASS_IV_BYTES)
  const base = await crypto.subtle.importKey('raw', UTF8_ENCODER.encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: SPASS_ITERATIONS }, base, { name: 'AES-CBC', length: 256 }, false, ['decrypt'])
  let plain
  try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, body)) } catch (e) { throw new Error(WRONG_PASSWORD) }
  return readSpassText(utf8(plain))
}

async function readZip(bytes) {
  const entries = zipEntries(bytes)
  const data = entries.find((entry) => entry.name === ONEPASSWORD_DATA_FILE)
  if (data) return read1pux(parseJson(utf8(await zipRead(bytes, data)), UNREADABLE_ZIP))
  const dashlane = entries.find((entry) => DASHLANE_LOGINS_FILE.test(entry.name))
  if (dashlane) return csvResult(stripBom(utf8(await zipRead(bytes, dashlane))), DASHLANE_FORMAT)
  const lists = entries.filter((entry) => /\.csv$/i.test(entry.name))
  if (lists.length === 1) return csvResult(stripBom(utf8(await zipRead(bytes, lists[0]))))
  throw new Error(UNKNOWN_ZIP)
}

function markEncrypted(result) {
  if (result) result.encrypted = true
  return result
}

async function readLoginFile(file, askPassword) {
  const bytes = file && file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(0)
  if (bytes.length > MAX_FILE_BYTES) throw new Error(TOO_LARGE)
  if (isZip(bytes)) return readZip(bytes)
  const text = stripBom(utf8(bytes))
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) return readJson(trimmed, askPassword)
  if (looksLikeSpass(file.name, trimmed)) return markEncrypted(await askPassword(SPASS_FORMAT, (password) => openSpass(trimmed, password)))
  return csvResult(text)
}

export { readLoginFile, readSpassText, zipEntries, zipRead, MAX_FILE_BYTES }
