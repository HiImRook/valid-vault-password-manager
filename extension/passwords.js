import { encrypt, decrypt } from './crypto.js'
import { getPasswordVault, setPasswordVault } from './store.js'

function generateId() {
  return crypto.randomUUID()
}

// Best-effort fallback for records with no stored loginType (older vaults,
// or a manual add through the popup that didn't classify one). The live
// capture path in content.js always derives this from the actual field, so
// this guess only ever surfaces for pre-existing data.
function inferLoginType(identifier) {
  const v = (identifier || '').trim()
  if (!v) return 'username'
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'email'
  if (v.replace(/\D/g, '').length >= 7 && /^[+()\-.\s\d]+$/.test(v)) return 'phone'
  return 'username'
}

async function ensureVault() {
  const existing = await getPasswordVault()
  if (existing) return { success: true }

  const vault = {
    meta: {
      version: 1,
      createdAt: Date.now(),
      lastAccess: Date.now()
    },
    credentials: {}
  }

  await setPasswordVault(vault)
  return { success: true }
}

function isLive(cred) {
  return !cred.deleted
}

async function encryptExtraFields(extraFields, masterKey) {
  const out = []
  for (const field of extraFields || []) {
    if (!field || !field.label || field.value === undefined || field.value === null || field.value === '') continue
    out.push({
      label: await encrypt(field.label, masterKey),
      value: await encrypt(field.value, masterKey)
    })
  }
  return out
}

async function decryptExtraFields(extraFields, masterKey) {
  const out = []
  for (const field of extraFields || []) {
    out.push({
      label: await decrypt(field.label, masterKey),
      value: await decrypt(field.value, masterKey)
    })
  }
  return out
}

async function saveCredential(domain, username, password, masterKey, extraFields, loginType) {
  await ensureVault()
  const vault = await getPasswordVault()

  const encUsername = await encrypt(username, masterKey)
  const encPassword = await encrypt(password, masterKey)
  const encExtraFields = await encryptExtraFields(extraFields, masterKey)

  if (!vault.credentials[domain]) {
    vault.credentials[domain] = []
  }

  const existing = []
  let existingLoginType = null
  for (const cred of vault.credentials[domain]) {
    if (cred.deleted) {
      existing.push(cred)
      continue
    }
    const existingUsername = await decrypt(cred.username, masterKey)
    if (existingUsername === username) {
      existingLoginType = cred.loginType || null
      continue
    }
    existing.push(cred)
  }

  const id = generateId()
  existing.push({
    id,
    username: encUsername,
    password: encPassword,
    extraFields: encExtraFields,
    loginType: loginType || existingLoginType || inferLoginType(username),
    createdAt: Date.now(),
    updatedAt: Date.now()
  })

  vault.credentials[domain] = existing
  vault.meta.lastAccess = Date.now()

  await setPasswordVault(vault)
  return { success: true, id }
}

async function getCredentials(domain, masterKey) {
  await ensureVault()
  const vault = await getPasswordVault()

  const domainCreds = vault.credentials[domain]
  if (!domainCreds || domainCreds.length === 0) {
    return { success: true, credentials: [] }
  }

  const decrypted = []
  for (const cred of domainCreds) {
    if (cred.deleted) continue
    try {
      const decUsername = await decrypt(cred.username, masterKey)
      decrypted.push({
        id: cred.id,
        username: decUsername,
        password: await decrypt(cred.password, masterKey),
        extraFields: await decryptExtraFields(cred.extraFields, masterKey),
        loginType: cred.loginType || inferLoginType(decUsername),
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt
      })
    } catch (error) {
      return { success: false, error: 'Decryption failed' }
    }
  }

  return { success: true, credentials: decrypted }
}

async function getAllDomains() {
  await ensureVault()
  const vault = await getPasswordVault()

  const domains = []
  for (const domain of Object.keys(vault.credentials)) {
    const hasLive = vault.credentials[domain].some(isLive)
    if (hasLive) domains.push(domain)
  }

  return { success: true, domains }
}

async function updateCredential(credentialId, updates, masterKey) {
  const vault = await getPasswordVault()
  if (!vault) return { success: false, error: 'No vault' }

  for (const domain of Object.keys(vault.credentials)) {
    const creds = vault.credentials[domain]
    function matchesId(candidate) {
      return candidate.id === credentialId
    }
    const index = creds.findIndex(matchesId)

    if (index !== -1) {
      if (creds[index].deleted) return { success: false, error: 'Credential deleted' }
      if (updates.username) {
        creds[index].username = await encrypt(updates.username, masterKey)
      }
      if (updates.password) {
        creds[index].password = await encrypt(updates.password, masterKey)
      }
      if (updates.extraFields) {
        creds[index].extraFields = await encryptExtraFields(updates.extraFields, masterKey)
      }
      if (updates.loginType) {
        creds[index].loginType = updates.loginType
      }
      creds[index].updatedAt = Date.now()
      vault.meta.lastAccess = Date.now()

      await setPasswordVault(vault)
      return { success: true }
    }
  }

  return { success: false, error: 'Credential not found' }
}

async function deleteCredential(credentialId) {
  const vault = await getPasswordVault()
  if (!vault) return { success: false, error: 'No vault' }

  for (const domain of Object.keys(vault.credentials)) {
    const creds = vault.credentials[domain]
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
      await setPasswordVault(vault)
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
    function matchesAutofillId(candidate) {
      return candidate.id === credentialId
    }
    const cred = result.credentials.find(matchesAutofillId)
    if (cred) return { success: true, username: cred.username, password: cred.password }
    return { success: false, error: 'Credential not found' }
  }

  const cred = result.credentials[0]
  return { success: true, username: cred.username, password: cred.password }
}

async function reEncryptVault(vault, oldKey, newKey) {
  const out = {
    meta: { version: vault.meta.version, createdAt: vault.meta.createdAt, lastAccess: vault.meta.lastAccess },
    credentials: {}
  }

  for (const domain of Object.keys(vault.credentials)) {
    const list = []
    for (const cred of vault.credentials[domain]) {
      if (cred.deleted) {
        list.push(cred)
        continue
      }
      const username = await decrypt(cred.username, oldKey)
      const password = await decrypt(cred.password, oldKey)
      const extraFieldsPlain = await decryptExtraFields(cred.extraFields, oldKey)
      list.push({
        id: cred.id,
        username: await encrypt(username, newKey),
        password: await encrypt(password, newKey),
        extraFields: await encryptExtraFields(extraFieldsPlain, newKey),
        loginType: cred.loginType,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt
      })
    }
    out.credentials[domain] = list
  }

  return out
}

async function mergeVaults(localVault, incomingVault, masterKey) {
  const merged = {
    meta: {
      version: localVault.meta.version,
      createdAt: Math.min(localVault.meta.createdAt, incomingVault.meta.createdAt),
      lastAccess: Date.now()
    },
    credentials: {}
  }

  const domains = new Set([
    ...Object.keys(localVault.credentials),
    ...Object.keys(incomingVault.credentials)
  ])

  for (const domain of domains) {
    const localCreds = localVault.credentials[domain] || []
    const incomingCreds = incomingVault.credentials[domain] || []

    const byUsername = new Map()

    async function keyFor(cred) {
      if (cred.deleted) return 'tomb:' + cred.id
      try {
        return 'user:' + (await decrypt(cred.username, masterKey))
      } catch (error) {
        return 'id:' + cred.id
      }
    }

    for (const cred of [...localCreds, ...incomingCreds]) {
      const key = await keyFor(cred)
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
  reEncryptVault,
  mergeVaults
}
