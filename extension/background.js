import { saveCredential as passwordsSaveCredential, getCredentials as passwordsGetCredentials } from './passwords.js'

async function getAuthRecord() {
  return new Promise(function (resolve) {
    const req = indexedDB.open('ValidVault')
    req.onsuccess = function () {
      try {
        const tx = req.result.transaction('auth', 'readonly')
        const get = tx.objectStore('auth').get('primary')
        get.onsuccess = function () { resolve(get.result || null) }
        get.onerror = function () { resolve(null) }
      } catch (e) { resolve(null) }
    }
    req.onerror = function () { resolve(null) }
  })
}

async function authenticateWithPassword(password) {
  const auth = await getAuthRecord()
  if (!auth || !auth.passwordWrappedKey) return { success: false, error: 'No password set' }
  try {
    const salt = new Uint8Array(auth.passwordSalt)
    const iterations = auth.passwordKdfIterations || 100000
    const encoder = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
    const unwrappingKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['unwrapKey']
    )
    const iv = new Uint8Array(auth.passwordWrappedKey.iv)
    const wrapped = new Uint8Array(auth.passwordWrappedKey.wrapped)
    const masterKey = await crypto.subtle.unwrapKey(
      'raw', wrapped, unwrappingKey, { name: 'AES-GCM', iv: iv }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    )
    const bytes = new Uint8Array(await crypto.subtle.exportKey('raw', masterKey))
    await chrome.storage.session.set({ masterKeyBytes: Array.from(bytes), lastActivity: Date.now() })
    return { success: true }
  } catch (e) {
    return { success: false, error: 'Invalid password' }
  }
}

async function getSessionKeyBytes() {
  try {
    const stored = await chrome.storage.session.get('masterKeyBytes')
    if (stored && stored.masterKeyBytes) return stored.masterKeyBytes
  } catch (e) {}
  return null
}

async function getVault() {
  return new Promise(function (resolve) {
    const req = indexedDB.open('ValidVault')
    req.onsuccess = function () {
      const db = req.result
      try {
        const tx = db.transaction('passwords', 'readonly')
        const get = tx.objectStore('passwords').get('vault')
        get.onsuccess = function () { resolve(get.result || null) }
        get.onerror = function () { resolve(null) }
      } catch (e) { resolve(null) }
    }
    req.onerror = function () { resolve(null) }
  })
}

async function decryptField(field, key) {
  const iv = new Uint8Array(field.iv)
  const ct = new Uint8Array(field.ciphertext)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct)
  return new TextDecoder().decode(pt)
}

async function getPersonalInfoRecord() {
  return new Promise(function (resolve) {
    const req = indexedDB.open('ValidVault')
    req.onsuccess = function () {
      const db = req.result
      try {
        const tx = db.transaction('personalInfo', 'readonly')
        const get = tx.objectStore('personalInfo').get('profile')
        get.onsuccess = function () { resolve(get.result || null) }
        get.onerror = function () { resolve(null) }
      } catch (e) { resolve(null) }
    }
    req.onerror = function () { resolve(null) }
  })
}

async function loadDecryptedProfile() {
  const bytes = await getSessionKeyBytes()
  if (!bytes) return { success: false, locked: true }
  const record = await getPersonalInfoRecord()
  if (!record || !record.data) return { success: true, profile: null }
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  try {
    const json = await decryptField(record.data, key)
    return { success: true, profile: JSON.parse(json) }
  } catch (e) {
    return { success: false, locked: true }
  }
}

async function personalInfoField(fieldType) {
  const result = await loadDecryptedProfile()
  if (!result.success) return { success: false, value: null, locked: true }
  const profile = result.profile
  if (!profile) return { success: true, value: null }
  if (fieldType.indexOf('address.') === 0) {
    const sub = fieldType.split('.')[1]
    return { success: true, value: (profile.address && profile.address[sub]) || null }
  }
  if (fieldType === 'email') {
    const emails = (profile.emails || []).slice().sort((a, b) => a.position - b.position)
    return { success: true, value: emails.length ? emails[0].value : null }
  }
  return { success: true, value: profile[fieldType] || null }
}

async function personalInfoAllEmails() {
  const result = await loadDecryptedProfile()
  if (!result.success) return { success: false, emails: [], locked: true }
  const profile = result.profile
  if (!profile) return { success: true, emails: [] }
  const emails = (profile.emails || []).slice().sort((a, b) => a.position - b.position).map(e => e.value)
  return { success: true, emails: emails }
}

async function credentialsForDomainViaShared(domain) {
  const bytes = await getSessionKeyBytes()
  if (!bytes) return { success: false, credentials: [], locked: true }
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  const result = await passwordsGetCredentials(domain, key)
  if (!result.success) return { success: false, credentials: [], locked: true }
  return result
}

async function credentialsForDomain(domain) {
  const bytes = await getSessionKeyBytes()
  if (!bytes) return { success: false, credentials: [], locked: true }
  const vault = await getVault()
  if (!vault || !vault.credentials || !vault.credentials[domain]) {
    return { success: true, credentials: [] }
  }
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  const out = []
  for (const cred of vault.credentials[domain]) {
    if (cred.deleted) continue
    try {
      const decUsername = await decryptField(cred.username, key)
      out.push({
        id: cred.id,
        username: decUsername,
        password: await decryptField(cred.password, key),
        extraFields: await decryptExtraFields(cred.extraFields, key),
        loginType: cred.loginType || inferLoginType(decUsername)
      })
    } catch (e) {
      return { success: false, credentials: [], locked: true }
    }
  }
  return { success: true, credentials: out }
}

async function encryptField(text, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(text))
  return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ct)) }
}

function normalizeLabel(label) {
  return (label || '')
    .toLowerCase()
    .replace(/[:*]+$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

async function encryptExtraFields(extraFields, key) {
  const out = []
  for (const field of extraFields || []) {
    if (!field || !field.label || !field.value) continue
    out.push({ label: await encryptField(field.label, key), value: await encryptField(field.value, key) })
  }
  return out
}

async function decryptExtraFields(extraFields, key) {
  const out = []
  for (const field of extraFields || []) {
    try {
      out.push({ label: await decryptField(field.label, key), value: await decryptField(field.value, key) })
    } catch (e) {}
  }
  return out
}

function inferLoginType(identifier) {
  const v = (identifier || '').trim()
  if (!v) return 'username'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'email'
  const digits = v.replace(/\D/g, '')
  if (digits.length >= 7 && /^[+()\-.\s\d]+$/.test(v)) return 'phone'
  return 'username'
}

function genId() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
}

async function writeVault(vault) {
  return new Promise(function (resolve) {
    const req = indexedDB.open('ValidVault')
    req.onsuccess = function () {
      try {
        const tx = req.result.transaction('passwords', 'readwrite')
        tx.objectStore('passwords').put(vault)
        tx.oncomplete = function () { resolve(true) }
        tx.onerror = function () { resolve(false) }
      } catch (e) { resolve(false) }
    }
    req.onerror = function () { resolve(false) }
  })
}

async function saveCredentialViaShared(domain, username, password, extraFields, loginType) {
  const bytes = await getSessionKeyBytes()
  if (!bytes) return { success: false, locked: true }
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return passwordsSaveCredential(domain, username, password, key, extraFields, loginType)
}

async function saveCredential(domain, username, password, extraFields, loginType) {
  const bytes = await getSessionKeyBytes()
  if (!bytes) return { success: false, locked: true }
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  let vault = await getVault()
  if (!vault) vault = { id: 'vault', meta: { createdAt: Date.now(), lastAccess: Date.now() }, credentials: {} }
  if (!vault.credentials) vault.credentials = {}
  if (!vault.credentials[domain]) vault.credentials[domain] = []

  let existingId = null
  let existingExtraFields = []
  let existingLoginType = null
  for (const cred of vault.credentials[domain]) {
    if (cred.deleted) continue
    try {
      const u = await decryptField(cred.username, key)
      if (u === username) {
        existingId = cred.id
        existingExtraFields = await decryptExtraFields(cred.extraFields, key)
        existingLoginType = cred.loginType || null
        break
      }
    } catch (e) {}
  }
  const resolvedLoginType = loginType || existingLoginType || inferLoginType(username)

  const mergedExtraFields = existingExtraFields.slice()
  for (const field of (extraFields || [])) {
    if (!field || !field.label || !field.value) continue
    const idx = mergedExtraFields.findIndex(f => normalizeLabel(f.label) === normalizeLabel(field.label))
    if (idx !== -1) mergedExtraFields[idx] = { label: mergedExtraFields[idx].label, value: field.value }
    else mergedExtraFields.push({ label: field.label, value: field.value })
  }

  const encUser = await encryptField(username, key)
  const encPass = await encryptField(password, key)
  const encExtraFields = await encryptExtraFields(mergedExtraFields, key)
  const now = Date.now()
  if (existingId) {
    for (let i = 0; i < vault.credentials[domain].length; i++) {
      if (vault.credentials[domain][i].id === existingId) {
        vault.credentials[domain][i] = { id: existingId, username: encUser, password: encPass, extraFields: encExtraFields, loginType: resolvedLoginType, createdAt: vault.credentials[domain][i].createdAt || now, updatedAt: now }
        break
      }
    }
  } else {
    vault.credentials[domain].push({ id: genId(), username: encUser, password: encPass, extraFields: encExtraFields, loginType: resolvedLoginType, createdAt: now, updatedAt: now })
  }
  vault.meta = vault.meta || {}
  vault.meta.lastAccess = now
  const ok = await writeVault(vault)
  return { success: ok }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'saveCredential') {
    saveCredentialViaShared(request.domain, request.username, request.password, request.extraFields, request.loginType).then(sendResponse)
    return true
  }
  if (request.action === 'getCredentialsForDomain') {
    credentialsForDomainViaShared(request.domain).then(sendResponse)
    return true
  }
  if (request.action === 'getPersonalInfoField') {
    personalInfoField(request.fieldType).then(sendResponse)
    return true
  }
  if (request.action === 'getPersonalInfoAllEmails') {
    personalInfoAllEmails().then(sendResponse)
    return true
  }
  if (request.action === 'persistSessionKey') {
    chrome.storage.session.set({ masterKeyBytes: request.masterKeyBytes, lastActivity: Date.now() })
      .then(function () { sendResponse({ success: true }) })
      .catch(function () { sendResponse({ success: false }) })
    return true
  }
  if (request.action === 'authenticateWithPassword') {
    authenticateWithPassword(request.password).then(sendResponse)
    return true
  }
  if (request.action === 'openManage') {
    chrome.tabs.create({ url: 'manage.html' })
    sendResponse({ success: true })
    return false
  }
  if (request.action === 'stagePendingSave') {
    stagePendingSave(sender, request.id, request.domain, request.username, request.password, request.extraFields, request.loginType)
      .then(function () { sendResponse({ success: true }) })
    return true
  }
  if (request.action === 'takePendingSave') {
    takePendingSave(sender).then(sendResponse)
    return true
  }
  if (request.action === 'resolvePendingSave') {
    resolvePendingSave(sender, request.id)
      .then(function () { sendResponse({ success: true }) })
    return true
  }
  return false
})

const PENDING_SAVE_TTL_MS = 45000
const PENDING_SAVE_MAX_PER_TAB = 5

const tabPendingSaveLocks = new Map()
function withPendingSaveLock(tabId, fn) {
  const prevTail = tabPendingSaveLocks.get(tabId) || Promise.resolve()
  const result = prevTail.then(fn, fn)
  tabPendingSaveLocks.set(tabId, result.then(() => {}, () => {}))
  return result
}

async function stagePendingSave(sender, id, domain, username, password, extraFields, loginType) {
  const tabId = sender && sender.tab && sender.tab.id
  if (tabId === undefined || tabId === null || !id) return
  return withPendingSaveLock(tabId, async () => {
    const key = 'pendingSave_' + tabId
    try {
      const stored = await chrome.storage.session.get(key)
      const map = (stored && stored[key]) || {}
      map[id] = { domain, username, password, extraFields, loginType, ts: Date.now() }
      const ids = Object.keys(map)
      if (ids.length > PENDING_SAVE_MAX_PER_TAB) {
        ids.sort((a, b) => map[a].ts - map[b].ts)
        for (let i = 0; i < ids.length - PENDING_SAVE_MAX_PER_TAB; i++) delete map[ids[i]]
      }
      await chrome.storage.session.set({ [key]: map })
    } catch (e) {}
  })
}

async function takePendingSave(sender) {
  const tabId = sender && sender.tab && sender.tab.id
  if (tabId === undefined || tabId === null) return { found: false }
  return withPendingSaveLock(tabId, async () => {
    const key = 'pendingSave_' + tabId
    try {
      const stored = await chrome.storage.session.get(key)
      const map = (stored && stored[key]) || {}
      const now = Date.now()
      let changed = false
      let oldestId = null
      for (const id of Object.keys(map)) {
        if (now - map[id].ts > PENDING_SAVE_TTL_MS) { delete map[id]; changed = true; continue }
        if (!oldestId || map[id].ts < map[oldestId].ts) oldestId = id
      }
      if (changed) await chrome.storage.session.set({ [key]: map })
      if (!oldestId) return { found: false }
      const entry = map[oldestId]
      return { found: true, id: oldestId, domain: entry.domain, username: entry.username, password: entry.password, extraFields: entry.extraFields, loginType: entry.loginType }
    } catch (e) {
      return { found: false }
    }
  })
}

async function resolvePendingSave(sender, id) {
  const tabId = sender && sender.tab && sender.tab.id
  if (tabId === undefined || tabId === null || !id) return
  return withPendingSaveLock(tabId, async () => {
    const key = 'pendingSave_' + tabId
    try {
      const stored = await chrome.storage.session.get(key)
      const map = stored && stored[key]
      if (!map) return
      delete map[id]
      if (Object.keys(map).length === 0) await chrome.storage.session.remove(key)
      else await chrome.storage.session.set({ [key]: map })
    } catch (e) {}
  })
}


async function getLockSettings() {
  let soft = 5, hard = 20
  try {
    const r = await chrome.storage.local.get(['softLockTimeout', 'hardLockTimeout'])
    if (r.softLockTimeout) soft = r.softLockTimeout
    if (r.hardLockTimeout) hard = r.hardLockTimeout
  } catch (e) {}
  return { softMs: soft * 60000, hardMs: hard * 60000 }
}

async function authHasPin() {
  const auth = await new Promise(function (resolve) {
    const req = indexedDB.open('ValidVault')
    req.onsuccess = function () {
      try {
        const tx = req.result.transaction('auth', 'readonly')
        const g = tx.objectStore('auth').get('primary')
        g.onsuccess = function () { resolve(g.result || null) }
        g.onerror = function () { resolve(null) }
      } catch (e) { resolve(null) }
    }
    req.onerror = function () { resolve(null) }
  })
  return !!(auth && auth.pinWrappedKey)
}

async function markActivity() {
  try { await chrome.storage.session.set({ lastActivity: Date.now() }) } catch (e) {}
}

async function checkInactivity() {
  const stored = await chrome.storage.session.get(['masterKeyBytes', 'lastActivity'])
  if (!stored || !stored.masterKeyBytes) return
  const last = stored.lastActivity || Date.now()
  const elapsed = Date.now() - last
  const { softMs, hardMs } = await getLockSettings()
  if (elapsed >= hardMs) {
    try { await chrome.storage.session.remove(['masterKeyBytes', 'softLocked']) } catch (e) {}
  } else if (elapsed >= softMs) {
    if (await authHasPin()) {
      try {
        await chrome.storage.session.remove('masterKeyBytes')
        await chrome.storage.session.set({ softLocked: true })
      } catch (e) {}
    } else {
      try { await chrome.storage.session.remove(['masterKeyBytes', 'softLocked']) } catch (e) {}
    }
  }
}

chrome.alarms.create('inactivityCheck', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === 'inactivityCheck') checkInactivity()
})

chrome.runtime.onMessage.addListener(function (request) {
  if (request && request.action === 'activity') markActivity()
  return false
})
