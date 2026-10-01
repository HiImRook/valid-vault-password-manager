const MIN_QUERY_LENGTH = 2
const SEARCH_DELAY_MS = 150
const HIT_CLASS = 'hit'
const ACTIVE_CLASS = 'hit-active'
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'MARK'])

const searchInput = document.getElementById('guide-search')
const searchCount = document.getElementById('guide-search-count')
const btnPrev = document.getElementById('guide-search-prev')
const btnNext = document.getElementById('guide-search-next')
const page = document.querySelector('.page')

const searchState = { hits: [], index: -1, timer: null }

function clearHits() {
  for (const mark of page.querySelectorAll('mark.' + HIT_CLASS)) {
    const parent = mark.parentNode
    parent.replaceChild(document.createTextNode(mark.textContent), mark)
    parent.normalize()
  }
  searchState.hits = []
  searchState.index = -1
}

function textNodesUnder(root) {
  const nodes = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      if (SKIP_TAGS.has(node.parentNode.nodeName)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })
  while (walker.nextNode()) nodes.push(walker.currentNode)
  return nodes
}

function markNode(node, query) {
  const text = node.nodeValue
  const lower = text.toLowerCase()
  let at = lower.indexOf(query)
  if (at === -1) return
  const frag = document.createDocumentFragment()
  let last = 0
  while (at !== -1) {
    if (at > last) frag.appendChild(document.createTextNode(text.slice(last, at)))
    const mark = document.createElement('mark')
    mark.className = HIT_CLASS
    mark.textContent = text.slice(at, at + query.length)
    frag.appendChild(mark)
    searchState.hits.push(mark)
    last = at + query.length
    at = lower.indexOf(query, last)
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
  node.parentNode.replaceChild(frag, node)
}

function updateCount() {
  const total = searchState.hits.length
  if (!searchInput.value.trim()) searchCount.textContent = ''
  else if (searchInput.value.trim().length < MIN_QUERY_LENGTH) searchCount.textContent = ''
  else if (!total) searchCount.textContent = 'No matches'
  else searchCount.textContent = (searchState.index + 1) + ' of ' + total
  btnPrev.disabled = total < 2
  btnNext.disabled = total < 2
}

function focusHit(index) {
  const total = searchState.hits.length
  if (!total) { updateCount(); return }
  if (searchState.index >= 0 && searchState.hits[searchState.index]) searchState.hits[searchState.index].classList.remove(ACTIVE_CLASS)
  searchState.index = (index + total) % total
  const hit = searchState.hits[searchState.index]
  hit.classList.add(ACTIVE_CLASS)
  hit.scrollIntoView({ block: 'center', behavior: 'smooth' })
  updateCount()
}

function runSearch() {
  clearHits()
  const query = searchInput.value.trim().toLowerCase()
  if (query.length < MIN_QUERY_LENGTH) { updateCount(); return }
  for (const node of textNodesUnder(page)) markNode(node, query)
  if (searchState.hits.length) focusHit(0)
  else updateCount()
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchState.timer)
  searchState.timer = setTimeout(runSearch, SEARCH_DELAY_MS)
})

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    clearTimeout(searchState.timer)
    if (!searchState.hits.length) { runSearch(); return }
    focusHit(searchState.index + (e.shiftKey ? -1 : 1))
  }
  if (e.key === 'Escape') {
    searchInput.value = ''
    clearHits()
    updateCount()
  }
})

btnNext.addEventListener('click', () => focusHit(searchState.index + 1))
btnPrev.addEventListener('click', () => focusHit(searchState.index - 1))

document.addEventListener('keydown', (e) => {
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') || (e.key === '/' && document.activeElement !== searchInput)) {
    e.preventDefault()
    searchInput.focus()
    searchInput.select()
  }
})

updateCount()
