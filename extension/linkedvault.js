import {
  VAULT_FILE_FORMAT,
  VAULT_FILE_VERSION,
  KEY_MISMATCH_MSG,
  LOCAL_MISMATCH_MSG,
  parseBundle as parseVaultFile,
  localVaultOpensWith,
  bundleOpensWith,
  buildBundle,
  bundleHasData,
  mergeBundle
} from './vaultfile.js'

const LINK_DB_NAME = 'ValidVaultLink'
const LINK_DB_VERSION = 1
const LINK_STORE = 'link'
const LINK_KEY = 'vaultFile'
const SYNC_LOCK = 'valid-vault-uni-vault-sync'
const STATE_KEYS = ['vaultChangedAt', 'linkSyncedAt', 'linkFileSig']
const LAST_LINK_KEY = 'linkLastName'
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
  try { await chrome.storage.local.set({ [LAST_LINK_KEY]: handle.name }) } catch (e) {}
}

async function clearLink() {
  try { await linkOp('readwrite', (s) => s.delete(LINK_KEY)) } catch (e) {}
  await chrome.storage.local.remove(['linkSyncedAt', 'linkFileSig', 'linkStatus', LAST_LINK_KEY])
}

async function getLostLinkName() {
  if (await getLink()) return ''
  try { return (await chrome.storage.local.get(LAST_LINK_KEY))[LAST_LINK_KEY] || '' } catch (e) { return '' }
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

function parseBundle(text) {
  if (!text || !text.trim()) return null
  return parseVaultFile(text)
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
      const msg = e && e.message ? e.message : NOT_VAULT_MSG
      await setStatus('refused', msg)
      return { state: 'refused', message: msg }
    }
    if (bundle) {
      try {
        const result = await mergeBundle(bundle, mk)
        merged = result.changed
      } catch (e) {
        const msg = e && e.message ? e.message : String(e)
        await setStatus('refused', msg)
        return { state: 'refused', message: msg }
      }
    }
  }
  const syncedAt = Date.now()
  let newSig = sig
  let wrote = false
  if ((dirty || merged) && bundleHasData(await buildBundle())) {
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

async function reconnectAfterUnlock(mk) {
  const link = await getLink()
  if (!link) return { state: 'unlinked' }
  if (!(await hasWritePermission(link.handle, true))) {
    await setStatus('needs-permission', PERMISSION_MSG)
    return { state: 'needs-permission', message: PERMISSION_MSG }
  }
  return syncNow(mk)
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
  reconnect,
  reconnectAfterUnlock,
  getLostLinkName
}
