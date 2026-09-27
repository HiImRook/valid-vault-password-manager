import { getBookmarksVault, setBookmarksVault } from './store.js'

const BOOKMARKS_SCHEMA_VERSION = 1
const IV_LENGTH = 12
const BASE64_CHUNK = 32768
const POS_STEP = 1024

function generateId() {
  return crypto.randomUUID()
}

function emptyTree() {
  return { meta: { version: BOOKMARKS_SCHEMA_VERSION, createdAt: Date.now(), lastAccess: Date.now() }, items: [] }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.href
  } catch (e) {
    return String(url || '')
  }
}

function isBookmarkable(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch (e) {
    return false
  }
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(text) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function streamBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function encryptTree(tree, key) {
  const plain = new TextEncoder().encode(JSON.stringify(tree))
  const compressed = await streamBytes(plain, new CompressionStream('deflate'))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed))
  return { iv: bytesToBase64(iv), data: bytesToBase64(ciphertext) }
}

function isValidTree(tree) {
  if (!tree || typeof tree !== 'object' || !tree.meta || !Array.isArray(tree.items)) return false
  for (const item of tree.items) {
    if (!item || typeof item.id !== 'string' || typeof item.url !== 'string') return false
    if (item.deleted !== undefined && typeof item.deleted !== 'boolean') return false
    if (!item.deleted && typeof item.title !== 'string') return false
  }
  return true
}

async function decryptRow(row, key) {
  if (!row) return emptyTree()
  if (row.schemaVersion !== BOOKMARKS_SCHEMA_VERSION || !row.blob) throw new Error('Unsupported bookmarks format')
  const iv = base64ToBytes(row.blob.iv)
  const ciphertext = base64ToBytes(row.blob.data)
  const compressed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext))
  const plain = await streamBytes(compressed, new DecompressionStream('deflate'))
  const tree = JSON.parse(new TextDecoder().decode(plain))
  if (!isValidTree(tree)) throw new Error('Bookmarks have an unexpected shape')
  return tree
}

async function readTree(key) {
  return decryptRow(await getBookmarksVault(), key)
}

async function writeTree(tree, key) {
  tree.meta.lastAccess = Date.now()
  await setBookmarksVault({ schemaVersion: BOOKMARKS_SCHEMA_VERSION, blob: await encryptTree(tree, key) })
}

async function rowOpensWith(row, key) {
  if (!row) return true
  try { await decryptRow(row, key); return true } catch (e) { return false }
}

function hasPos(item) {
  return typeof item.pos === 'number' && isFinite(item.pos)
}

function compareTitles(a, b) {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

function orderItems(items) {
  const live = items.filter((item) => !item.deleted)
  const placed = live.filter(hasPos).sort((a, b) => a.pos - b.pos || compareTitles(a, b))
  const unplaced = live.filter((item) => !hasPos(item)).sort(compareTitles)
  return placed.concat(unplaced)
}

async function listBookmarks(key) {
  const tree = await readTree(key)
  return orderItems(tree.items)
}

async function findByUrl(url, key) {
  const target = normalizeUrl(url)
  const items = await listBookmarks(key)
  return items.find((item) => item.url === target) || null
}

async function saveBookmark(url, title, key) {
  const target = normalizeUrl(url)
  const tree = await readTree(key)
  const now = Date.now()
  const existing = tree.items.find((item) => item.url === target && !item.deleted)
  const cleanTitle = String(title || '').trim() || target
  if (existing) {
    existing.title = cleanTitle
    existing.updatedAt = now
    await writeTree(tree, key)
    return existing
  }
  tree.items = tree.items.filter((item) => !(item.url === target && item.deleted))
  const item = { id: generateId(), url: target, title: cleanTitle, createdAt: now, updatedAt: now }
  const placed = tree.items.filter((candidate) => !candidate.deleted && hasPos(candidate))
  if (placed.length > 0) item.pos = Math.max(...placed.map((candidate) => candidate.pos)) + POS_STEP
  tree.items.push(item)
  await writeTree(tree, key)
  return item
}

async function renameBookmark(id, title, key) {
  const tree = await readTree(key)
  const item = tree.items.find((candidate) => candidate.id === id && !candidate.deleted)
  if (!item) return false
  item.title = String(title || '').trim() || item.url
  item.updatedAt = Date.now()
  await writeTree(tree, key)
  return true
}

async function moveBookmark(id, targetIndex, key) {
  const tree = await readTree(key)
  const ordered = orderItems(tree.items)
  const from = ordered.findIndex((item) => item.id === id)
  if (from === -1) return false
  const moved = ordered.splice(from, 1)[0]
  const index = Math.max(0, Math.min(targetIndex, ordered.length))
  ordered.splice(index, 0, moved)
  const prev = ordered[index - 1]
  const next = ordered[index + 1]
  const allPlaced = ordered.every(hasPos)
  let pos = null
  if (allPlaced) {
    if (prev && next) pos = (prev.pos + next.pos) / 2
    else if (prev) pos = prev.pos + POS_STEP
    else if (next) pos = next.pos - POS_STEP
    else pos = POS_STEP
  }
  if (pos === null || (prev && pos <= prev.pos) || (next && pos >= next.pos)) {
    ordered.forEach((item, i) => { item.pos = (i + 1) * POS_STEP })
  } else {
    moved.pos = pos
  }
  moved.updatedAt = Date.now()
  await writeTree(tree, key)
  return true
}

async function removeBookmark(id, key) {
  const tree = await readTree(key)
  const index = tree.items.findIndex((candidate) => candidate.id === id)
  if (index === -1) return false
  const now = Date.now()
  tree.items[index] = { id: tree.items[index].id, url: tree.items[index].url, deleted: true, deletedAt: now, updatedAt: now }
  await writeTree(tree, key)
  return true
}

function mergeTrees(localTree, incomingTree) {
  const byUrl = new Map()
  for (const item of [...localTree.items, ...incomingTree.items]) {
    const current = byUrl.get(item.url)
    if (!current || (item.updatedAt || 0) > (current.updatedAt || 0)) byUrl.set(item.url, item)
  }
  return {
    meta: {
      version: BOOKMARKS_SCHEMA_VERSION,
      createdAt: Math.min(localTree.meta.createdAt || Date.now(), incomingTree.meta.createdAt || Date.now()),
      lastAccess: Date.now()
    },
    items: Array.from(byUrl.values())
  }
}

async function importRow(incomingRow, key) {
  if (!incomingRow) return
  const incomingTree = await decryptRow(incomingRow, key)
  const localTree = await readTree(key)
  await writeTree(mergeTrees(localTree, incomingTree), key)
}

export {
  normalizeUrl,
  isBookmarkable,
  decryptRow,
  rowOpensWith,
  listBookmarks,
  findByUrl,
  saveBookmark,
  renameBookmark,
  moveBookmark,
  removeBookmark,
  orderItems,
  mergeTrees,
  importRow
}
