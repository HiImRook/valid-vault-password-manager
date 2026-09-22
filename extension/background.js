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

async function saveCredentialViaShared(domain, username, password, extraFields, loginType) {
  const bytes = await getSessionKeyBytes()
  if (!bytes) return { success: false, locked: true }
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return passwordsSaveCredential(domain, username, password, key, extraFields, loginType)
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
