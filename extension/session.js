import { getAuth } from './store.js'

const session = {
  masterKey: null,
  unlockedDomains: new Set(),
  lastActivity: 0,
  timeoutId: null,
  softLocked: false
}

const DEFAULT_AUTOLOCK_SEC = 60
const TIMEOUT_CHECK_MS = 2000
const PIN_KEY = 'sessionPin'
const SOFT_KEY = 'softLocked'
const SHARED_ACTIVITY_KEY = 'lastActivity'

async function getTimeouts() {
  let seconds = DEFAULT_AUTOLOCK_SEC
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const r = await chrome.storage.local.get(['autoLockTimeout'])
      if (r.autoLockTimeout) seconds = r.autoLockTimeout
    }
  } catch (e) {}
  return { softMs: seconds * 1000 + 1, hardMs: seconds * 1000 }
}

function haveStorage() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session
}

async function readPin() {
  if (!haveStorage()) return null
  try {
    const r = await chrome.storage.session.get(PIN_KEY)
    return r && r[PIN_KEY] ? r[PIN_KEY] : null
  } catch (e) { return null }
}

async function writeSoftFlag(v) {
  if (!haveStorage()) return
  try {
    if (v) await chrome.storage.session.set({ [SOFT_KEY]: true })
    else await chrome.storage.session.remove(SOFT_KEY)
  } catch (e) {}
}

async function readSoftFlag() {
  if (!haveStorage()) return false
  try { const r = await chrome.storage.session.get(SOFT_KEY); return !!(r && r[SOFT_KEY]) } catch (e) { return false }
}

async function readSharedActivity() {
  if (!haveStorage()) return 0
  try {
    const r = await chrome.storage.session.get(SHARED_ACTIVITY_KEY)
    return r && typeof r[SHARED_ACTIVITY_KEY] === 'number' ? r[SHARED_ACTIVITY_KEY] : 0
  } catch (e) { return 0 }
}

function setMasterKey(key) {
  session.masterKey = key
  session.lastActivity = Date.now()
  session.softLocked = false
  writeSoftFlag(false)
  startTimeout()
}

function getMasterKey() {
  return session.masterKey
}

function hasMasterKey() {
  return session.masterKey !== null
}

async function isSoftLocked() {
  const soft = await readSoftFlag()
  if (!soft) return false
  const pin = await readPin()
  return pin !== null
}

function unlockDomain(domain) { session.unlockedDomains.add(domain) }
function lockDomain(domain) { session.unlockedDomains.delete(domain) }
function isDomainUnlocked(domain) { return session.unlockedDomains.has(domain) }
function getUnlockedDomains() { return Array.from(session.unlockedDomains) }

function resetActivity() { session.lastActivity = Date.now() }

async function checkTimeout() {
  if (!session.masterKey) return false
  const shared = await readSharedActivity()
  if (shared > session.lastActivity) session.lastActivity = shared
  const elapsed = Date.now() - session.lastActivity
  const { softMs, hardMs } = await getTimeouts()
  if (elapsed >= hardMs) {
    await lockAll()
    return true
  }
  if (elapsed >= softMs) {
    const status = await getAuthPinPresent()
    if (status) { await softLock() } else { await lockAll() }
    return true
  }
  return false
}

async function getAuthPinPresent() {
  try {
    const auth = await getAuth()
    return !!(auth && auth.pinWrappedKey)
  } catch (e) {}
  return false
}

function startTimeout() {
  stopTimeout()
  session.timeoutId = setInterval(() => { checkTimeout() }, TIMEOUT_CHECK_MS)
}

function stopTimeout() {
  if (session.timeoutId) {
    clearInterval(session.timeoutId)
    session.timeoutId = null
  }
}

async function softLock() {
  session.masterKey = null
  session.unlockedDomains.clear()
  session.lastActivity = 0
  session.softLocked = true
  await writeSoftFlag(true)
  stopTimeout()
}

async function lockAll() {
  session.masterKey = null
  session.unlockedDomains.clear()
  session.lastActivity = 0
  session.softLocked = false
  await writeSoftFlag(false)
  await clearStorageSession()
  stopTimeout()
}

async function clearStorageSession() {
  if (!haveStorage()) return
  try { await chrome.storage.session.remove('masterKeyBytes') } catch (e) {}
}

async function getState() {
  return {
    hasMasterKey: hasMasterKey(),
    softLocked: await isSoftLocked(),
    unlockedDomains: getUnlockedDomains(),
    lastActivity: session.lastActivity
  }
}

export {
  setMasterKey,
  getMasterKey,
  hasMasterKey,
  isSoftLocked,
  unlockDomain,
  lockDomain,
  isDomainUnlocked,
  getUnlockedDomains,
  resetActivity,
  checkTimeout,
  softLock,
  lockAll,
  clearStorageSession,
  getState
}
