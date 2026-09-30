import * as store from './store.js'
import * as passwords from './passwords.js'
import * as webcreds from './webcreds.js'
import * as personalinfo from './personalinfo.js'
import * as bookmarks from './bookmarks.js'
import * as wallets from './wallets.js'
import { decrypt } from './crypto.js'

const VAULT_FILE_FORMAT = 'valid-vault-vault'
const VAULT_FILE_VERSION = 1
const LINK_DB_NAME = 'ValidVaultLink'
const LINK_DB_VERSION = 1
const LINK_STORE = 'link'
const LINK_KEY = 'vaultFile'
const SYNC_LOCK = 'valid-vault-uni-vault-sync'
const STATE_KEYS = ['vaultChangedAt', 'linkSyncedAt', 'linkFileSig']
const KEY_MISMATCH_MSG = 'This vault was made with a different master key. Import that master key first, then import the vault.'
const LOCAL_MISMATCH_MSG = 'This browser\'s saved data uses a different master key than the one unlocked. Import the matching master key first.'
const NOT_VAULT_MSG = 'The linked file is not a readable Valid Vault vault file. Nothing was changed.'
const UNAVAILABLE_MSG = 'The linked vault file cannot be reached. It may have been moved, renamed, or be on a drive that is not plugged in. This browser keeps working with its own copy.'
const PERMISSION_MSG = 'This browser needs your permission again to use the vault file. Click Reconnect.'

function uniVaultSupported() {
  return typeof globalThis.showSaveFilePicker === 'function' && typeof globalThis.showOpenFilePicker === 'function'
}

function isBrave() {
  return typeof navigator !== 'undefined' && !!navigator.brave
}

function openLinkDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LINK_DB_NAME, LINK_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(LINK_STORE)) db.createObjectStore(LINK_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function linkOp(mode, action) {
  const db = await openLinkDB()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LINK_STORE, mode)
      const req = action(tx.objectStore(LINK_STORE))
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function getLink() {
  try { return (await linkOp('readonly', (s) => s.get(LINK_KEY))) || null } catch (e) { return null }
}

async function saveLink(handle) {
  await linkOp('readwrite', (s) => s.put({ handle, name: handle.name, linkedAt: Date.now() }, LINK_KEY))
}

async function clearLink() {
  try { await linkOp('readwrite', (s) => s.delete(LINK_KEY)) } catch (e) {}
  await chrome.storage.local.remove(['linkSyncedAt', 'linkFileSig', 'linkStatus'])
}

async function setStatus(state, message) {
  const status = { state, message: message || '', at: Date.now() }
  try { await chrome.storage.local.set({ linkStatus: status }) } catch (e) {}
  return status
}

async function getStatus() {
  const link = await getLink()
  if (!link) return { linked: false }
  let status = null
  try { status = (await chrome.storage.local.get('linkStatus')).linkStatus || null } catch (e) {}
  let synced = 0
  try { synced = (await chrome.storage.local.get('linkSyncedAt')).linkSyncedAt || 0 } catch (e) {}
  return { linked: true, name: link.name, status, syncedAt: synced }
}

async function rowOpensWith(row, key) {
  if (!row) return true
  try { await passwords.decryptAnyRowToTree(row, key); return true } catch (e) { return false }
}

async function webCredsOpenWith(vault, key) {
  if (!vault || !vault.credentials) return true
  for (const category of Object.keys(vault.credentials)) {
    for (const cred of vault.credentials[category]) {
      if (cred.deleted) continue
      try { await decrypt(cred.name, key); return true } catch (e) { return false }
    }
  }
  return true
}

async function personalInfoOpensWith(record, key) {
  if (!record || !record.data) return true
  try { await decrypt(record.data, key); return true } catch (e) { return false }
}

async function localVaultOpensWith(key) {
  if (!(await rowOpensWith(await store.getPasswordVault(), key))) return false
  if (!(await webCredsOpenWith(await store.getWebCredsVault(), key))) return false
  if (!(await personalInfoOpensWith(await store.getPersonalInfo(), key))) return false
  if (!(await bookmarks.rowOpensWith(await store.getBookmarksVault(), key))) return false
  return wallets.rowOpensWith(await store.getWalletVault(), key)
}

async function bundleOpensWith(bundle, key) {
  if (!(await rowOpensWith(bundle.vault, key))) return false
  if (!(await webCredsOpenWith(bundle.webcreds, key))) return false
  if (!(await personalInfoOpensWith(bundle.personalInfo, key))) return false
  if (!(await bookmarks.rowOpensWith(bundle.bookmarks, key))) return false
  return wallets.rowOpensWith(bundle.wallets, key)
}

async function buildBundle() {
  return {
    format: VAULT_FILE_FORMAT,
    version: VAULT_FILE_VERSION,
    vault: await store.getPasswordVault(),
    webcreds: await store.getWebCredsVault(),
    personalInfo: await store.getPersonalInfo(),
    bookmarks: await store.getBookmarksVault(),
    wallets: await store.getWalletVault()
  }
}

function bundleHasData(bundle) {
  return !!(bundle.vault || bundle.webcreds || bundle.personalInfo || bundle.bookmarks || bundle.wallets)
}

function parseBundle(text) {
  if (!text || !text.trim()) return null
  const obj = JSON.parse(text)
  if (!obj || obj.format !== VAULT_FILE_FORMAT) throw new Error(NOT_VAULT_MSG)
  return obj
}

async function mergeBundle(bundle, mk) {
  if (!(await bundleOpensWith(bundle, mk))) throw new Error(KEY_MISMATCH_MSG)
  if (!(await localVaultOpensWith(mk))) throw new Error(LOCAL_MISMATCH_MSG)
  if (bundle.vault) {
    const localRow = await store.getPasswordVault()
    const incomingTree = await passwords.decryptAnyRowToTree(bundle.vault, mk)
    if (!localRow) {
      await passwords.writeVaultTree(incomingTree, mk)
    } else {
      const localTree = await passwords.decryptAnyRowToTree(localRow, mk)
      const merged = passwords.mergeVaults(localTree, incomingTree)
      merged.meta.lastAccess = Date.now()
      await passwords.writeVaultTree(merged, mk)
    }
  }
  if (bundle.webcreds) {
    const localWc = await store.getWebCredsVault()
    if (!localWc) {
      await store.setWebCredsVault(bundle.webcreds)
    } else {
      const mergedWc = await webcreds.mergeWebCredsVaults(localWc, bundle.webcreds, mk)
      mergedWc.meta.lastAccess = Date.now()
      await store.setWebCredsVault(mergedWc)
    }
  }
  if (bundle.personalInfo) {
    const localPi = await store.getPersonalInfo()
    await store.setPersonalInfo(personalinfo.mergeProfiles(localPi, bundle.personalInfo))
  }
  if (bundle.bookmarks) await bookmarks.importRow(bundle.bookmarks, mk)
  if (bundle.wallets) await wallets.importRow(bundle.wallets, mk)
}

async function hasWritePermission(handle, ask) {
  try {
    if (typeof handle.queryPermission !== 'function') return true
    const opts = { mode: 'readwrite' }
    if ((await handle.queryPermission(opts)) === 'granted') return true
    if (ask && typeof handle.requestPermission === 'function') return (await handle.requestPermission(opts)) === 'granted'
  } catch (e) {}
  return false
}

function signatureOf(file) {
  return file.lastModified + ':' + file.size
}

async function writeBundle(handle) {
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(await buildBundle()))
  await writable.close()
  return signatureOf(await handle.getFile())
}

function announce(merged) {
  if (!merged) return
  try { chrome.runtime.sendMessage({ action: 'vaultSynced' }).catch(() => {}) } catch (e) {}
  try { chrome.runtime.sendMessage({ action: 'bookmarksChanged' }).catch(() => {}) } catch (e) {}
}

async function runSync(mk, force) {
  const link = await getLink()
  if (!link) return { state: 'unlinked' }
  const handle = link.handle
  if (!(await hasWritePermission(handle, false))) {
    await setStatus('needs-permission', PERMISSION_MSG)
    return { state: 'needs-permission', message: PERMISSION_MSG }
  }
  let file
  try { file = await handle.getFile() } catch (e) {
    await setStatus('unavailable', UNAVAILABLE_MSG)
    return { state: 'unavailable', message: UNAVAILABLE_MSG }
  }
  const sig = signatureOf(file)
  const meta = await chrome.storage.local.get(STATE_KEYS)
  const dirty = force || (meta.vaultChangedAt || 0) > (meta.linkSyncedAt || 0)
  let merged = false
  if (force || sig !== meta.linkFileSig) {
    let bundle
    try { bundle = parseBundle(await file.text()) } catch (e) {
      await setStatus('refused', NOT_VAULT_MSG)
      return { state: 'refused', message: NOT_VAULT_MSG }
    }
    if (bundle) {
      try { await mergeBundle(bundle, mk) } catch (e) {
        const msg = e && e.message ? e.message : String(e)
        await setStatus('refused', msg)
        return { state: 'refused', message: msg }
      }
      merged = true
    }
  }
  const syncedAt = Date.now()
  let newSig = sig
  let wrote = false
  if (dirty && bundleHasData(await buildBundle())) {
    try { newSig = await writeBundle(handle) } catch (e) {
      await setStatus('unavailable', UNAVAILABLE_MSG)
      return { state: 'unavailable', message: UNAVAILABLE_MSG }
    }
    wrote = true
  }
  await chrome.storage.local.set({ linkSyncedAt: syncedAt, linkFileSig: newSig })
  await setStatus('ok', '')
  announce(merged)
  return { state: 'ok', merged, wrote }
}

async function syncNow(mk, options) {
  if (!mk) return { state: 'locked' }
  const force = !!(options && options.force)
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    return navigator.locks.request(SYNC_LOCK, () => runSync(mk, force))
  }
  return runSync(mk, force)
}

async function linkExisting(handle, mk) {
  if (!(await hasWritePermission(handle, true))) return { state: 'needs-permission', message: 'Permission to update the file was not granted. The file was not linked.' }
  let bundle
  try { bundle = parseBundle(await (await handle.getFile()).text()) } catch (e) {
    return { state: 'refused', message: e && e.message ? e.message : String(e) }
  }
  if (bundle && !(await bundleOpensWith(bundle, mk))) return { state: 'refused', message: KEY_MISMATCH_MSG }
  if (!(await localVaultOpensWith(mk))) return { state: 'refused', message: LOCAL_MISMATCH_MSG }
  await chrome.storage.local.remove(['linkSyncedAt', 'linkFileSig', 'linkStatus'])
  await saveLink(handle)
  return syncNow(mk, { force: true })
}

async function linkNew(handle, mk) {
  if (!(await localVaultOpensWith(mk))) return { state: 'refused', message: LOCAL_MISMATCH_MSG }
  const sig = await writeBundle(handle)
  await saveLink(handle)
  await chrome.storage.local.set({ linkSyncedAt: Date.now(), linkFileSig: sig })
  await setStatus('ok', '')
  return { state: 'ok', merged: false, wrote: true }
}

async function reconnect(mk) {
  const link = await getLink()
  if (!link) return { state: 'unlinked' }
  if (!(await hasWritePermission(link.handle, true))) {
    await setStatus('needs-permission', PERMISSION_MSG)
    return { state: 'needs-permission', message: PERMISSION_MSG }
  }
  return syncNow(mk, { force: true })
}

export {
  VAULT_FILE_FORMAT,
  VAULT_FILE_VERSION,
  KEY_MISMATCH_MSG,
  LOCAL_MISMATCH_MSG,
  uniVaultSupported,
  isBrave,
  getLink,
  getStatus,
  clearLink,
  localVaultOpensWith,
  bundleOpensWith,
  buildBundle,
  bundleHasData,
  mergeBundle,
  syncNow,
  linkExisting,
  linkNew,
  reconnect
}
