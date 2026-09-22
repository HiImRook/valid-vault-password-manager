import { encrypt, decrypt } from './crypto.js'
import { getPasswordVault, setPasswordVault, getVaultMigrationJournal, setVaultMigrationJournal, clearVaultMigrationJournal } from './store.js'

function generateId() {
  return crypto.randomUUID()
}

function inferLoginType(identifier) {
  const v = (identifier || '').trim()
  if (!v) return 'username'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'email'
  if (v.replace(/\D/g, '').length >= 7 && /^[+()\-.\s\d]+$/.test(v)) return 'phone'
  return 'username'
}

function isLive(cred) {
  return !cred.deleted
}

function isValidVaultTree(value) {
  return !!(value &&
    typeof value === 'object' &&
    value.meta &&
    typeof value.meta === 'object' &&
    value.credentials &&
    typeof value.credentials === 'object' &&
    !Array.isArray(value.credentials))
}

async function decryptLegacyExtraFields(extraFields, masterKey) {
  const out = []
  for (const field of extraFields || []) {
    try {
      out.push({
        label: await decrypt(field.label, masterKey),
        value: await decrypt(field.value, masterKey)
      })
    } catch (error) {}
  }
  return out
}

async function readLegacyLoginType(stored, masterKey) {
  if (!stored) return null
  if (typeof stored === 'string') return stored
  try {
    return await decrypt(stored, masterKey)
  } catch (error) {
    return null
  }
}

async function decryptLegacyTree(legacyTree, masterKey) {
  const credentials = {}
  for (const domain of Object.keys(legacyTree.credentials || {})) {
    const list = []
    for (const cred of legacyTree.credentials[domain]) {
      if (cred.deleted) {
        list.push(cred)
        continue
      }
      const username = await decrypt(cred.username, masterKey)
      const password = await decrypt(cred.password, masterKey)
      const extraFields = await decryptLegacyExtraFields(cred.extraFields, masterKey)
      const loginType = (await readLegacyLoginType(cred.loginType, masterKey)) || inferLoginType(username)
      list.push({
        id: cred.id,
        username,
        password,
        extraFields,
        loginType,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt
      })
    }
    credentials[domain] = list
  }

  return {
    meta: {
      version: 2,
      createdAt: legacyTree.meta.createdAt || Date.now(),
      lastAccess: Date.now()
    },
    credentials
  }
}

async function encryptTree(tree, masterKey) {
  return encrypt(JSON.stringify(tree), masterKey)
}

async function decryptTree(blob, masterKey) {
  const json = await decrypt(blob, masterKey)
  const parsed = JSON.parse(json)
  if (!isValidVaultTree(parsed)) {
    throw new Error('Vault data has an unexpected shape')
  }
  return parsed
}

async function decryptAnyRowToTree(row, masterKey) {
  if (!row) {
    return {
      meta: { version: 2, createdAt: Date.now(), lastAccess: Date.now() },
      credentials: {}
    }
  }
  if (row.schemaVersion === 2) {
    return decryptTree(row.blob, masterKey)
  }
  const legacyTree = { meta: row.meta || {}, credentials: row.credentials || {} }
  return decryptLegacyTree(legacyTree, masterKey)
}

async function finalizeMigration(masterKey) {
  const written = await getPasswordVault()
  try {
    await decryptTree(written.blob, masterKey)
  } catch (error) {
    await rollbackMigration(masterKey, 'Vault migration failed verification and was reverted')
    return { migrated: false, status: 'rolled-back' }
  }

  await clearVaultMigrationJournal()
  return { migrated: true, status: 'complete' }
}

async function rollbackMigration(masterKey, message) {
  const journal = await getVaultMigrationJournal()
  if (journal && journal.backup) {
    const legacyRowJson = await decrypt(journal.backup, masterKey)
    const legacyRow = JSON.parse(legacyRowJson)
    await setPasswordVault(legacyRow)
  }
  await clearVaultMigrationJournal()
  throw new Error(message)
}

async function migrateLegacyVault(masterKey) {
  const journal = await getVaultMigrationJournal()
  if (journal) {
    return finalizeMigration(masterKey)
  }

  const current = await getPasswordVault()

  if (!current) {
    const tree = {
      meta: { version: 2, createdAt: Date.now(), lastAccess: Date.now() },
      credentials: {}
    }
    await setPasswordVault({ id: 'vault', schemaVersion: 2, blob: await encryptTree(tree, masterKey) })
    return { migrated: false, status: 'created' }
  }

  if (current.schemaVersion === 2) {
    return { migrated: false, status: 'already-current' }
  }

  const legacyTree = { meta: current.meta || {}, credentials: current.credentials || {} }
  const plainTree = await decryptLegacyTree(legacyTree, masterKey)
  const encryptedBackup = await encrypt(JSON.stringify(current), masterKey)

  await setVaultMigrationJournal({ status: 'prepared', backup: encryptedBackup, createdAt: Date.now() })

  const blob = await encryptTree(plainTree, masterKey)
  await setPasswordVault({ id: 'vault', schemaVersion: 2, blob })

  return finalizeMigration(masterKey)
}

async function readVaultTree(masterKey) {
  await migrateLegacyVault(masterKey)
  const row = await getPasswordVault()
  return decryptTree(row.blob, masterKey)
}

async function writeVaultTree(tree, masterKey) {
  const blob = await encryptTree(tree, masterKey)
  await setPasswordVault({ id: 'vault', schemaVersion: 2, blob })
}

async function ensureVault(masterKey) {
  await migrateLegacyVault(masterKey)
  return { success: true }
}

async function saveCredential(domain, username, password, masterKey, loginType) {
  const tree = await readVaultTree(masterKey)

  if (!tree.credentials[domain]) {
    tree.credentials[domain] = []
  }

  const existing = []
  let existingId = null
  let existingCreatedAt = null
  let existingLoginType = null
  let existingExtraFields = null
  for (const cred of tree.credentials[domain]) {
    if (cred.deleted) {
      existing.push(cred)
      continue
    }
    if (cred.username === username) {
      existingId = cred.id
      existingCreatedAt = cred.createdAt
      existingLoginType = cred.loginType || null
      existingExtraFields = cred.extraFields || null
      continue
    }
    existing.push(cred)
  }

  const resolvedLoginType = loginType || existingLoginType || inferLoginType(username)
  const now = Date.now()
  const id = existingId || generateId()
  existing.push({
    id,
    username,
    password,
    ...(existingExtraFields ? { extraFields: existingExtraFields } : {}),
    loginType: resolvedLoginType,
    createdAt: existingCreatedAt || now,
    updatedAt: now
  })

  tree.credentials[domain] = existing
  tree.meta.lastAccess = now

  await writeVaultTree(tree, masterKey)
  return { success: true, id }
}

async function getCredentials(domain, masterKey) {
  let tree
  try {
    tree = await readVaultTree(masterKey)
  } catch (error) {
    return { success: false, error: 'Decryption failed' }
  }

  const domainCreds = tree.credentials[domain]
  if (!domainCreds || domainCreds.length === 0) {
    return { success: true, credentials: [] }
  }

  const result = []
  for (const cred of domainCreds) {
    if (cred.deleted) continue
    result.push({
      id: cred.id,
      username: cred.username,
      password: cred.password,
      loginType: cred.loginType || inferLoginType(cred.username),
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt
    })
  }

  return { success: true, credentials: result }
}

async function getAllDomains(masterKey) {
  if (!masterKey) {
    return { success: false, locked: true, domains: [] }
  }

  let tree
  try {
    tree = await readVaultTree(masterKey)
  } catch (error) {
    return { success: false, error: 'Decryption failed' }
  }

  const domains = []
  for (const domain of Object.keys(tree.credentials)) {
    const hasLive = tree.credentials[domain].some(isLive)
    if (hasLive) domains.push(domain)
  }

  return { success: true, domains }
}

async function updateCredential(credentialId, updates, masterKey) {
  let tree
  try {
    tree = await readVaultTree(masterKey)
  } catch (error) {
    return { success: false, error: 'Decryption failed' }
  }

  for (const domain of Object.keys(tree.credentials)) {
    const creds = tree.credentials[domain]
    const index = creds.findIndex((candidate) => candidate.id === credentialId)

    if (index !== -1) {
      if (creds[index].deleted) return { success: false, error: 'Credential deleted' }
      if (updates.username) creds[index].username = updates.username
      if (updates.password) creds[index].password = updates.password
      if (updates.loginType) creds[index].loginType = updates.loginType
      creds[index].updatedAt = Date.now()
      tree.meta.lastAccess = Date.now()

      await writeVaultTree(tree, masterKey)
      return { success: true }
    }
  }

  return { success: false, error: 'Credential not found' }
}

async function deleteCredential(credentialId, masterKey) {
  let tree
  try {
    tree = await readVaultTree(masterKey)
  } catch (error) {
    return { success: false, error: 'Decryption failed' }
  }

  for (const domain of Object.keys(tree.credentials)) {
    const creds = tree.credentials[domain]
    const index = creds.findIndex((candidate) => candidate.id === credentialId)

    if (index !== -1) {
      creds[index] = {
        id: creds[index].id,
        deleted: true,
        deletedAt: Date.now(),
        updatedAt: Date.now()
      }

      tree.meta.lastAccess = Date.now()
      await writeVaultTree(tree, masterKey)
      return { success: true }
    }
  }

  return { success: false, error: 'Credential not found' }
}

async function autofill(domain, credentialId, masterKey) {
  const result = await getCredentials(domain, masterKey)
  if (!result.success) return result

  if (result.credentials.length === 0) {
    return { success: false, error: 'No credentials for domain' }
  }

  if (credentialId) {
    const cred = result.credentials.find((candidate) => candidate.id === credentialId)
    if (cred) return { success: true, username: cred.username, password: cred.password }
    return { success: false, error: 'Credential not found' }
  }

  const cred = result.credentials[0]
  return { success: true, username: cred.username, password: cred.password }
}

function mergeVaults(localTree, incomingTree) {
  const merged = {
    meta: {
      version: 2,
      createdAt: Math.min(localTree.meta.createdAt, incomingTree.meta.createdAt),
      lastAccess: Date.now()
    },
    credentials: {}
  }

  const domains = new Set([
    ...Object.keys(localTree.credentials),
    ...Object.keys(incomingTree.credentials)
  ])

  for (const domain of domains) {
    const localCreds = localTree.credentials[domain] || []
    const incomingCreds = incomingTree.credentials[domain] || []

    function keyFor(cred) {
      if (cred.deleted) return 'tomb:' + cred.id
      return 'user:' + cred.username
    }

    const byUsername = new Map()
    for (const cred of [...localCreds, ...incomingCreds]) {
      const key = keyFor(cred)
      const existing = byUsername.get(key)
      if (!existing || cred.updatedAt > existing.updatedAt) {
        byUsername.set(key, cred)
      }
    }

    const tombstones = new Map()
    for (const cred of [...localCreds, ...incomingCreds]) {
      if (cred.deleted) {
        const prev = tombstones.get(cred.id)
        if (!prev || cred.updatedAt > prev.updatedAt) tombstones.set(cred.id, cred)
      }
    }

    const result = []
    for (const cred of byUsername.values()) {
      if (cred.deleted) continue
      const tomb = tombstones.get(cred.id)
      if (tomb && tomb.updatedAt > cred.updatedAt) continue
      result.push(cred)
    }

    if (result.length > 0) merged.credentials[domain] = result
  }

  return merged
}

export {
  ensureVault,
  saveCredential,
  getCredentials,
  getAllDomains,
  updateCredential,
  deleteCredential,
  autofill,
  mergeVaults,
  migrateLegacyVault,
  readVaultTree,
  writeVaultTree,
  decryptAnyRowToTree
}
