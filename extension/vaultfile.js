import * as store from './store.js'
import * as passwords from './passwords.js'
import * as webcreds from './webcreds.js'
import * as personalinfo from './personalinfo.js'
import * as bookmarks from './bookmarks.js'
import * as wallets from './wallets.js'
import { decrypt } from './crypto.js'

const VAULT_FILE_FORMAT = 'valid-vault-vault'
const VAULT_FILE_VERSION = 1
const SECTION_NAMES = ['vault', 'webcreds', 'personalInfo', 'bookmarks', 'wallets']
const KEY_MISMATCH_MSG = 'This vault was made with a different master key. Import that master key first, then import the vault.'
const LOCAL_MISMATCH_MSG = 'The saved data on this device uses a different master key than the one unlocked. Import the matching master key first.'
const NOT_VAULT_MSG = 'This is not a Valid Vault vault file. Nothing was changed.'
const NEWER_VERSION_MSG = 'This vault file was made by a newer version of Valid Vault. Update this device, then import it again. Nothing was changed.'
const DAMAGED_MSG = 'This vault file is damaged or incomplete. Nothing was changed.'

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCipher(value) {
  return isObject(value) && Array.isArray(value.iv) && Array.isArray(value.ciphertext)
}

function isSealedRow(row) {
  return isObject(row) && typeof row.schemaVersion === 'number' && isObject(row.blob) && typeof row.blob.iv === 'string' && typeof row.blob.data === 'string'
}

function isVaultRow(row) {
  if (!isObject(row)) return false
  if (row.schemaVersion === undefined) return isObject(row.credentials)
  return typeof row.schemaVersion === 'number'
}

function isWebCredsVault(vault) {
  if (!isObject(vault) || !isObject(vault.meta) || !isObject(vault.credentials)) return false
  for (const list of Object.values(vault.credentials)) {
    if (!Array.isArray(list)) return false
    for (const cred of list) {
      if (!isObject(cred) || typeof cred.id !== 'string') return false
      if (cred.deleted) continue
      if (!isCipher(cred.name) || !isCipher(cred.value)) return false
    }
  }
  return true
}

function isPersonalInfoRecord(record) {
  return isObject(record) && isCipher(record.data)
}

function checkSections(obj) {
  const sections = {}
  for (const name of SECTION_NAMES) sections[name] = obj[name] === undefined ? null : obj[name]
  if (sections.vault !== null && !isVaultRow(sections.vault)) throw new Error(DAMAGED_MSG)
  if (sections.webcreds !== null && !isWebCredsVault(sections.webcreds)) throw new Error(DAMAGED_MSG)
  if (sections.personalInfo !== null && !isPersonalInfoRecord(sections.personalInfo)) throw new Error(DAMAGED_MSG)
  if (sections.bookmarks !== null && !isSealedRow(sections.bookmarks)) throw new Error(DAMAGED_MSG)
  if (sections.wallets !== null && !isSealedRow(sections.wallets)) throw new Error(DAMAGED_MSG)
  return sections
}

function parseBundle(input) {
  let obj = input
  if (typeof input === 'string') {
    try { obj = JSON.parse(input) } catch (e) { throw new Error(NOT_VAULT_MSG) }
  }
  if (!isObject(obj) || obj.format !== VAULT_FILE_FORMAT) throw new Error(NOT_VAULT_MSG)
  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version) || obj.version < 1) throw new Error(DAMAGED_MSG)
  if (obj.version > VAULT_FILE_VERSION) throw new Error(NEWER_VERSION_MSG)
  return Object.assign({ format: VAULT_FILE_FORMAT, version: obj.version }, checkSections(obj))
}

function bundleFromPayload(payload) {
  if (!isObject(payload) || payload.kind !== 'vault') throw new Error(DAMAGED_MSG)
  return Object.assign({ format: VAULT_FILE_FORMAT, version: VAULT_FILE_VERSION }, checkSections(payload))
}

function payloadFromBundle(bundle) {
  return { kind: 'vault', vault: bundle.vault || null, webcreds: bundle.webcreds || null, personalInfo: bundle.personalInfo || null, bookmarks: bundle.bookmarks || null }
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
    vault: (await store.getPasswordVault()) || null,
    webcreds: (await store.getWebCredsVault()) || null,
    personalInfo: (await store.getPersonalInfo()) || null,
    bookmarks: (await store.getBookmarksVault()) || null,
    wallets: (await store.getWalletVault()) || null
  }
}

function bundleHasData(bundle) {
  return !!(bundle.vault || bundle.webcreds || bundle.personalInfo || bundle.bookmarks || bundle.wallets)
}

function emptyLoginTree() {
  return { meta: { version: 2, createdAt: Date.now(), lastAccess: Date.now() }, credentials: {} }
}

function emptyWebCreds() {
  return { meta: { version: 1, createdAt: Date.now(), lastAccess: Date.now() }, credentials: {} }
}

async function verifyWebCreds(vault, key) {
  for (const list of Object.values(vault.credentials)) {
    for (const cred of list) {
      if (cred.deleted) continue
      await decrypt(cred.name, key)
      await decrypt(cred.value, key)
    }
  }
}

async function verifyPersonalInfo(record, key) {
  const profile = JSON.parse(await decrypt(record.data, key))
  if (!isObject(profile)) throw new Error(DAMAGED_MSG)
}

async function localLoginTree(key) {
  let row = await store.getPasswordVault()
  if (row && row.schemaVersion === undefined) {
    await passwords.migrateLegacyVault(key)
    row = await store.getPasswordVault()
  }
  return row ? passwords.decryptAnyRowToTree(row, key) : null
}

async function localVaultHasLiveData(key) {
  try {
    const row = await store.getPasswordVault()
    if (row) {
      const tree = await passwords.decryptAnyRowToTree(row, key)
      if (Object.values(tree.credentials).some((list) => list.some((cred) => !cred.deleted))) return true
    }
    const wc = await store.getWebCredsVault()
    if (wc && Object.values(wc.credentials || {}).some((list) => list.some((cred) => !cred.deleted))) return true
    const pi = await store.getPersonalInfo()
    if (pi && pi.data) {
      const profile = JSON.parse(await decrypt(pi.data, key))
      const address = profile.address || {}
      if (profile.firstName || profile.lastName || profile.phone || (profile.emails && profile.emails.length) || Object.values(address).some(Boolean)) return true
    }
    const bm = await bookmarks.readTree(key)
    if (bm.items.some((item) => !item.deleted)) return true
    const wl = await wallets.readTree(key)
    if (wl.accounts.some((acct) => !acct.deleted)) return true
    return false
  } catch (e) {
    return true
  }
}

async function planMerge(bundle, key) {
  if (!(await bundleOpensWith(bundle, key))) throw new Error(KEY_MISMATCH_MSG)
  if (!(await localVaultOpensWith(key))) throw new Error(LOCAL_MISMATCH_MSG)
  const plan = { writes: [], sections: { logins: false, webcreds: false, personalInfo: false, bookmarks: false, wallets: false } }
  try {
    if (bundle.vault) {
      const incomingTree = await passwords.decryptAnyRowToTree(bundle.vault, key)
      const localTree = await localLoginTree(key)
      const base = localTree || emptyLoginTree()
      const merged = passwords.mergeVaults(base, incomingTree)
      if (!localTree || !passwords.sameCredentials(base, merged)) {
        plan.sections.logins = true
        plan.writes.push(() => passwords.writeVaultTree(merged, key))
      }
    }
    if (bundle.webcreds) {
      await verifyWebCreds(bundle.webcreds, key)
      const localWc = await store.getWebCredsVault()
      const base = localWc || emptyWebCreds()
      const merged = await webcreds.mergeWebCredsVaults(base, bundle.webcreds, key)
      if (!webcreds.sameWebCreds(base, merged)) {
        plan.sections.webcreds = true
        plan.writes.push(() => store.setWebCredsVault(merged))
      }
    }
    if (bundle.personalInfo) {
      await verifyPersonalInfo(bundle.personalInfo, key)
      const localPi = await store.getPersonalInfo()
      const chosen = personalinfo.mergeProfiles(localPi, bundle.personalInfo)
      if (chosen !== localPi) {
        plan.sections.personalInfo = true
        plan.writes.push(() => store.setPersonalInfo(chosen))
      }
    }
    if (bundle.bookmarks) {
      const incomingTree = await bookmarks.decryptRow(bundle.bookmarks, key)
      const localTree = await bookmarks.readTree(key)
      const merged = bookmarks.mergeTrees(localTree, incomingTree)
      if (!bookmarks.sameTrees(localTree, merged)) {
        plan.sections.bookmarks = true
        plan.writes.push(() => bookmarks.writeTree(merged, key))
      }
    }
    if (bundle.wallets) {
      const incomingTree = await wallets.decryptRow(bundle.wallets, key)
      const localTree = await wallets.readTree(key)
      const merged = wallets.mergeTrees(localTree, incomingTree)
      if (!wallets.sameTrees(localTree, merged)) {
        plan.sections.wallets = true
        plan.writes.push(() => wallets.writeTree(merged, key))
      }
    }
  } catch (e) {
    if (e && (e.message === KEY_MISMATCH_MSG || e.message === LOCAL_MISMATCH_MSG)) throw e
    throw new Error(DAMAGED_MSG)
  }
  return plan
}

async function mergeBundle(bundle, key) {
  const checked = Object.assign({}, bundle, checkSections(bundle))
  const plan = await planMerge(checked, key)
  for (const write of plan.writes) await write()
  return { changed: plan.writes.length > 0, sections: plan.sections }
}

function describeMerge(result) {
  if (!result || !result.changed) return 'Already up to date. Nothing new in that vault.'
  const names = []
  if (result.sections.logins) names.push('logins')
  if (result.sections.webcreds) names.push('misc credentials')
  if (result.sections.personalInfo) names.push('personal info')
  if (result.sections.bookmarks) names.push('bookmarks')
  if (result.sections.wallets) names.push('crypto wallets')
  return 'Vault merged. Updated ' + names.join(', ') + '.'
}

export {
  VAULT_FILE_FORMAT,
  VAULT_FILE_VERSION,
  KEY_MISMATCH_MSG,
  LOCAL_MISMATCH_MSG,
  NOT_VAULT_MSG,
  NEWER_VERSION_MSG,
  DAMAGED_MSG,
  parseBundle,
  bundleFromPayload,
  payloadFromBundle,
  localVaultOpensWith,
  localVaultHasLiveData,
  bundleOpensWith,
  buildBundle,
  bundleHasData,
  mergeBundle,
  describeMerge
}
