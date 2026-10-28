const DB_NAME = 'ValidVault'
const DB_VERSION = 5
const VAULT_CHANGE_STAMP = 'vaultChangedAt'
const MIRROR_PREFIX = 'vvMirror:'
const MIRROR_READY_KEY = 'vvMirrorReady'
const MIRROR_BYTES_TAG = '$vvBytes'
const STORE_NAMES = ['auth', 'passwords', 'wallets', 'webcreds', 'personalInfo', 'vaultMigration', 'bookmarks']

let db = null
let readyPromise = null

function mirrorAvailable() {
  return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local
}

function mirrorKey(storeName, id) {
  return MIRROR_PREFIX + storeName + ':' + id
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(text) {
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function toMirror(value) {
  if (value instanceof ArrayBuffer) return { [MIRROR_BYTES_TAG]: 'buffer', d: bytesToBase64(new Uint8Array(value)) }
  if (ArrayBuffer.isView(value)) return { [MIRROR_BYTES_TAG]: value.constructor.name, d: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) }
  if (Array.isArray(value)) return value.map(toMirror)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = toMirror(v)
    return out
  }
  return value
}

function fromMirror(value) {
  if (Array.isArray(value)) return value.map(fromMirror)
  if (value && typeof value === 'object') {
    if (typeof value[MIRROR_BYTES_TAG] === 'string' && typeof value.d === 'string') {
      const bytes = base64ToBytes(value.d)
      if (value[MIRROR_BYTES_TAG] === 'buffer') return bytes.buffer
      const View = globalThis[value[MIRROR_BYTES_TAG]]
      return typeof View === 'function' && View.BYTES_PER_ELEMENT ? new View(bytes.buffer, 0, bytes.byteLength / View.BYTES_PER_ELEMENT) : bytes
    }
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = fromMirror(v)
    return out
  }
  return value
}

async function mirrorWrite(storeName, data) {
  if (!mirrorAvailable() || !data || data.id === undefined) return
  try { await chrome.storage.local.set({ [mirrorKey(storeName, data.id)]: toMirror(data) }) } catch (e) {}
}

async function mirrorRemove(storeName, id) {
  if (!mirrorAvailable()) return
  try { await chrome.storage.local.remove(mirrorKey(storeName, id)) } catch (e) {}
}

async function mirrorClear(names) {
  if (!mirrorAvailable()) return
  try {
    const all = await chrome.storage.local.get(null)
    const prefixes = names.map((name) => MIRROR_PREFIX + name + ':')
    const keys = Object.keys(all || {}).filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
    if (keys.length) await chrome.storage.local.remove(keys)
  } catch (e) {}
}

function readAllRecords(database, storeName) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

function readRecord(database, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).get(key)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

async function restoreFromMirror(database, mirrored) {
  const pending = []
  for (const [key, value] of Object.entries(mirrored)) {
    const rest = key.slice(MIRROR_PREFIX.length)
    const at = rest.indexOf(':')
    const storeName = rest.slice(0, at)
    if (!STORE_NAMES.includes(storeName) || !value || value.id === undefined) continue
    if (await readRecord(database, storeName, value.id)) continue
    pending.push({ storeName, record: fromMirror(value) })
  }
  if (!pending.length) return
  await new Promise((resolve, reject) => {
    const tx = database.transaction(Array.from(new Set(pending.map((p) => p.storeName))), 'readwrite')
    for (const p of pending) tx.objectStore(p.storeName).put(p.record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

async function seedMirror(database) {
  const entries = {}
  for (const storeName of STORE_NAMES) {
    for (const record of await readAllRecords(database, storeName)) {
      if (record && record.id !== undefined) entries[mirrorKey(storeName, record.id)] = toMirror(record)
    }
  }
  entries[MIRROR_READY_KEY] = Date.now()
  await chrome.storage.local.set(entries)
}

async function requestPersistence() {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      if (!(await navigator.storage.persisted())) await navigator.storage.persist()
    }
  } catch (e) {}
}

async function prepareStorage(database) {
  if (!mirrorAvailable()) return
  requestPersistence()
  try {
    const authKey = mirrorKey('auth', 'primary')
    const marks = await chrome.storage.local.get([MIRROR_READY_KEY, authKey])
    const localAuth = await readRecord(database, 'auth', 'primary')
    if (!localAuth && marks[authKey]) {
      const all = await chrome.storage.local.get(null)
      const mirrored = {}
      for (const [key, value] of Object.entries(all || {})) if (key.startsWith(MIRROR_PREFIX)) mirrored[key] = value
      await restoreFromMirror(database, mirrored)
      return
    }
    if (localAuth && (!marks[MIRROR_READY_KEY] || !marks[authKey])) await seedMirror(database)
  } catch (e) {}
}

async function openDB() {
  if (!readyPromise) {
    readyPromise = openRawDB().then(async (database) => {
      await prepareStorage(database)
      return database
    }).catch((error) => {
      readyPromise = null
      throw error
    })
  }
  return readyPromise
}

async function openRawDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    
    request.onsuccess = () => {
      db = request.result
      db.onversionchange = () => {
        db.close()
        db = null
        readyPromise = null
      }
      resolve(db)
    }
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result
      
      if (!database.objectStoreNames.contains('auth')) {
        database.createObjectStore('auth', { keyPath: 'id' })
      }
      
      if (!database.objectStoreNames.contains('passwords')) {
        database.createObjectStore('passwords', { keyPath: 'id' })
      }
      
      if (!database.objectStoreNames.contains('wallets')) {
        database.createObjectStore('wallets', { keyPath: 'id' })
      }
      
      if (!database.objectStoreNames.contains('webcreds')) {
        database.createObjectStore('webcreds', { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains('personalInfo')) {
        database.createObjectStore('personalInfo', { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains('vaultMigration')) {
        database.createObjectStore('vaultMigration', { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains('bookmarks')) {
        database.createObjectStore('bookmarks', { keyPath: 'id' })
      }
    }
  })
}

async function getStore(storeName, mode) {
  const database = await openDB()
  const tx = database.transaction(storeName, mode)
  return tx.objectStore(storeName)
}

async function get(storeName, key) {
  const store = await getStore(storeName, 'readonly')
  return new Promise((resolve, reject) => {
    const request = store.get(key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || null)
  })
}

async function put(storeName, data) {
  const store = await getStore(storeName, 'readwrite')
  const result = await new Promise((resolve, reject) => {
    const tx = store.transaction
    let value
    const request = store.put(data)
    request.onsuccess = () => { value = request.result }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => resolve(value)
    tx.onerror = () => reject(tx.error || request.error)
    tx.onabort = () => reject(tx.error || request.error || new Error('Save did not complete'))
  })
  await mirrorWrite(storeName, data)
  return result
}

async function remove(storeName, key) {
  const store = await getStore(storeName, 'readwrite')
  await new Promise((resolve, reject) => {
    const tx = store.transaction
    const request = store.delete(key)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || request.error)
    tx.onabort = () => reject(tx.error || request.error || new Error('Delete did not complete'))
  })
  await mirrorRemove(storeName, key)
}

async function markVaultChanged() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) await chrome.storage.local.set({ [VAULT_CHANGE_STAMP]: Date.now() })
  } catch (e) {}
}

async function putVault(storeName, data) {
  const result = await put(storeName, data)
  await markVaultChanged()
  return result
}

async function getAuth() {
  return get('auth', 'primary')
}

async function setAuth(authData) {
  return put('auth', { id: 'primary', ...authData })
}

async function getPasswordVault() {
  return get('passwords', 'vault')
}

async function setPasswordVault(vaultData) {
  return putVault('passwords', { id: 'vault', ...vaultData })
}

async function getWalletVault() {
  return get('wallets', 'vault')
}

async function setWalletVault(vaultData) {
  return putVault('wallets', { id: 'vault', ...vaultData })
}

async function getWebCredsVault() {
  return get('webcreds', 'vault')
}

async function setWebCredsVault(vaultData) {
  return putVault('webcreds', { id: 'vault', ...vaultData })
}

async function getPersonalInfo() {
  return get('personalInfo', 'profile')
}

async function setPersonalInfo(profileData) {
  return putVault('personalInfo', { id: 'profile', ...profileData })
}

async function getVaultMigrationJournal() {
  return get('vaultMigration', 'single-blob-migration')
}

async function setVaultMigrationJournal(journal) {
  return put('vaultMigration', { id: 'single-blob-migration', ...journal })
}

async function clearVaultMigrationJournal() {
  return remove('vaultMigration', 'single-blob-migration')
}

async function getBookmarksVault() {
  return get('bookmarks', 'vault')
}

async function setBookmarksVault(vaultData) {
  return putVault('bookmarks', { id: 'vault', ...vaultData })
}

const VAULT_DATA_STORES = ['passwords', 'webcreds', 'personalInfo', 'vaultMigration', 'bookmarks', 'wallets']

async function clearStores(names) {
  const database = await openDB()
  await new Promise((resolve, reject) => {
    const tx = database.transaction(names, 'readwrite')
    for (const storeName of names) tx.objectStore(storeName).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  await mirrorClear(names)
}

async function clearAll() {
  await clearStores(STORE_NAMES)
}

async function clearVaultData() {
  await clearStores(VAULT_DATA_STORES)
  await markVaultChanged()
}

export {
  openDB,
  clearVaultData,
  get,
  put,
  remove,
  getAuth,
  setAuth,
  getPasswordVault,
  setPasswordVault,
  getWalletVault,
  setWalletVault,
  getWebCredsVault,
  setWebCredsVault,
  getPersonalInfo,
  setPersonalInfo,
  getVaultMigrationJournal,
  setVaultMigrationJournal,
  clearVaultMigrationJournal,
  getBookmarksVault,
  setBookmarksVault,
  clearAll
}
