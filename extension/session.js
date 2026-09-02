import { deriveKeyFromSecret, generateSalt, wrapMasterKey, unwrapMasterKey } from './crypto.js'
import { getAuth } from './store.js'

// Session model:
// - masterKey (CryptoKey) held in memory = unlocked (per-context).
// - Hard unlock: fingerprint OR password (setMasterKey). Both fully unlock.
// - Session PIN: wraps the master-key bytes with a PIN-derived key. Stored in
//   chrome.storage.session so it is SHARED across popup + manage + background
//   and auto-clears when the browser closes. Lets an inactivity SOFT-lock be
//   resumed quickly with the PIN.
// - Manual lock = hard lock: wipes masterKey AND the shared PIN wrap. PIN cannot resume.
// - Inactivity timeout = SOFT lock IF a session PIN is set; else hard lock.

const session = {
  masterKey: null,          // CryptoKey when unlocked, null when locked
  unlockedDomains: new Set(),
  lastActivity: 0,
  timeoutId: null,
  softLocked: false
}

const DEFAULT_SOFT_MIN = 5
const DEFAULT_HARD_MIN = 20

async function getTimeouts() {
  let soft = DEFAULT_SOFT_MIN, hard = DEFAULT_HARD_MIN
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const r = await chrome.storage.local.get(['softLockTimeout', 'hardLockTimeout'])
      if (r.softLockTimeout) soft = r.softLockTimeout
      if (r.hardLockTimeout) hard = r.hardLockTimeout
    }
  } catch (e) {}
  return { softMs: soft * 60000, hardMs: hard * 60000 }
}
const PIN_KEY = 'sessionPin'   // chrome.storage.session: { salt:[], wrapped:{iv,wrapped} }
const SOFT_KEY = 'softLocked'  // chrome.storage.session: true when idle/manual soft-locked

async function cryptoKeyToBytes(cryptoKey) {
  return new Uint8Array(await crypto.subtle.exportKey('raw', cryptoKey))
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

async function writePin(obj) {
  if (!haveStorage()) return
  try { await chrome.storage.session.set({ [PIN_KEY]: obj }) } catch (e) {}
}

async function removePin() {
  if (!haveStorage()) return
  try { await chrome.storage.session.remove(PIN_KEY) } catch (e) {}
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

// ---- Session PIN (shared via chrome.storage.session) ----

// async: reads shared storage



// async: reads shared storage
async function isSoftLocked() {
  const soft = await readSoftFlag()
  if (!soft) return false
  const pin = await readPin()
  return pin !== null
}


// ---- Domains ----

function unlockDomain(domain) { session.unlockedDomains.add(domain) }
function lockDomain(domain) { session.unlockedDomains.delete(domain) }
function isDomainUnlocked(domain) { return session.unlockedDomains.has(domain) }
function getUnlockedDomains() { return Array.from(session.unlockedDomains) }

// ---- Activity / timeout ----

function resetActivity() { session.lastActivity = Date.now() }

async function checkTimeout() {
  if (!session.masterKey) return false
  const elapsed = Date.now() - session.lastActivity
  const { softMs, hardMs } = await getTimeouts()
  // hard-lock takes over at the longer threshold
  if (elapsed >= hardMs) {
    await lockAll()
    return true
  }
  // soft-lock at the shorter threshold IF a permanent PIN exists to resume with
  if (elapsed >= softMs) {
    const status = await getAuthPinPresent()
    if (status) { await softLock() } else { await lockAll() }
    return true
  }
  return false
}

// checks whether a permanent auth PIN exists (in vault auth data)
async function getAuthPinPresent() {
  try {
    const auth = await getAuth()
    return !!(auth && auth.pinWrappedKey)
  } catch (e) {}
  return false
}

function startTimeout() {
  stopTimeout()
  session.timeoutId = setInterval(() => { checkTimeout() }, 10000)
}

function stopTimeout() {
  if (session.timeoutId) {
    clearInterval(session.timeoutId)
    session.timeoutId = null
  }
}

// Soft lock: clear the live master key but KEEP the shared PIN wrap so
// resumeWithPin can restore it. Fingerprint/password still work too.
async function softLock() {
  session.masterKey = null
  session.unlockedDomains.clear()
  session.lastActivity = 0
  session.softLocked = true
  await writeSoftFlag(true)
  stopTimeout()
}

// Hard lock: wipe everything, including the shared session PIN. Full re-auth required.
async function lockAll() {
  session.masterKey = null
  session.unlockedDomains.clear()
  session.lastActivity = 0
  session.softLocked = false
  await writeSoftFlag(false)
  stopTimeout()
}

// Clears the persisted service-worker copy of the master key bytes.
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
