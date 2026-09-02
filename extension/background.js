async function getSessionKeyBytes() {
  try {
    const stored = await chrome.storage.session.get('masterKeyBytes')
    if (stored && stored.masterKeyBytes) return stored.masterKeyBytes
  } catch (e) {}
  return null
}

async function getVault() {
  return new Promise(function (resolve) {
    const req = indexedDB.open('ValidVault', 1)
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

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'getCredentialsForDomain') {
    credentialsForDomain(request.domain).then(sendResponse)
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
    const req = indexedDB.open('ValidVault', 1)
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
