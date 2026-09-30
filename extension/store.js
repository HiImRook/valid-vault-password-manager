const DB_NAME = 'ValidVault'
const DB_VERSION = 5
const VAULT_CHANGE_STAMP = 'vaultChangedAt'

let db = null

async function openDB() {
  if (db) return db
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    
    request.onsuccess = () => {
      db = request.result
      db.onversionchange = () => {
        db.close()
        db = null
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
  return new Promise((resolve, reject) => {
    const request = store.put(data)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function remove(storeName, key) {
  const store = await getStore(storeName, 'readwrite')
  return new Promise((resolve, reject) => {
    const request = store.delete(key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
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

async function clearAll() {
  const database = await openDB()
  const stores = ['auth', 'passwords', 'wallets', 'webcreds', 'personalInfo', 'vaultMigration', 'bookmarks']
  
  for (const storeName of stores) {
    const tx = database.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.clear()
  }
}

export {
  openDB,
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
