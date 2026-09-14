import { encrypt, decrypt } from './crypto.js'
import { getWebCredsVault, setWebCredsVault } from './store.js'

function generateId() {
  return crypto.randomUUID()
}

async function ensureVault() {
  const existing = await getWebCredsVault()
  if (existing) return { success: true }

  const vault = {
    meta: {
      version: 1,
      createdAt: Date.now(),
      lastAccess: Date.now()
    },
    credentials: {}
  }

  await setWebCredsVault(vault)
  return { success: true }
}

function isLive(cred) {
  return !cred.deleted
}

async function saveWebCredential(category, name, value, masterKey) {
  await ensureVault()
  const vault = await getWebCredsVault()

  const encName = await encrypt(name, masterKey)
  const encValue = await encrypt(value, masterKey)

  if (!vault.credentials[category]) {
    vault.credentials[category] = []
  }

  const existing = []
  for (const cred of vault.credentials[category]) {
    if (cred.deleted) {
      existing.push(cred)
      continue
    }
    const existingName = await decrypt(cred.name, masterKey)
    if (existingName === name) continue
    existing.push(cred)
  }

  const id = generateId()
  existing.push({
    id,
    name: encName,
    value: encValue,
    createdAt: Date.now(),
    updatedAt: Date.now()
  })

  vault.credentials[category] = existing
  vault.meta.lastAccess = Date.now()

  await setWebCredsVault(vault)
  return { success: true, id }
}

async function getWebCredentials(category, masterKey) {
  await ensureVault()
  const vault = await getWebCredsVault()

  const categoryCreds = vault.credentials[category]
  if (!categoryCreds || categoryCreds.length === 0) {
    return { success: true, credentials: [] }
  }

  const decrypted = []
  for (const cred of categoryCreds) {
    if (cred.deleted) continue
    try {
      decrypted.push({
        id: cred.id,
        name: await decrypt(cred.name, masterKey),
        value: await decrypt(cred.value, masterKey),
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt
      })
    } catch (error) {
      return { success: false, error: 'Decryption failed' }
    }
  }

  return { success: true, credentials: decrypted }
}

async function getAllCategories() {
  await ensureVault()
  const vault = await getWebCredsVault()

  const categories = []
  for (const category of Object.keys(vault.credentials)) {
    const hasLive = vault.credentials[category].some(isLive)
    if (hasLive) categories.push(category)
  }

  return { success: true, categories }
}

async function updateWebCredential(credentialId, updates, masterKey) {
  const vault = await getWebCredsVault()
  if (!vault) return { success: false, error: 'No vault' }

  for (const category of Object.keys(vault.credentials)) {
    const creds = vault.credentials[category]
    function matchesId(candidate) {
      return candidate.id === credentialId
    }
    const index = creds.findIndex(matchesId)

    if (index !== -1) {
      if (creds[index].deleted) return { success: false, error: 'Credential deleted' }
      if (updates.name) {
        creds[index].name = await encrypt(updates.name, masterKey)
      }
      if (updates.value) {
        creds[index].value = await encrypt(updates.value, masterKey)
      }
      creds[index].updatedAt = Date.now()
      vault.meta.lastAccess = Date.now()
      await setWebCredsVault(vault)
      return { success: true }
    }
  }

  return { success: false, error: 'Credential not found' }
}

async function deleteWebCredential(credentialId) {
  const vault = await getWebCredsVault()
  if (!vault) return { success: false, error: 'No vault' }

  for (const category of Object.keys(vault.credentials)) {
    const creds = vault.credentials[category]
    function matchesId(candidate) {
      return candidate.id === credentialId
    }
    const index = creds.findIndex(matchesId)

    if (index !== -1) {
      creds[index] = {
        id: creds[index].id,
        deleted: true,
        deletedAt: Date.now(),
        updatedAt: Date.now()
      }

      vault.meta.lastAccess = Date.now()
      await setWebCredsVault(vault)
      return { success: true }
    }
  }

  return { success: false, error: 'Credential not found' }
}

async function reEncryptVault(vault, oldKey, newKey) {
  const out = {
    meta: { version: vault.meta.version, createdAt: vault.meta.createdAt, lastAccess: vault.meta.lastAccess },
    credentials: {}
  }

  for (const category of Object.keys(vault.credentials)) {
    const list = []
    for (const cred of vault.credentials[category]) {
      if (cred.deleted) {
        list.push(cred)
        continue
      }
      const name = await decrypt(cred.name, oldKey)
      const value = await decrypt(cred.value, oldKey)
      list.push({
        id: cred.id,
        name: await encrypt(name, newKey),
        value: await encrypt(value, newKey),
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt
      })
    }
    out.credentials[category] = list
  }

  return out
}

async function mergeWebCredsVaults(localVault, incomingVault, masterKey) {
  const merged = {
    meta: {
      version: localVault.meta.version,
      createdAt: Math.min(localVault.meta.createdAt, incomingVault.meta.createdAt),
      lastAccess: Date.now()
    },
    credentials: {}
  }

  const categories = new Set([
    ...Object.keys(localVault.credentials),
    ...Object.keys(incomingVault.credentials)
  ])

  for (const category of categories) {
    const localCreds = localVault.credentials[category] || []
    const incomingCreds = incomingVault.credentials[category] || []

    const byName = new Map()

    async function keyFor(cred) {
      if (cred.deleted) return 'tomb:' + cred.id
      try {
        return 'name:' + (await decrypt(cred.name, masterKey))
      } catch (error) {
        return 'id:' + cred.id
      }
    }

    for (const cred of [...localCreds, ...incomingCreds]) {
      const key = await keyFor(cred)
      const existing = byName.get(key)
      if (!existing || cred.updatedAt > existing.updatedAt) {
        byName.set(key, cred)
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
    for (const cred of byName.values()) {
      if (cred.deleted) continue
      const tomb = tombstones.get(cred.id)
      if (tomb && tomb.updatedAt > cred.updatedAt) continue
      result.push(cred)
    }

    if (result.length > 0) merged.credentials[category] = result
  }

  return merged
}

export {
  ensureVault,
  saveWebCredential,
  getWebCredentials,
  getAllCategories,
  updateWebCredential,
  deleteWebCredential,
  reEncryptVault,
  mergeWebCredsVaults
}
