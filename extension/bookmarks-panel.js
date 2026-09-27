import * as bookmarks from './bookmarks.js'
import { masterKeyToCryptoKey } from './crypto.js'

const MASTER_KEY_LENGTH = 32

const filterInput = document.getElementById('filter')
const countEl = document.getElementById('count')
const gate = document.getElementById('gate')
const listEl = document.getElementById('list')
const btnUnlock = document.getElementById('btn-unlock')

const panelState = { key: null, items: [], editingId: null, confirmingId: null, dragId: null, loadSeq: 0 }

function markActivity() {
  try { chrome.runtime.sendMessage({ action: 'activity' }).catch(() => {}) } catch (e) {}
}

function hostOf(url) {
  try { return new URL(url).hostname } catch (e) { return url }
}

async function readSessionKey() {
  try {
    const stored = await chrome.storage.session.get('masterKeyBytes')
    if (stored && stored.masterKeyBytes && stored.masterKeyBytes.length === MASTER_KEY_LENGTH) {
      return masterKeyToCryptoKey(new Uint8Array(stored.masterKeyBytes))
    }
  } catch (e) {}
  return null
}

function showLocked() {
  panelState.key = null
  panelState.items = []
  panelState.editingId = null
  panelState.confirmingId = null
  listEl.textContent = ''
  listEl.classList.add('hidden')
  filterInput.classList.add('hidden')
  countEl.classList.add('hidden')
  gate.classList.remove('hidden')
}

function showUnlocked() {
  gate.classList.add('hidden')
  listEl.classList.remove('hidden')
  filterInput.classList.remove('hidden')
  countEl.classList.remove('hidden')
}

function filterActive() {
  return filterInput.value.trim() !== ''
}

function visibleItems() {
  const query = filterInput.value.trim().toLowerCase()
  if (!query) return panelState.items
  return panelState.items.filter((item) => item.title.toLowerCase().includes(query) || item.url.toLowerCase().includes(query))
}

function clearDropMarks() {
  for (const row of listEl.querySelectorAll('.drop-before, .drop-after')) row.classList.remove('drop-before', 'drop-after')
}

function dropAfter(row, e) {
  const rect = row.getBoundingClientRect()
  return e.clientY > rect.top + rect.height / 2
}

async function commitMove(id, targetIndex) {
  if (!panelState.key) return
  try {
    await bookmarks.moveBookmark(id, targetIndex, panelState.key)
  } catch (e) {}
  await load()
}

function wireDrag(row, grip, item, index) {
  grip.onmousedown = () => { row.draggable = true }
  grip.onmouseup = () => { row.draggable = false }
  grip.onclick = (e) => e.stopPropagation()
  row.ondragstart = (e) => {
    panelState.dragId = item.id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', item.id)
    row.classList.add('dragging')
    markActivity()
  }
  row.ondragend = () => {
    row.draggable = false
    row.classList.remove('dragging')
    panelState.dragId = null
    clearDropMarks()
  }
  row.ondragover = (e) => {
    if (!panelState.dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    clearDropMarks()
    if (panelState.dragId === item.id) return
    row.classList.add(dropAfter(row, e) ? 'drop-after' : 'drop-before')
  }
  row.ondrop = (e) => {
    e.preventDefault()
    const dragId = panelState.dragId
    clearDropMarks()
    if (!dragId || dragId === item.id) return
    const from = panelState.items.findIndex((candidate) => candidate.id === dragId)
    let target = dropAfter(row, e) ? index + 1 : index
    if (from !== -1 && from < target) target -= 1
    if (target === from) return
    commitMove(dragId, target)
  }
}

function makeButton(label, title, className, handler) {
  const btn = document.createElement('button')
  btn.className = 'item-btn' + (className ? ' ' + className : '')
  btn.textContent = label
  btn.title = title
  btn.onclick = (e) => {
    e.stopPropagation()
    markActivity()
    handler()
  }
  return btn
}

function openBookmark(item, newTab) {
  markActivity()
  if (newTab) {
    chrome.tabs.create({ url: item.url })
    return
  }
  chrome.tabs.update({ url: item.url })
}

async function commitRename(item, value) {
  panelState.editingId = null
  const title = value.trim()
  if (!title || title === item.title || !panelState.key) {
    render()
    return
  }
  try {
    await bookmarks.renameBookmark(item.id, title, panelState.key)
    await load()
  } catch (e) {
    render()
  }
}

async function commitRemove(item) {
  panelState.confirmingId = null
  if (!panelState.key) return
  try {
    await bookmarks.removeBookmark(item.id, panelState.key)
  } catch (e) {}
  await load()
}

function renderEditing(row, item) {
  const input = document.createElement('input')
  input.className = 'rename-input'
  input.value = item.title
  input.onclick = (e) => e.stopPropagation()
  input.onkeydown = (e) => {
    markActivity()
    if (e.key === 'Enter') commitRename(item, input.value)
    if (e.key === 'Escape') {
      panelState.editingId = null
      render()
    }
  }
  input.onblur = () => {
    if (panelState.editingId === item.id) commitRename(item, input.value)
  }
  row.appendChild(input)
  setTimeout(() => {
    input.focus()
    input.select()
  }, 0)
}

function renderConfirming(row, item) {
  const text = document.createElement('div')
  text.className = 'item-text'
  const title = document.createElement('div')
  title.className = 'item-title'
  title.textContent = 'Remove ' + item.title + '?'
  text.appendChild(title)
  row.appendChild(text)
  row.appendChild(makeButton('✓', 'Remove', 'del', () => commitRemove(item)))
  row.appendChild(makeButton('↩', 'Keep', '', () => {
    panelState.confirmingId = null
    render()
  }))
}

function renderNormal(row, item, index) {
  if (!filterActive()) {
    const grip = document.createElement('div')
    grip.className = 'grip'
    grip.title = 'Drag to reorder'
    grip.textContent = '\u22ee\u22ee'
    row.appendChild(grip)
    wireDrag(row, grip, item, index)
  }
  const text = document.createElement('div')
  text.className = 'item-text'
  const title = document.createElement('div')
  title.className = 'item-title'
  title.textContent = item.title
  const host = document.createElement('div')
  host.className = 'item-host'
  host.textContent = hostOf(item.url)
  text.appendChild(title)
  text.appendChild(host)
  row.title = item.url
  row.appendChild(text)
  row.appendChild(makeButton('✎', 'Rename', '', () => {
    panelState.editingId = item.id
    panelState.confirmingId = null
    render()
  }))
  row.appendChild(makeButton('✕', 'Remove', 'del', () => {
    panelState.confirmingId = item.id
    panelState.editingId = null
    render()
  }))
  row.onclick = (e) => openBookmark(item, e.ctrlKey || e.metaKey || e.shiftKey)
  row.onauxclick = (e) => {
    if (e.button === 1) openBookmark(item, true)
  }
}

function render() {
  listEl.textContent = ''
  const items = visibleItems()
  const total = panelState.items.length
  countEl.textContent = total === 1 ? '1 bookmark' : total + ' bookmarks'
  if (total === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'No bookmarks yet. Open the Valid Vault popup on any page and tap the bookmark icon next to the lock.'
    listEl.appendChild(empty)
    return
  }
  if (items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'No matches.'
    listEl.appendChild(empty)
    return
  }
  items.forEach((item, index) => {
    const row = document.createElement('div')
    row.className = 'item'
    if (panelState.editingId === item.id) renderEditing(row, item)
    else if (panelState.confirmingId === item.id) renderConfirming(row, item)
    else renderNormal(row, item, index)
    listEl.appendChild(row)
  })
}

async function load() {
  const seq = ++panelState.loadSeq
  const key = await readSessionKey()
  if (seq !== panelState.loadSeq) return
  if (!key) {
    showLocked()
    return
  }
  try {
    const items = await bookmarks.listBookmarks(key)
    if (seq !== panelState.loadSeq) return
    panelState.key = key
    panelState.items = items
    showUnlocked()
    render()
  } catch (e) {
    if (seq !== panelState.loadSeq) return
    panelState.key = null
    panelState.items = []
    showUnlocked()
    listEl.textContent = ''
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'Bookmarks could not be opened with this vault key.'
    listEl.appendChild(empty)
  }
}

btnUnlock.onclick = async () => {
  btnUnlock.disabled = true
  try { await chrome.runtime.sendMessage({ action: 'requestUnlock' }) } catch (e) {}
  btnUnlock.disabled = false
  load()
}

filterInput.oninput = () => {
  markActivity()
  render()
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.masterKeyBytes) load()
})

chrome.runtime.onMessage.addListener((request) => {
  if (request && request.action === 'bookmarksChanged') load()
})

load()
