import { getBookmarksVault, setBookmarksVault } from './store.js'
import { sealJson, openJson } from './sealed.js'

const BOOKMARKS_SCHEMA_VERSION = 1
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
  const tree = await openJson(row.blob, key)
  if (!isValidTree(tree)) throw new Error('Bookmarks have an unexpected shape')
  return tree
}

async function readTree(key) {
  return decryptRow(await getBookmarksVault(), key)
}

async function writeTree(tree, key) {
  tree.meta.lastAccess = Date.now()
  await setBookmarksVault({ schemaVersion: BOOKMARKS_SCHEMA_VERSION, blob: await sealJson(tree, key) })
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
  const now = Date.now()
  if (pos === null || (prev && pos <= prev.pos) || (next && pos >= next.pos)) {
    ordered.forEach((item, i) => {
      const nextPos = (i + 1) * POS_STEP
      if (item.pos !== nextPos) {
        item.pos = nextPos
        item.updatedAt = now
      }
    })
  } else {
    moved.pos = pos
  }
  moved.updatedAt = now
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

function laterItem(a, b) {
  const at = a.updatedAt || 0
  const bt = b.updatedAt || 0
  if (at !== bt) return at > bt ? a : b
  if (!a.deleted && b.deleted) return a
  if (a.deleted && !b.deleted) return b
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

function mergeTrees(localTree, incomingTree) {
  const byUrl = new Map()
  for (const item of [...localTree.items, ...incomingTree.items]) {
    const current = byUrl.get(item.url)
    byUrl.set(item.url, current ? laterItem(current, item) : item)
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

function canonicalItems(tree) {
  return JSON.stringify(tree.items.slice().sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0)))
}

function sameTrees(a, b) {
  return canonicalItems(a) === canonicalItems(b)
}

function planBookmarkImport(tree, entries) {
  const live = new Set(tree.items.filter((item) => !item.deleted).map((item) => item.url))
  const deleted = new Set(tree.items.filter((item) => item.deleted).map((item) => item.url))
  const seen = new Set()
  const plan = { fresh: [], existing: 0, duplicates: 0, deleted: 0 }
  for (const entry of entries) {
    if (!isBookmarkable(entry.url)) continue
    const url = normalizeUrl(entry.url)
    if (seen.has(url)) { plan.duplicates++; continue }
    seen.add(url)
    if (live.has(url)) { plan.existing++; continue }
    if (deleted.has(url)) { plan.deleted++; continue }
    plan.fresh.push({ url, title: String(entry.title || '').trim() || url })
  }
  return plan
}

async function previewBookmarkImport(entries, key) {
  return planBookmarkImport(await readTree(key), entries)
}

async function importBookmarkList(entries, key) {
  const tree = await readTree(key)
  const plan = planBookmarkImport(tree, entries)
  if (plan.fresh.length === 0) return Object.assign({ added: 0 }, plan)
  const now = Date.now()
  const placed = tree.items.filter((item) => !item.deleted && hasPos(item))
  let pos = placed.length > 0 ? Math.max(...placed.map((item) => item.pos)) : 0
  const unplaced = tree.items.some((item) => !item.deleted && !hasPos(item))
  for (const entry of plan.fresh) {
    const item = { id: generateId(), url: entry.url, title: entry.title, createdAt: now, updatedAt: now }
    if (placed.length > 0 || !unplaced) {
      pos += POS_STEP
      item.pos = pos
    }
    tree.items.push(item)
  }
  await writeTree(tree, key)
  return Object.assign({ added: plan.fresh.length }, plan)
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
  sameTrees,
  writeTree,
  readTree,
  planBookmarkImport,
  previewBookmarkImport,
  importBookmarkList
}
