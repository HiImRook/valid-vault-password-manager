import { encrypt, decrypt } from './crypto.js'
import { getPasswordVault, setPasswordVault, getVaultMigrationJournal, setVaultMigrationJournal, clearVaultMigrationJournal } from './store.js'

const PREVIOUS_KEEP_MS = 30 * 24 * 60 * 60 * 1000
const NOTES_LABEL = 'Notes'
const USE_WRITE_INTERVAL_MS = 10 * 60 * 1000
const APP_PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/

function retirePassword(cred, oldPassword, now) {
  if (!oldPassword || oldPassword === cred.password) return
  cred.previousPassword = oldPassword
  cred.previousSetAt = now
  delete cred.newPasswordUses
}

function clearPrevious(cred) {
  delete cred.previousPassword
  delete cred.previousSetAt
  delete cred.newPasswordUses
}

function previousExpired(cred, now) {
  return !!cred.previousPassword && now - (cred.previousSetAt || 0) >= PREVIOUS_KEEP_MS
}

function previousExpiresAt(setAt) {
  return (typeof setAt === 'number' && isFinite(setAt) ? setAt : 0) + PREVIOUS_KEEP_MS
}

function lastUsed(record) {
  return record && typeof record.lastUsedAt === 'number' && isFinite(record.lastUsedAt) ? record.lastUsedAt : 0
}

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

function normalizeLabel(label) {
  return (label || '')
    .toLowerCase()
    .replace(/[:*]+$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function isValidAppLinks(links) {
  if (links === undefined) return true
  if (!links || typeof links !== 'object' || Array.isArray(links)) return false
  for (const [pkg, link] of Object.entries(links)) {
    if (!APP_PACKAGE_PATTERN.test(pkg)) return false
    if (!link || typeof link !== 'object' || link.id !== pkg) return false
    if (typeof link.updatedAt !== 'number' || !isFinite(link.updatedAt)) return false
    if (link.deleted !== undefined && link.deleted !== true) return false
    if (!link.deleted && (typeof link.site !== 'string' || !link.site)) return false
    if (link.cert !== undefined && typeof link.cert !== 'string') return false
  }
  return true
}

function isValidVaultTree(value) {
  if (!value || typeof value !== 'object') return false
  if (!value.meta || typeof value.meta !== 'object') return false
  if (!value.credentials || typeof value.credentials !== 'object') return false
  if (Array.isArray(value.credentials)) return false
  if (!isValidAppLinks(value.appLinks)) return false

  for (const [domain, credentials] of Object.entries(value.credentials)) {
    if (typeof domain !== 'string' || !Array.isArray(credentials)) return false

    for (const credential of credentials) {
      if (!credential || typeof credential !== 'object') return false
      if (typeof credential.id !== 'string') return false
      if (credential.deleted !== undefined && typeof credential.deleted !== 'boolean') return false
      if (!credential.deleted && (
        typeof credential.username !== 'string' ||
        typeof credential.password !== 'string'
      )) {
        return false
      }
    }
  }

  return true
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
        ...cred,
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

const FINGERPRINT_HEX_LENGTH = 64

async function vaultFingerprint(tree) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(tree)))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function matchesJournalFingerprint(tree, expected) {
  if (typeof expected !== 'string') return true
  if (expected.length === FINGERPRINT_HEX_LENGTH && /^[0-9a-f]+$/.test(expected)) {
    return (await vaultFingerprint(tree)) === expected
  }
  return JSON.stringify(tree) === expected
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
    if (!row.blob) throw new Error('Vault blob is missing')
    return decryptTree(row.blob, masterKey)
  }
  if (row.schemaVersion !== undefined) {
    throw new Error('Unsupported vault schema version')
  }
  const legacyTree = { meta: row.meta || {}, credentials: row.credentials || {} }
  return decryptLegacyTree(legacyTree, masterKey)
}

async function finalizeMigration(masterKey) {
  const journal = await getVaultMigrationJournal()
  const written = await getPasswordVault()
  let writtenTree
  try {
    writtenTree = await decryptTree(written.blob, masterKey)
  } catch (error) {
    await rollbackMigration(masterKey, 'Vault migration failed verification and was reverted')
    return { migrated: false, status: 'rolled-back' }
  }

  if (journal && journal.expected && !(await matchesJournalFingerprint(writtenTree, journal.expected))) {
    await rollbackMigration(masterKey, 'Vault migration verification failed and was reverted')
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

  if (current.schemaVersion !== undefined) {
    throw new Error('Unsupported vault schema version')
  }

  const legacyTree = { meta: current.meta || {}, credentials: current.credentials || {} }
  const plainTree = await decryptLegacyTree(legacyTree, masterKey)
  const encryptedBackup = await encrypt(JSON.stringify(current), masterKey)
  const expected = await vaultFingerprint(plainTree)

  await setVaultMigrationJournal({ status: 'prepared', backup: encryptedBackup, expected, createdAt: Date.now() })

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

async function saveCredential(domain, username, password, masterKey, extraFields, loginType) {
  const tree = await readVaultTree(masterKey)

  if (!tree.credentials[domain]) {
    tree.credentials[domain] = []
  }

  const existing = []
  let existingId = null
  let existingCreatedAt = null
  let existingLoginType = null
  let existingExtraFields = []
  let existingCred = null
  for (const cred of tree.credentials[domain]) {
    if (cred.deleted) {
      existing.push(cred)
      continue
    }
    if (cred.username === username) {
      existingId = cred.id
      existingCreatedAt = cred.createdAt
      existingLoginType = cred.loginType || null
      existingExtraFields = cred.extraFields || []
      existingCred = cred
      continue
    }
    existing.push(cred)
  }

  const mergedExtraFields = existingExtraFields.slice()
  for (const field of (extraFields || [])) {
    if (!field || !field.label || !field.value) continue
    const idx = mergedExtraFields.findIndex((f) => normalizeLabel(f.label) === normalizeLabel(field.label))
    if (idx !== -1) mergedExtraFields[idx] = { label: mergedExtraFields[idx].label, value: field.value }
    else mergedExtraFields.push({ label: field.label, value: field.value })
  }

  const resolvedLoginType = loginType || existingLoginType || inferLoginType(username)
  const now = Date.now()
  const id = existingId || generateId()
  const saved = {
    id,
    username,
    password,
    extraFields: mergedExtraFields,
    loginType: resolvedLoginType,
    createdAt: existingCreatedAt || now,
    updatedAt: now
  }
  if (existingCred && existingCred.password !== password) {
    retirePassword(saved, existingCred.password, now)
  } else if (existingCred && existingCred.previousPassword && !previousExpired(existingCred, now)) {
    saved.previousPassword = existingCred.previousPassword
    saved.previousSetAt = existingCred.previousSetAt
  }
  if (existingCred && lastUsed(existingCred)) saved.lastUsedAt = lastUsed(existingCred)
  existing.push(saved)

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
  const now = Date.now()
  for (const cred of domainCreds) {
    if (cred.deleted) continue
    const keepPrevious = !!cred.previousPassword && !previousExpired(cred, now)
    result.push({
      id: cred.id,
      username: cred.username,
      password: cred.password,
      extraFields: cred.extraFields || [],
      loginType: cred.loginType || inferLoginType(cred.username),
      previousPassword: keepPrevious ? cred.previousPassword : null,
      previousSetAt: keepPrevious ? cred.previousSetAt || null : null,
      previousUntil: keepPrevious ? previousExpiresAt(cred.previousSetAt) : null,
      lastUsedAt: lastUsed(cred) || null,
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
      if (updates.password && updates.password !== creds[index].password) {
        const oldPassword = creds[index].password
        creds[index].password = updates.password
        retirePassword(creds[index], oldPassword, Date.now())
      }
      if (updates.extraFields) creds[index].extraFields = updates.extraFields
      if (updates.loginType) creds[index].loginType = updates.loginType
      creds[index].updatedAt = Date.now()
      tree.meta.lastAccess = Date.now()

      await writeVaultTree(tree, masterKey)
      return { success: true }
    }
  }

  return { success: false, error: 'Credential not found' }
}

function findLiveCredential(tree, domain, username) {
  const creds = tree.credentials[domain] || []
  return creds.find((cred) => !cred.deleted && cred.username === username) || null
}

async function noteCredentialUse(domain, username, masterKey) {
  const tree = await readVaultTree(masterKey)
  const cred = findLiveCredential(tree, domain, username)
  if (!cred) return { success: true, changed: false }
  const now = Date.now()
  const expired = previousExpired(cred, now)
  const recent = typeof cred.lastUsedAt === 'number' && now - cred.lastUsedAt < USE_WRITE_INTERVAL_MS && now >= cred.lastUsedAt
  if (recent && !expired && cred.newPasswordUses === undefined) return { success: true, changed: false }
  cred.lastUsedAt = now
  delete cred.newPasswordUses
  if (expired) clearPrevious(cred)
  await writeVaultTree(tree, masterKey)
  return { success: true, changed: true }
}

async function restorePreviousPassword(domain, username, masterKey) {
  const tree = await readVaultTree(masterKey)
  const cred = findLiveCredential(tree, domain, username)
  if (!cred || !cred.previousPassword) return { success: false, error: 'No previous password saved' }
  const now = Date.now()
  if (previousExpired(cred, now)) {
    clearPrevious(cred)
    await writeVaultTree(tree, masterKey)
    return { success: false, error: 'The previous password has expired' }
  }
  const current = cred.password
  cred.password = cred.previousPassword
  retirePassword(cred, current, now)
  cred.updatedAt = now
  tree.meta.lastAccess = now
  await writeVaultTree(tree, masterKey)
  return { success: true }
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
      const now = Date.now()
      const tombstone = {
        id: creds[index].id,
        deleted: true,
        deletedAt: now,
        updatedAt: Math.max(now, stamp(creds[index]) + 1)
      }
      if (typeof creds[index].username === 'string') tombstone.username = creds[index].username
      creds[index] = tombstone

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

function stamp(record) {
  return typeof record.updatedAt === 'number' && isFinite(record.updatedAt) ? record.updatedAt : 0
}

function laterRecord(a, b) {
  const at = stamp(a)
  const bt = stamp(b)
  if (at !== bt) return at > bt ? a : b
  if (!a.deleted && b.deleted) return a
  if (a.deleted && !b.deleted) return b
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

function withLatestUse(chosen, a, b, identities) {
  if (chosen.deleted) return chosen
  const latest = Math.max(lastUsed(a), lastUsed(b))
  if (!latest || lastUsed(chosen) === latest) return chosen
  const copy = Object.assign({}, chosen, { lastUsedAt: latest })
  identities.set(copy, identities.get(chosen))
  return copy
}

function mergeRecordLists(localList, incomingList, identities) {
  const all = [...localList, ...incomingList]
  const byId = new Map()
  for (const record of all) {
    const current = byId.get(record.id)
    byId.set(record.id, current ? withLatestUse(laterRecord(current, record), current, record, identities) : record)
  }
  const winners = Array.from(byId.values())
  const byIdentity = new Map()
  for (const record of winners) {
    if (record.deleted) continue
    const identity = identities.get(record)
    const current = byIdentity.get(identity)
    byIdentity.set(identity, current ? laterRecord(current, record) : record)
  }
  const deletedAt = new Map()
  for (const record of winners) {
    if (!record.deleted) continue
    const identity = identities.get(record)
    if (identity === undefined) continue
    deletedAt.set(identity, Math.max(deletedAt.get(identity) || 0, stamp(record)))
  }
  const keep = new Set()
  for (const [identity, record] of byIdentity) {
    if ((deletedAt.get(identity) || 0) > stamp(record)) continue
    keep.add(record)
  }
  for (const record of winners) if (record.deleted) keep.add(record)
  const out = []
  const placed = new Set()
  for (const record of all) {
    const chosen = byId.get(record.id)
    if (!keep.has(chosen) || placed.has(chosen)) continue
    if (!chosen.deleted) { out.push(chosen); placed.add(chosen) }
  }
  for (const record of all) {
    const chosen = byId.get(record.id)
    if (!keep.has(chosen) || placed.has(chosen)) continue
    out.push(chosen)
    placed.add(chosen)
  }
  return out
}

function credentialIdentity(cred) {
  if (cred.deleted) return typeof cred.username === 'string' ? 'user:' + cred.username : undefined
  return 'user:' + cred.username
}

function mergeAppLinks(localLinks, incomingLinks) {
  const out = {}
  const local = localLinks || {}
  const incoming = incomingLinks || {}
  const packages = new Set([...Object.keys(local), ...Object.keys(incoming)])
  for (const pkg of Array.from(packages).sort()) {
    const a = local[pkg]
    const b = incoming[pkg]
    out[pkg] = a && b ? laterRecord(a, b) : (a || b)
  }
  return out
}

function liveAppLinks(tree) {
  const out = {}
  for (const [pkg, link] of Object.entries(tree.appLinks || {})) {
    if (!link.deleted) out[pkg] = link.site
  }
  return out
}

async function getAppLink(pkg, masterKey) {
  const tree = await readVaultTree(masterKey)
  const link = (tree.appLinks || {})[pkg]
  if (!link || link.deleted) return null
  return link.site
}

async function listAppLinks(masterKey) {
  return liveAppLinks(await readVaultTree(masterKey))
}

function nextStamp(previous) {
  const now = Date.now()
  return previous && typeof previous.updatedAt === 'number' && previous.updatedAt >= now ? previous.updatedAt + 1 : now
}

async function setAppLink(pkg, site, masterKey, cert) {
  if (!APP_PACKAGE_PATTERN.test(pkg) || typeof site !== 'string' || !site) throw new Error('Invalid app link')
  const tree = await readVaultTree(masterKey)
  const links = Object.assign({}, tree.appLinks || {})
  const previous = links[pkg]
  const certValue = typeof cert === 'string' ? cert : ''
  if (previous && !previous.deleted && previous.site === site && (previous.cert || '') === certValue) return
  links[pkg] = { id: pkg, site, updatedAt: nextStamp(previous) }
  if (certValue) links[pkg].cert = certValue
  tree.appLinks = links
  await writeVaultTree(tree, masterKey)
}

async function removeAppLink(pkg, masterKey) {
  const tree = await readVaultTree(masterKey)
  const links = Object.assign({}, tree.appLinks || {})
  const previous = links[pkg]
  if (!previous || previous.deleted) return
  links[pkg] = { id: pkg, deleted: true, updatedAt: nextStamp(previous) }
  tree.appLinks = links
  await writeVaultTree(tree, masterKey)
}

function mergeVaults(localTree, incomingTree) {
  const merged = {
    meta: {
      version: 2,
      createdAt: Math.min(localTree.meta.createdAt || Date.now(), incomingTree.meta.createdAt || Date.now()),
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
    const identities = new Map()
    for (const cred of [...localCreds, ...incomingCreds]) identities.set(cred, credentialIdentity(cred))
    const result = mergeRecordLists(localCreds, incomingCreds, identities)
    if (result.length > 0) merged.credentials[domain] = result
  }

  const appLinks = mergeAppLinks(localTree.appLinks, incomingTree.appLinks)
  if (Object.keys(appLinks).length > 0) merged.appLinks = appLinks

  return merged
}

function canonicalCredentials(tree) {
  const out = {}
  for (const domain of Object.keys(tree.credentials || {}).sort()) {
    const list = tree.credentials[domain].slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    if (list.length > 0) out[domain] = list
  }
  const links = {}
  for (const pkg of Object.keys(tree.appLinks || {}).sort()) links[pkg] = tree.appLinks[pkg]
  return JSON.stringify({ credentials: out, appLinks: links })
}

function sameCredentials(a, b) {
  return canonicalCredentials(a) === canonicalCredentials(b)
}

function liveCredential(list, username) {
  return list.find((cred) => !cred.deleted && cred.username === username) || null
}

function deletedCredential(list, username) {
  let newest = null
  for (const cred of list) {
    if (!cred.deleted || cred.username !== username) continue
    if (!newest || stamp(cred) > stamp(newest)) newest = cred
  }
  return newest
}

function blocksImport(tombstone, entry) {
  if (!tombstone) return false
  return !(entry.changedAt && entry.changedAt > stamp(tombstone))
}

function entryKey(entry) {
  return entry.site + '\n' + entry.username
}

function groupEntries(entries) {
  const groups = new Map()
  for (const entry of entries) {
    const key = entryKey(entry)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(entry)
  }
  return groups
}

function previewLoginImport(tree, entries) {
  const counts = { fresh: 0, same: 0, conflicts: 0, deleted: 0, fileDuplicates: 0 }
  for (const group of groupEntries(entries).values()) {
    const distinct = Array.from(new Set(group.map((entry) => entry.password)))
    const first = group[0]
    const list = tree.credentials[first.site] || []
    const live = liveCredential(list, first.username)
    if (live) {
      counts.fileDuplicates += distinct.length - 1
      if (distinct.length === 1 && distinct[0] === live.password) counts.same++
      else counts.conflicts++
      continue
    }
    if (group.every((entry) => blocksImport(deletedCredential(list, entry.username), entry))) { counts.deleted++; continue }
    counts.fileDuplicates += distinct.length - 1
    counts.fresh++
  }
  return counts
}

async function previewLoginImportFor(entries, masterKey) {
  return previewLoginImport(await readVaultTree(masterKey), entries)
}

function importedCredential(entry, now) {
  const extraFields = entry.note ? [{ label: NOTES_LABEL, value: entry.note }] : []
  return {
    id: generateId(),
    username: entry.username,
    password: entry.password,
    extraFields,
    loginType: inferLoginType(entry.username),
    createdAt: now,
    updatedAt: now
  }
}

async function settleFileDuplicates(entries, decide) {
  const settled = []
  let dropped = 0
  for (const group of groupEntries(entries).values()) {
    let winner = group[0]
    for (const entry of group.slice(1)) {
      if (entry.password === winner.password) {
        if (!winner.changedAt && entry.changedAt) winner = Object.assign({}, winner, { changedAt: entry.changedAt })
        continue
      }
      const choice = await decide({
        kind: 'file',
        site: entry.site,
        username: entry.username,
        current: { password: winner.password, changedAt: winner.changedAt || null },
        incoming: { password: entry.password, changedAt: entry.changedAt || null }
      })
      if (choice !== 'current' && choice !== 'incoming') return null
      if (choice === 'incoming') winner = entry
      dropped++
    }
    settled.push(winner)
  }
  return { settled, dropped }
}

function applyImport(tree, entries, choiceFor, now) {
  const stats = { added: 0, same: 0, kept: 0, replaced: 0, deleted: 0, changed: false }
  entries.forEach((entry, index) => {
    const list = tree.credentials[entry.site] || []
    const live = liveCredential(list, entry.username)
    if (live) {
      if (live.password === entry.password) { stats.same++; return }
      const choice = choiceFor(index, live)
      if (choice === 'incoming') {
        const oldPassword = live.password
        live.password = entry.password
        retirePassword(live, oldPassword, now)
        stats.replaced++
      } else {
        live.previousPassword = entry.password
        live.previousSetAt = now
        delete live.newPasswordUses
        stats.kept++
      }
      live.updatedAt = now
      stats.changed = true
      return
    }
    if (blocksImport(deletedCredential(list, entry.username), entry)) { stats.deleted++; return }
    if (!tree.credentials[entry.site]) tree.credentials[entry.site] = list
    list.push(importedCredential(entry, now))
    stats.added++
    stats.changed = true
  })
  return stats
}

async function importLogins(entries, masterKey, decide) {
  const now = Date.now()
  const previousUntil = now + PREVIOUS_KEEP_MS
  const dedup = await settleFileDuplicates(entries, decide)
  if (!dedup) return { cancelled: true, changed: false }
  const snapshot = await readVaultTree(masterKey)
  const decisions = new Map()
  for (let index = 0; index < dedup.settled.length; index++) {
    const entry = dedup.settled[index]
    const live = liveCredential(snapshot.credentials[entry.site] || [], entry.username)
    if (!live || live.password === entry.password) continue
    const choice = await decide({
      kind: 'vault',
      site: entry.site,
      username: entry.username,
      current: { password: live.password, changedAt: stamp(live) || null, lastUsedAt: lastUsed(live) || null },
      incoming: { password: entry.password, changedAt: entry.changedAt || null },
      previousUntil
    })
    if (choice !== 'current' && choice !== 'incoming') return { cancelled: true, changed: false }
    decisions.set(index, { choice, password: live.password })
  }
  const tree = await readVaultTree(masterKey)
  const stats = applyImport(tree, dedup.settled, (index, live) => {
    const decided = decisions.get(index)
    if (decided && decided.password === live.password) return decided.choice
    return 'current'
  }, now)
  if (stats.changed) {
    tree.meta.lastAccess = now
    await writeVaultTree(tree, masterKey)
  }
  return Object.assign({ cancelled: false, fileDuplicates: dedup.dropped, previousUntil }, stats)
}

export {
  ensureVault,
  saveCredential,
  getCredentials,
  getAllDomains,
  updateCredential,
  deleteCredential,
  noteCredentialUse,
  restorePreviousPassword,
  previewLoginImport,
  previewLoginImportFor,
  importLogins,
  previousExpiresAt,
  PREVIOUS_KEEP_MS,
  autofill,
  getAppLink,
  setAppLink,
  removeAppLink,
  listAppLinks,
  mergeVaults,
  mergeRecordLists,
  laterRecord,
  sameCredentials,
  migrateLegacyVault,
  readVaultTree,
  writeVaultTree,
  decryptAnyRowToTree
}
