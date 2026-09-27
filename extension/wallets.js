import { getWalletVault, setWalletVault } from './store.js'
import { sealJson, openJson } from './sealed.js'
import { BIP39_WORDS } from './bip39-words.js'

const WALLETS_SCHEMA_VERSION = 1
const MAX_WORDS = 24
const POS_STEP = 1024
const STANDARD_LENGTHS = [12, 15, 18, 21, 24]
const DEFAULT_LABEL_PREFIX = 'Account '
const WORD_INDEX = new Map(BIP39_WORDS.map((word, i) => [word, i]))

function generateId() {
  return crypto.randomUUID()
}

function emptyTree() {
  return { meta: { version: WALLETS_SCHEMA_VERSION, createdAt: Date.now(), lastAccess: Date.now() }, accounts: [], order: {} }
}

function cleanWord(word) {
  return String(word || '').trim().toLowerCase()
}

function cleanWords(words) {
  const list = (Array.isArray(words) ? words : []).slice(0, MAX_WORDS).map(cleanWord)
  while (list.length > 0 && list[list.length - 1] === '') list.pop()
  return list
}

function isBip39Word(word) {
  return WORD_INDEX.has(cleanWord(word))
}

function suggestWords(prefix, limit) {
  const p = cleanWord(prefix)
  if (!p) return []
  const out = []
  for (const word of BIP39_WORDS) {
    if (word.startsWith(p)) {
      out.push(word)
      if (out.length >= limit) break
    }
  }
  return out
}

async function checkPhrase(words) {
  const list = cleanWords(words)
  if (!STANDARD_LENGTHS.includes(list.length)) return { valid: false, reason: 'length', count: list.length }
  if (!list.every((word) => WORD_INDEX.has(word))) return { valid: false, reason: 'words', count: list.length }
  const totalBits = list.length * 11
  const checksumBits = totalBits / 33
  const entropyBits = totalBits - checksumBits
  const bits = list.map((word) => WORD_INDEX.get(word).toString(2).padStart(11, '0')).join('')
  const entropy = new Uint8Array(entropyBits / 8)
  for (let i = 0; i < entropy.length; i++) entropy[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', entropy))
  const hashBits = Array.from(hash).map((b) => b.toString(2).padStart(8, '0')).join('')
  const valid = hashBits.slice(0, checksumBits) === bits.slice(entropyBits)
  return { valid, reason: valid ? null : 'checksum', count: list.length }
}

function isValidTree(tree) {
  if (!tree || typeof tree !== 'object' || !tree.meta || !Array.isArray(tree.accounts)) return false
  if (!tree.order || typeof tree.order !== 'object') return false
  for (const acct of tree.accounts) {
    if (!acct || typeof acct.id !== 'string') return false
    if (acct.deleted) continue
    if (typeof acct.wallet !== 'string' || typeof acct.label !== 'string' || !Array.isArray(acct.words)) return false
  }
  return true
}

async function decryptRow(row, key) {
  if (!row) return emptyTree()
  if (row.schemaVersion !== WALLETS_SCHEMA_VERSION || !row.blob) throw new Error('Unsupported wallets format')
  const tree = await openJson(row.blob, key)
  if (!isValidTree(tree)) throw new Error('Wallets have an unexpected shape')
  return tree
}

async function rowOpensWith(row, key) {
  if (!row) return true
  try { await decryptRow(row, key); return true } catch (e) { return false }
}

async function readTree(key) {
  return decryptRow(await getWalletVault(), key)
}

function byCreated(a, b) {
  return (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function liveAccounts(tree) {
  return tree.accounts.filter((acct) => !acct.deleted)
}

function tombstone(acct, now) {
  return { id: acct.id, deleted: true, deletedAt: now, updatedAt: now }
}

function normalize(tree) {
  const now = Date.now()
  const seen = new Map()
  for (const acct of liveAccounts(tree).sort(byCreated)) {
    if (acct.words.length === 0) continue
    const sig = acct.wallet + '\u0000' + acct.words.join(' ')
    if (seen.has(sig)) {
      const index = tree.accounts.indexOf(acct)
      tree.accounts[index] = tombstone(acct, Math.max(now, (acct.updatedAt || 0) + 1))
    } else {
      seen.set(sig, acct.id)
    }
  }
  const byWallet = new Map()
  for (const acct of liveAccounts(tree).sort(byCreated)) {
    if (!byWallet.has(acct.wallet)) byWallet.set(acct.wallet, [])
    byWallet.get(acct.wallet).push(acct)
  }
  for (const accounts of byWallet.values()) {
    const used = new Set()
    for (const acct of accounts) {
      let label = acct.label.trim() || DEFAULT_LABEL_PREFIX + '1'
      if (used.has(label)) {
        let n = 1
        while (used.has(label + '.' + n)) n++
        label = label + '.' + n
      }
      acct.label = label
      used.add(label)
    }
  }
  const deadIds = new Set(tree.accounts.filter((acct) => acct.deleted).map((acct) => acct.id))
  for (const orderKey of Object.keys(tree.order)) {
    if (orderKey.startsWith('a:') && deadIds.has(orderKey.slice(2))) delete tree.order[orderKey]
  }
  return tree
}

async function writeTree(tree, key) {
  normalize(tree)
  tree.meta.lastAccess = Date.now()
  await setWalletVault({ schemaVersion: WALLETS_SCHEMA_VERSION, blob: await sealJson(tree, key) })
}

function orderPos(tree, orderKey) {
  const entry = tree.order[orderKey]
  return entry && typeof entry.pos === 'number' && isFinite(entry.pos) ? entry.pos : null
}

function sortByOrder(tree, items, keyOf, fallback) {
  const placed = items.filter((item) => orderPos(tree, keyOf(item)) !== null)
    .sort((a, b) => orderPos(tree, keyOf(a)) - orderPos(tree, keyOf(b)) || fallback(a, b))
  const unplaced = items.filter((item) => orderPos(tree, keyOf(item)) === null).sort(fallback)
  return placed.concat(unplaced)
}

function walletKey(name) {
  return 'w:' + name
}

function accountKey(id) {
  return 'a:' + id
}

function groupWallets(tree) {
  const map = new Map()
  for (const acct of liveAccounts(tree)) {
    if (!map.has(acct.wallet)) map.set(acct.wallet, [])
    map.get(acct.wallet).push(acct)
  }
  const wallets = Array.from(map.entries()).map(([name, accounts]) => ({
    name,
    firstCreated: Math.min(...accounts.map((acct) => acct.createdAt || 0)),
    accounts: sortByOrder(tree, accounts, (acct) => accountKey(acct.id), byCreated)
  }))
  return sortByOrder(tree, wallets, (w) => walletKey(w.name), (a, b) => a.firstCreated - b.firstCreated || (a.name < b.name ? -1 : 1))
}

function publicAccount(acct) {
  return {
    id: acct.id,
    wallet: acct.wallet,
    label: acct.label,
    words: acct.words.slice(),
    notesHeader: acct.notesHeader || '',
    notes: acct.notes || '',
    createdAt: acct.createdAt,
    updatedAt: acct.updatedAt
  }
}

async function listWallets(key) {
  const tree = await readTree(key)
  return groupWallets(tree).map((w) => ({ name: w.name, accounts: w.accounts.map(publicAccount) }))
}

function nextDefaultLabel(accounts) {
  const used = new Set(accounts.map((acct) => acct.label))
  let n = 1
  while (used.has(DEFAULT_LABEL_PREFIX + n)) n++
  return DEFAULT_LABEL_PREFIX + n
}

async function defaultLabelFor(walletName, key) {
  const tree = await readTree(key)
  return nextDefaultLabel(liveAccounts(tree).filter((acct) => acct.wallet === walletName))
}

function maxPos(tree, prefix, filter) {
  let max = null
  for (const orderKey of Object.keys(tree.order)) {
    if (!orderKey.startsWith(prefix) || !filter(orderKey)) continue
    const pos = orderPos(tree, orderKey)
    if (pos !== null && (max === null || pos > max)) max = pos
  }
  return max
}

function labelTaken(tree, walletName, label, exceptId) {
  return liveAccounts(tree).some((acct) => acct.wallet === walletName && acct.label === label && acct.id !== exceptId)
}

async function addAccount(fields, key) {
  const walletName = String(fields.wallet || '').trim()
  if (!walletName) throw new Error('Wallet name is required')
  const words = cleanWords(fields.words)
  if (words.length === 0) throw new Error('Enter at least one word')
  const tree = await readTree(key)
  const siblings = liveAccounts(tree).filter((acct) => acct.wallet === walletName)
  const label = String(fields.label || '').trim() || nextDefaultLabel(siblings)
  if (labelTaken(tree, walletName, label, null)) throw new Error('That account name is already used in this wallet')
  const sig = words.join(' ')
  if (siblings.some((acct) => acct.words.join(' ') === sig)) throw new Error('These words are already saved in this wallet')
  const now = Date.now()
  const acct = {
    id: generateId(),
    wallet: walletName,
    label,
    words,
    notesHeader: String(fields.notesHeader || ''),
    notes: String(fields.notes || ''),
    createdAt: now,
    updatedAt: now
  }
  const siblingIds = new Set(siblings.map((s) => accountKey(s.id)))
  const accountMax = maxPos(tree, 'a:', (k) => siblingIds.has(k))
  if (accountMax !== null) tree.order[accountKey(acct.id)] = { pos: accountMax + POS_STEP, updatedAt: now }
  if (siblings.length === 0) {
    const walletMax = maxPos(tree, 'w:', () => true)
    if (walletMax !== null && orderPos(tree, walletKey(walletName)) === null) tree.order[walletKey(walletName)] = { pos: walletMax + POS_STEP, updatedAt: now }
  }
  tree.accounts.push(acct)
  await writeTree(tree, key)
  return publicAccount(acct)
}

async function updateAccount(id, fields, key) {
  const tree = await readTree(key)
  const acct = liveAccounts(tree).find((candidate) => candidate.id === id)
  if (!acct) throw new Error('Account not found')
  if (fields.label !== undefined) {
    const label = String(fields.label).trim()
    if (!label) throw new Error('Account name is required')
    if (labelTaken(tree, acct.wallet, label, acct.id)) throw new Error('That account name is already used in this wallet')
    acct.label = label
  }
  if (fields.words !== undefined) {
    const words = cleanWords(fields.words)
    if (words.length === 0) throw new Error('Enter at least one word')
    const sig = words.join(' ')
    if (liveAccounts(tree).some((other) => other.id !== acct.id && other.wallet === acct.wallet && other.words.join(' ') === sig)) {
      throw new Error('These words are already saved in this wallet')
    }
    acct.words = words
  }
  if (fields.notesHeader !== undefined) acct.notesHeader = String(fields.notesHeader)
  if (fields.notes !== undefined) acct.notes = String(fields.notes)
  acct.updatedAt = Date.now()
  await writeTree(tree, key)
  return publicAccount(acct)
}

async function renameWallet(oldName, newName, key) {
  const target = String(newName || '').trim()
  if (!target) throw new Error('Wallet name is required')
  if (target === oldName) return
  const tree = await readTree(key)
  if (liveAccounts(tree).some((acct) => acct.wallet === target)) throw new Error('A wallet with that name already exists')
  const now = Date.now()
  for (const acct of liveAccounts(tree)) {
    if (acct.wallet === oldName) {
      acct.wallet = target
      acct.updatedAt = now
    }
  }
  const pos = orderPos(tree, walletKey(oldName))
  if (pos !== null) tree.order[walletKey(target)] = { pos, updatedAt: now }
  await writeTree(tree, key)
}

async function deleteAccount(id, key) {
  const tree = await readTree(key)
  const index = tree.accounts.findIndex((acct) => acct.id === id && !acct.deleted)
  if (index === -1) return false
  tree.accounts[index] = tombstone(tree.accounts[index], Date.now())
  await writeTree(tree, key)
  return true
}

async function deleteWallet(name, key) {
  const tree = await readTree(key)
  const now = Date.now()
  tree.accounts = tree.accounts.map((acct) => (!acct.deleted && acct.wallet === name ? tombstone(acct, now) : acct))
  await writeTree(tree, key)
}

function applyMove(tree, orderedKeys, movedKey, targetIndex) {
  const from = orderedKeys.indexOf(movedKey)
  if (from === -1) return false
  const keys = orderedKeys.slice()
  keys.splice(from, 1)
  const index = Math.max(0, Math.min(targetIndex, keys.length))
  keys.splice(index, 0, movedKey)
  const now = Date.now()
  const prev = keys[index - 1]
  const next = keys[index + 1]
  const allPlaced = keys.every((k) => orderPos(tree, k) !== null)
  let pos = null
  if (allPlaced) {
    const prevPos = prev !== undefined ? orderPos(tree, prev) : null
    const nextPos = next !== undefined ? orderPos(tree, next) : null
    if (prevPos !== null && nextPos !== null) pos = (prevPos + nextPos) / 2
    else if (prevPos !== null) pos = prevPos + POS_STEP
    else if (nextPos !== null) pos = nextPos - POS_STEP
    else pos = POS_STEP
    if ((prevPos !== null && pos <= prevPos) || (nextPos !== null && pos >= nextPos)) pos = null
  }
  if (pos === null) {
    keys.forEach((k, i) => {
      const existing = tree.order[k]
      tree.order[k] = { pos: (i + 1) * POS_STEP, updatedAt: k === movedKey ? now : (existing ? existing.updatedAt : 0) }
    })
  }
  if (pos !== null) tree.order[movedKey] = { pos, updatedAt: now }
  else tree.order[movedKey].updatedAt = now
  return true
}

async function moveWallet(name, targetIndex, key) {
  const tree = await readTree(key)
  const keys = groupWallets(tree).map((w) => walletKey(w.name))
  if (!applyMove(tree, keys, walletKey(name), targetIndex)) return false
  await writeTree(tree, key)
  return true
}

async function moveAccount(id, targetIndex, key) {
  const tree = await readTree(key)
  const acct = liveAccounts(tree).find((candidate) => candidate.id === id)
  if (!acct) return false
  const wallet = groupWallets(tree).find((w) => w.name === acct.wallet)
  const keys = wallet.accounts.map((a) => accountKey(a.id))
  if (!applyMove(tree, keys, accountKey(id), targetIndex)) return false
  await writeTree(tree, key)
  return true
}

async function sortWalletsAZ(key) {
  const tree = await readTree(key)
  const names = groupWallets(tree).map((w) => w.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : 1))
  const now = Date.now()
  names.forEach((name, i) => { tree.order[walletKey(name)] = { pos: (i + 1) * POS_STEP, updatedAt: now } })
  await writeTree(tree, key)
}

function newer(a, b) {
  const au = a.updatedAt || 0
  const bu = b.updatedAt || 0
  if (au !== bu) return au > bu ? a : b
  if (a.deleted && !b.deleted) return a
  if (b.deleted && !a.deleted) return b
  return a
}

function mergeTrees(localTree, incomingTree) {
  const byId = new Map()
  for (const acct of localTree.accounts) byId.set(acct.id, acct)
  for (const acct of incomingTree.accounts) {
    const current = byId.get(acct.id)
    byId.set(acct.id, current ? newer(current, acct) : acct)
  }
  const order = Object.assign({}, localTree.order)
  for (const [orderKey, entry] of Object.entries(incomingTree.order)) {
    const current = order[orderKey]
    if (!current || (entry.updatedAt || 0) > (current.updatedAt || 0)) order[orderKey] = entry
  }
  return normalize({
    meta: {
      version: WALLETS_SCHEMA_VERSION,
      createdAt: Math.min(localTree.meta.createdAt || Date.now(), incomingTree.meta.createdAt || Date.now()),
      lastAccess: Date.now()
    },
    accounts: Array.from(byId.values()),
    order
  })
}

async function importRow(incomingRow, key) {
  if (!incomingRow) return
  const incomingTree = await decryptRow(incomingRow, key)
  const localTree = await readTree(key)
  await writeTree(mergeTrees(localTree, incomingTree), key)
}

export {
  MAX_WORDS,
  STANDARD_LENGTHS,
  isBip39Word,
  suggestWords,
  checkPhrase,
  decryptRow,
  rowOpensWith,
  listWallets,
  defaultLabelFor,
  addAccount,
  updateAccount,
  renameWallet,
  deleteAccount,
  deleteWallet,
  moveWallet,
  moveAccount,
  sortWalletsAZ,
  mergeTrees,
  importRow
}
