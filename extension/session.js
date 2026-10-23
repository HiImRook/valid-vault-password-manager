const session = {
  masterKey: null,
  unlockedDomains: new Set(),
  lastActivity: 0,
  timeoutId: null
}

const DEFAULT_AUTOLOCK_SEC = 60
const TIMEOUT_CHECK_MS = 2000
const LEGACY_SOFT_KEY = 'softLocked'
const SHARED_ACTIVITY_KEY = 'lastActivity'
const lockListeners = new Set()
let autoLockProvider = null

function setAutoLockProvider(provider) {
  autoLockProvider = typeof provider === 'function' ? provider : null
}

function onLock(listener) {
  lockListeners.add(listener)
  return () => lockListeners.delete(listener)
}

function notifyLock() {
  for (const listener of lockListeners) {
    try { listener() } catch (e) {}
  }
}

async function getTimeouts() {
  let seconds = DEFAULT_AUTOLOCK_SEC
  try {
    if (autoLockProvider) {
      const provided = Number(await autoLockProvider())
      if (provided > 0) seconds = provided
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const r = await chrome.storage.local.get(['autoLockTimeout'])
      if (r.autoLockTimeout) seconds = r.autoLockTimeout
    }
  } catch (e) {}
  return { hardMs: seconds * 1000 }
}

function haveStorage() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session
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
  startTimeout()
}

function getMasterKey() {
  return session.masterKey
}

function hasMasterKey() {
  return session.masterKey !== null
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
  const { hardMs } = await getTimeouts()
  if (elapsed >= hardMs) {
    await lockAll()
    return true
  }
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

async function lockAll() {
  const wasUnlocked = session.masterKey !== null
  session.masterKey = null
  session.unlockedDomains.clear()
  session.lastActivity = 0
  stopTimeout()
  await clearStorageSession()
  if (wasUnlocked) notifyLock()
}

async function clearStorageSession() {
  if (!haveStorage()) return
  try { await chrome.storage.session.remove(['masterKeyBytes', LEGACY_SOFT_KEY]) } catch (e) {}
}

async function getState() {
  return {
    hasMasterKey: hasMasterKey(),
    unlockedDomains: getUnlockedDomains(),
    lastActivity: session.lastActivity
  }
}

function watchSharedLock() {
  if (!haveStorage() || !chrome.storage.onChanged) return
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !changes.masterKeyBytes || changes.masterKeyBytes.newValue) return
    if (session.masterKey) lockAll()
  })
}

watchSharedLock()

export {
  setAutoLockProvider,
  onLock,
  setMasterKey,
  getMasterKey,
  hasMasterKey,
  unlockDomain,
  lockDomain,
  isDomainUnlocked,
  getUnlockedDomains,
  resetActivity,
  checkTimeout,
  lockAll,
  clearStorageSession,
  getState
}
