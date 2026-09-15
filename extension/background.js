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

async function personalInfoField(fieldType) {
  const bytes = await getSessionKeyBytes()
  if (!bytes) return { success: false, value: null, locked: true }
  const record = await getPersonalInfoRecord()
  if (!record || !record.data) return { success: true, value: null }
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  let profile
  try {
    const json = await decryptField(record.data, key)
    profile = JSON.parse(json)
  } catch (e) {
    return { success: false, value: null, locked: true }
  }
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
    try {
      out.push({ id: cred.id, username: await decryptField(cred.username, key), password: await decryptField(cred.password, key) })
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

async function saveCredential(domain, username, password) {
  const bytes = await getSessionKeyBytes()
  if (!bytes) return { success: false, locked: true }
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  let vault = await getVault()
  if (!vault) vault = { id: 'vault', meta: { createdAt: Date.now(), lastAccess: Date.now() }, credentials: {} }
  if (!vault.credentials) vault.credentials = {}
  if (!vault.credentials[domain]) vault.credentials[domain] = []

  // if a live credential with the same username exists, update it (dedup), else add
  let existingId = null
  for (const cred of vault.credentials[domain]) {
    if (cred.deleted) continue
    try {
      const u = await decryptField(cred.username, key)
      if (u === username) { existingId = cred.id; break }
    } catch (e) {}
  }
  const encUser = await encryptField(username, key)
  const encPass = await encryptField(password, key)
  const now = Date.now()
  if (existingId) {
    for (let i = 0; i < vault.credentials[domain].length; i++) {
      if (vault.credentials[domain][i].id === existingId) {
        vault.credentials[domain][i] = { id: existingId, username: encUser, password: encPass, createdAt: vault.credentials[domain][i].createdAt || now, updatedAt: now }
        break
      }
    }
  } else {
    vault.credentials[domain].push({ id: genId(), username: encUser, password: encPass, createdAt: now, updatedAt: now })
  }
  vault.meta = vault.meta || {}
  vault.meta.lastAccess = now
  const ok = await writeVault(vault)
  return { success: ok }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'saveCredential') {
    saveCredential(request.domain, request.username, request.password).then(sendResponse)
    return true
  }
  if (request.action === 'getCredentialsForDomain') {
    credentialsForDomain(request.domain).then(sendResponse)
    return true
  }
  if (request.action === 'getPersonalInfoField') {
    personalInfoField(request.fieldType).then(sendResponse)
    return true
  }
  if (request.action === 'openManage') {
    chrome.tabs.create({ url: 'manage.html' })
    sendResponse({ success: true })
    return false
  }
  return false
})

// ---- Inactivity soft/hard lock (driven by the service worker) ----

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
  if (!stored || !stored.masterKeyBytes) return  // already locked
  const last = stored.lastActivity || Date.now()
  const elapsed = Date.now() - last
  const { softMs, hardMs } = await getLockSettings()
  if (elapsed >= hardMs) {
    // hard lock: wipe key + soft flag
    try { await chrome.storage.session.remove(['masterKeyBytes', 'softLocked']) } catch (e) {}
  } else if (elapsed >= softMs) {
    // soft lock: wipe live key but set soft flag IF a PIN exists to resume
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

// any message counts as activity
chrome.runtime.onMessage.addListener(function (request) {
  if (request && request.action === 'activity') markActivity()
  return false
})
