import * as wallets from './wallets.js'

const SUGGEST_LIMIT = 6
const DEFAULT_HIDE_SEC = 60
const EDIT_WARNING = 'Seed words are checked against the standard seed word list as you type. Changing a word to the wrong one can cost you access to this wallet, so edit carefully.'

const state = {
  unlocked: false,
  list: [],
  revealed: new Set(),
  editor: null,
  confirmingDelete: null,
  drag: null,
  hideTimer: null,
  hideSeconds: DEFAULT_HIDE_SEC,
  deps: null,
  els: null,
  suggestBox: null
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label, className, handler) {
  const b = el('button', className, label)
  b.type = 'button'
  b.onclick = (e) => {
    e.stopPropagation()
    handler(e)
  }
  return b
}

function showMsg(text, type) {
  const box = state.els.msg
  box.textContent = text
  box.className = 'msg ' + (type || 'success')
  clearTimeout(box.hideTimer)
  box.hideTimer = setTimeout(() => box.classList.add('hidden'), 4000)
}

function key() {
  return state.deps.getKey()
}

function dialog(options) {
  return new Promise((resolve) => {
    const overlay = el('div', 'wv-dialog-overlay')
    const box = el('div', 'wv-dialog')
    box.appendChild(el('div', 'wv-dialog-title', options.title))
    if (options.text) box.appendChild(el('p', 'wv-dialog-text', options.text))
    let input = null
    if (options.input !== undefined) {
      input = el('input', 'wv-dialog-input')
      input.type = 'text'
      input.value = options.input
      box.appendChild(input)
    }
    const row = el('div', 'wv-dialog-actions')
    const finish = (value) => {
      overlay.remove()
      document.removeEventListener('keydown', onKey, true)
      resolve(value)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(input ? null : false) }
      if (e.key === 'Enter' && input) { e.preventDefault(); finish(input.value) }
    }
    row.appendChild(button(options.cancelLabel || 'Cancel', 'secondary', () => finish(input ? null : false)))
    row.appendChild(button(options.okLabel || 'Continue', options.danger ? 'danger' : '', () => finish(input ? input.value : true)))
    box.appendChild(row)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    document.addEventListener('keydown', onKey, true)
    if (input) {
      input.focus()
      input.select()
    } else {
      row.lastChild.focus()
    }
  })
}

function clearHideTimer() {
  if (state.hideTimer) {
    clearTimeout(state.hideTimer)
    state.hideTimer = null
  }
}

function armHideTimer() {
  clearHideTimer()
  if (!state.unlocked) return
  state.hideTimer = setTimeout(() => closeSection(), state.hideSeconds * 1000)
}

async function loadHideSeconds() {
  try {
    const stored = await chrome.storage.local.get(['autoLockTimeout'])
    if (stored.autoLockTimeout) state.hideSeconds = stored.autoLockTimeout
  } catch (e) {}
}

function hideAll() {
  closeSuggest()
  const hadVisible = state.revealed.size > 0 || (state.editor && !state.editor.covered)
  state.revealed.clear()
  if (state.editor) {
    captureEditor()
    state.editor.covered = true
  }
  if (hadVisible) render()
}

function closeSection() {
  clearHideTimer()
  closeSuggest()
  if (!state.unlocked) return
  if (state.editor) {
    captureEditor()
    state.editor.covered = true
  }
  state.unlocked = false
  state.list = []
  state.revealed.clear()
  state.confirmingDelete = null
  render()
}

function lock() {
  clearHideTimer()
  closeSuggest()
  state.unlocked = false
  state.list = []
  state.revealed.clear()
  state.editor = null
  state.confirmingDelete = null
  render()
}

async function reload() {
  const k = key()
  if (!k) {
    lock()
    return
  }
  try {
    state.list = await wallets.listWallets(k)
  } catch (e) {
    state.list = []
    state.els.content.textContent = ''
    state.els.content.appendChild(el('div', 'wv-empty wv-error', 'Could not open saved wallets with the current master key'))
    return
  }
  render()
}

function closeSuggest() {
  if (state.suggestBox) {
    state.suggestBox.remove()
    state.suggestBox = null
  }
}

function wordInputs() {
  return state.els.content.querySelectorAll('.wv-word-input')
}

function focusWord(index) {
  const inputs = wordInputs()
  if (inputs[index]) inputs[index].focus()
}

function acceptSuggestion(input, word) {
  input.value = word
  input.dataset.accepted = ''
  closeSuggest()
  const index = Number(input.dataset.index)
  if (index < wallets.MAX_WORDS - 1) focusWord(index + 1)
}

function showSuggest(input) {
  closeSuggest()
  const value = input.value.trim().toLowerCase()
  if (!value) return
  const matches = wallets.suggestWords(value, SUGGEST_LIMIT)
  if (matches.length === 0 || (matches.length === 1 && matches[0] === value)) return
  const box = el('div', 'wv-suggest')
  for (const word of matches) {
    const item = el('div', 'wv-suggest-item', word)
    item.onmousedown = (e) => {
      e.preventDefault()
      acceptSuggestion(input, word)
    }
    box.appendChild(item)
  }
  const rect = input.getBoundingClientRect()
  box.style.left = Math.round(rect.left + window.scrollX) + 'px'
  box.style.top = Math.round(rect.bottom + window.scrollY + 2) + 'px'
  box.style.minWidth = Math.round(rect.width) + 'px'
  document.body.appendChild(box)
  state.suggestBox = box
}

const pendingChecks = new WeakMap()

function checkWordInput(input) {
  if (pendingChecks.has(input)) return pendingChecks.get(input)
  const check = runWordCheck(input).finally(() => pendingChecks.delete(input))
  pendingChecks.set(input, check)
  return check
}

async function runWordCheck(input) {
  const value = input.value.trim().toLowerCase()
  input.value = value
  if (!value || wallets.isBip39Word(value) || input.dataset.accepted === value) return true
  const keep = await dialog({
    title: 'Word not recognized',
    text: '"' + value + '" in box ' + (Number(input.dataset.index) + 1) + ' is not in the standard seed word list. Continue keeps it as typed. Cancel clears the box.',
    okLabel: 'Continue',
    cancelLabel: 'Cancel'
  })
  if (keep) {
    input.dataset.accepted = value
    return true
  }
  input.value = ''
  input.dataset.accepted = ''
  return false
}

function captureEditor() {
  const ed = state.editor
  if (!ed || ed.covered) return
  const root = state.els.content.querySelector('.wv-editor')
  if (!root) return
  const walletInput = root.querySelector('.wv-wallet-input')
  const labelInput = root.querySelector('.wv-label-input')
  if (walletInput) ed.wallet = walletInput.value
  if (labelInput) ed.label = labelInput.value
  const inputs = root.querySelectorAll('.wv-word-input')
  if (inputs.length) {
    ed.words = Array.from(inputs).map((input) => input.value)
    ed.accepted = Array.from(inputs).map((input) => input.dataset.accepted || '')
  }
  const header = root.querySelector('.wv-notes-header')
  const notes = root.querySelector('.wv-notes-body')
  if (header) ed.notesHeader = header.value
  if (notes) ed.notes = notes.value
}

function openEditor(editor) {
  state.editor = Object.assign({ covered: false, stage: 'words', words: [], accepted: [], label: '', wallet: '', notesHeader: '', notes: '' }, editor)
  state.confirmingDelete = null
  render()
  armHideTimer()
}

function closeEditor() {
  closeSuggest()
  state.editor = null
  render()
  armHideTimer()
}

function wordGridInputs(ed) {
  const grid = el('div', 'wv-grid')
  for (let i = 0; i < wallets.MAX_WORDS; i++) {
    const cell = el('label', 'wv-cell')
    cell.appendChild(el('span', 'wv-num', String(i + 1)))
    const input = el('input', 'wv-word-input')
    input.type = 'text'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.setAttribute('autocapitalize', 'off')
    input.dataset.index = String(i)
    input.value = ed.words[i] || ''
    input.dataset.accepted = ed.accepted[i] || ''
    input.oninput = () => {
      armHideTimer()
      const parts = input.value.trim().split(/\s+/)
      if (parts.length > 1 && /\s/.test(input.value.trim())) {
        const inputs = wordInputs()
        parts.slice(0, wallets.MAX_WORDS - i).forEach((part, offset) => {
          inputs[i + offset].value = part.toLowerCase()
          inputs[i + offset].dataset.accepted = ''
        })
        closeSuggest()
        focusWord(Math.min(i + parts.length, wallets.MAX_WORDS - 1))
        return
      }
      showSuggest(input)
    }
    input.onkeydown = (e) => {
      if ((e.key === 'Tab' || e.key === 'Enter') && state.suggestBox && !e.shiftKey) {
        const first = state.suggestBox.querySelector('.wv-suggest-item')
        if (first) {
          e.preventDefault()
          acceptSuggestion(input, first.textContent)
          return
        }
      }
      if (e.key === ' ') {
        e.preventDefault()
        if (i < wallets.MAX_WORDS - 1) focusWord(i + 1)
      }
      if (e.key === 'Escape') closeSuggest()
    }
    input.onfocus = () => showSuggest(input)
    input.onblur = () => {
      closeSuggest()
      setTimeout(() => {
        if (!input.isConnected || !document.hasFocus() || !input.value.trim()) return
        checkWordInput(input)
      }, 0)
    }
    cell.appendChild(input)
    grid.appendChild(cell)
  }
  return grid
}

function renderCovered(container) {
  const cover = el('div', 'wv-covered')
  cover.appendChild(el('div', 'wv-covered-text', 'Hidden. Click to show.'))
  cover.onclick = () => {
    state.editor.covered = false
    render()
    armHideTimer()
  }
  container.appendChild(cover)
}

function renderEditor(container) {
  const ed = state.editor
  const root = el('div', 'wv-editor')
  if (ed.covered) {
    renderCovered(root)
    container.appendChild(root)
    return
  }
  const titleText = ed.mode === 'new-wallet' ? 'New Wallet' : ed.mode === 'new-account' ? 'New Account in ' + ed.wallet : 'Edit ' + ed.wallet + ' / ' + ed.originalLabel
  root.appendChild(el('div', 'wv-editor-title', titleText))
  if (ed.stage === 'words') {
    if (ed.mode === 'edit') root.appendChild(el('div', 'wv-warning', EDIT_WARNING))
    const fields = el('div', 'wv-fields')
    if (ed.mode === 'new-wallet') {
      const walletInput = el('input', 'wv-wallet-input')
      walletInput.type = 'text'
      walletInput.placeholder = 'Wallet name'
      walletInput.value = ed.wallet
      fields.appendChild(walletInput)
    }
    const labelInput = el('input', 'wv-label-input')
    labelInput.type = 'text'
    labelInput.placeholder = 'Account name'
    labelInput.value = ed.label
    fields.appendChild(labelInput)
    root.appendChild(fields)
    root.appendChild(el('div', 'wv-hint', 'Fill in as many boxes as your wallet uses, then click Done. Pasting a whole phrase into box 1 fills the boxes in order.'))
    root.appendChild(wordGridInputs(ed))
    const actions = el('div', 'wv-actions')
    actions.appendChild(button('Cancel', 'secondary', () => closeEditor()))
    actions.appendChild(button('Done', '', () => finishWords()))
    root.appendChild(actions)
  } else {
    root.appendChild(el('div', 'wv-hint', ed.mode === 'edit' ? 'Notes for this account. Leave blank if you do not need them.' : 'Words saved. Add an optional note, like a wallet password, or click Cancel to skip.'))
    const header = el('input', 'wv-notes-header')
    header.type = 'text'
    header.placeholder = 'Header (for example: Password)'
    header.value = ed.notesHeader
    const notes = el('textarea', 'wv-notes-body')
    notes.placeholder = 'Anything you want to keep with this account'
    notes.value = ed.notes
    notes.rows = 4
    header.oninput = armHideTimer
    notes.oninput = armHideTimer
    root.appendChild(header)
    root.appendChild(notes)
    const actions = el('div', 'wv-actions')
    actions.appendChild(button('Cancel', 'secondary', () => closeEditor()))
    actions.appendChild(button('Done', '', () => finishNotes()))
    root.appendChild(actions)
  }
  container.appendChild(root)
}

async function finishWords() {
  const ed = state.editor
  closeSuggest()
  const inputs = Array.from(wordInputs())
  for (const input of inputs) {
    if (!input.value.trim()) continue
    const ok = await checkWordInput(input)
    if (!ok) {
      input.focus()
      return
    }
  }
  captureEditor()
  const raw = ed.words.map((w) => w.trim().toLowerCase())
  let last = raw.length - 1
  while (last >= 0 && !raw[last]) last--
  const words = raw.slice(0, last + 1)
  if (words.length === 0) {
    showMsg('Enter at least one word', 'error')
    return
  }
  const gap = words.findIndex((w) => !w)
  if (gap !== -1) {
    showMsg('Box ' + (gap + 1) + ' is empty. Fill it in or remove the words after it.', 'error')
    focusWord(gap)
    return
  }
  if (ed.mode === 'new-wallet' && !ed.wallet.trim()) {
    showMsg('Enter a wallet name', 'error')
    return
  }
  const allKnown = words.every((w) => wallets.isBip39Word(w))
  if (allKnown) {
    const check = await wallets.checkPhrase(words)
    if (!check.valid) {
      const text = check.reason === 'length'
        ? words.length + ' words is not a standard seed phrase length (12, 15, 18, 21 or 24). Continue saves it anyway. Cancel goes back to editing.'
        : 'These words do not pass the seed phrase check, so a word may be wrong or out of order. Continue saves it anyway. Cancel goes back to editing.'
      const go = await dialog({ title: 'Please double check', text, okLabel: 'Continue', cancelLabel: 'Cancel' })
      if (!go) return
    }
  }
  try {
    if (ed.mode === 'edit') {
      await wallets.updateAccount(ed.accountId, { label: ed.label, words }, key())
    } else {
      const saved = await wallets.addAccount({ wallet: ed.wallet, label: ed.label, words }, key())
      ed.accountId = saved.id
      ed.wallet = saved.wallet
      ed.originalLabel = saved.label
    }
  } catch (e) {
    showMsg(e && e.message ? e.message : 'Could not save', 'error')
    return
  }
  ed.stage = 'notes'
  ed.words = []
  ed.accepted = []
  state.list = await wallets.listWallets(key())
  render()
  const header = state.els.content.querySelector('.wv-notes-header')
  if (header) header.focus()
  armHideTimer()
}

async function finishNotes() {
  const ed = state.editor
  captureEditor()
  try {
    await wallets.updateAccount(ed.accountId, { notesHeader: ed.notesHeader, notes: ed.notes }, key())
  } catch (e) {
    showMsg(e && e.message ? e.message : 'Could not save notes', 'error')
    return
  }
  showMsg('Saved', 'success')
  state.editor = null
  await reload()
  armHideTimer()
}

function clearDropMarks() {
  for (const node of state.els.content.querySelectorAll('.drop-before, .drop-after')) node.classList.remove('drop-before', 'drop-after')
}

function dropAfter(node, e) {
  const rect = node.getBoundingClientRect()
  return e.clientY > rect.top + rect.height / 2
}

function wireDrag(node, grip, kind, id, index, list, scope) {
  grip.onmousedown = () => { node.draggable = true }
  grip.onmouseup = () => { node.draggable = false }
  grip.onclick = (e) => e.stopPropagation()
  node.ondragstart = (e) => {
    e.stopPropagation()
    state.drag = { kind, id, scope }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', kind)
    node.classList.add('dragging')
  }
  node.ondragend = (e) => {
    e.stopPropagation()
    node.draggable = false
    node.classList.remove('dragging')
    state.drag = null
    clearDropMarks()
  }
  node.ondragover = (e) => {
    const drag = state.drag
    if (!drag || drag.kind !== kind || drag.scope !== scope) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    clearDropMarks()
    if (drag.id === id) return
    node.classList.add(dropAfter(node, e) ? 'drop-after' : 'drop-before')
  }
  node.ondrop = async (e) => {
    const drag = state.drag
    if (!drag || drag.kind !== kind || drag.scope !== scope) return
    e.preventDefault()
    e.stopPropagation()
    clearDropMarks()
    if (drag.id === id) return
    const from = list.indexOf(drag.id)
    let target = dropAfter(node, e) ? index + 1 : index
    if (from !== -1 && from < target) target -= 1
    if (target === from) return
    try {
      if (kind === 'wallet') await wallets.moveWallet(drag.id, target, key())
      else await wallets.moveAccount(drag.id, target, key())
    } catch (err) {}
    await reload()
  }
}

function renderRevealed(container, acct) {
  const view = el('div', 'wv-reveal')
  const grid = el('div', 'wv-grid')
  acct.words.forEach((word, i) => {
    const cell = el('div', 'wv-cell')
    cell.appendChild(el('span', 'wv-num', String(i + 1)))
    cell.appendChild(el('span', 'wv-word', word))
    grid.appendChild(cell)
  })
  view.appendChild(grid)
  if (acct.notesHeader || acct.notes) {
    const notes = el('div', 'wv-notes-view')
    if (acct.notesHeader) notes.appendChild(el('div', 'wv-notes-view-header', acct.notesHeader))
    if (acct.notes) notes.appendChild(el('div', 'wv-notes-view-body', acct.notes))
    view.appendChild(notes)
  }
  container.appendChild(view)
}

function renderAccount(container, wallet, acct, index) {
  const row = el('div', 'wv-account')
  const ed = state.editor
  if (ed && ed.mode === 'edit' && ed.accountId === acct.id) {
    renderEditor(row)
    container.appendChild(row)
    return
  }
  if (ed && ed.mode !== 'edit' && ed.stage === 'notes' && ed.accountId === acct.id) {
    renderEditor(row)
    container.appendChild(row)
    return
  }
  const head = el('div', 'wv-account-head')
  const grip = el('div', 'wv-grip', '⋮⋮')
  grip.title = 'Drag to reorder'
  head.appendChild(grip)
  const ids = wallet.accounts.map((a) => a.id)
  wireDrag(row, grip, 'account', acct.id, index, ids, wallet.name)
  const info = el('div', 'wv-account-info')
  info.appendChild(el('div', 'wv-account-label', acct.label))
  info.appendChild(el('div', 'wv-account-meta', acct.words.length + (acct.words.length === 1 ? ' word' : ' words') + (acct.notesHeader || acct.notes ? ', has notes' : '')))
  head.appendChild(info)
  if (state.confirmingDelete === 'a:' + acct.id) {
    head.appendChild(el('span', 'wv-confirm-text', 'Delete ' + acct.label + '?'))
    head.appendChild(button('Delete', 'danger small', async () => {
      state.confirmingDelete = null
      state.revealed.delete(acct.id)
      await wallets.deleteAccount(acct.id, key())
      await reload()
    }))
    head.appendChild(button('Keep', 'secondary small', () => { state.confirmingDelete = null; render() }))
  } else {
    const shown = state.revealed.has(acct.id)
    head.appendChild(button(shown ? 'Hide' : 'Show', 'secondary small', () => {
      if (shown) state.revealed.delete(acct.id)
      else state.revealed.add(acct.id)
      render()
      armHideTimer()
    }))
    head.appendChild(button('Edit', 'secondary small', async () => {
      const go = await dialog({ title: 'Edit seed words', text: EDIT_WARNING, okLabel: 'Continue', cancelLabel: 'Cancel' })
      if (!go) return
      state.revealed.delete(acct.id)
      openEditor({ mode: 'edit', accountId: acct.id, wallet: wallet.name, originalLabel: acct.label, label: acct.label, words: acct.words.slice(), accepted: acct.words.map((w) => (wallets.isBip39Word(w) ? '' : w)), notesHeader: acct.notesHeader, notes: acct.notes })
    }))
    head.appendChild(button('Notes', 'secondary small', () => {
      state.revealed.delete(acct.id)
      openEditor({ mode: 'edit', stage: 'notes', accountId: acct.id, wallet: wallet.name, originalLabel: acct.label, label: acct.label, notesHeader: acct.notesHeader, notes: acct.notes })
    }))
    head.appendChild(button('Rename', 'secondary small', async () => {
      const value = await dialog({ title: 'Rename account', input: acct.label, okLabel: 'Save' })
      if (value === null || value.trim() === acct.label) return
      try {
        await wallets.updateAccount(acct.id, { label: value }, key())
        await reload()
      } catch (e) {
        showMsg(e.message, 'error')
      }
    }))
    head.appendChild(button('Delete', 'danger small', () => { state.confirmingDelete = 'a:' + acct.id; render() }))
  }
  row.appendChild(head)
  if (state.revealed.has(acct.id)) renderRevealed(row, acct)
  container.appendChild(row)
}

function renderWallet(container, wallet, index, names) {
  const card = el('div', 'wv-wallet')
  const head = el('div', 'wv-wallet-head')
  const grip = el('div', 'wv-grip', '⋮⋮')
  grip.title = 'Drag to reorder'
  head.appendChild(grip)
  wireDrag(card, grip, 'wallet', wallet.name, index, names, 'wallets')
  const info = el('div', 'wv-wallet-info')
  info.appendChild(el('div', 'wv-wallet-name', wallet.name))
  info.appendChild(el('div', 'wv-account-meta', wallet.accounts.length + (wallet.accounts.length === 1 ? ' account' : ' accounts')))
  head.appendChild(info)
  if (state.confirmingDelete === 'w:' + wallet.name) {
    head.appendChild(el('span', 'wv-confirm-text', 'Delete ' + wallet.name + ' and all its accounts?'))
    head.appendChild(button('Delete', 'danger small', async () => {
      state.confirmingDelete = null
      for (const acct of wallet.accounts) state.revealed.delete(acct.id)
      await wallets.deleteWallet(wallet.name, key())
      await reload()
    }))
    head.appendChild(button('Keep', 'secondary small', () => { state.confirmingDelete = null; render() }))
  } else {
    head.appendChild(button('Add Account', 'small', async () => {
      const label = await wallets.defaultLabelFor(wallet.name, key())
      openEditor({ mode: 'new-account', wallet: wallet.name, label })
    }))
    head.appendChild(button('Rename', 'secondary small', async () => {
      const value = await dialog({ title: 'Rename wallet', input: wallet.name, okLabel: 'Save' })
      if (value === null || value.trim() === wallet.name) return
      try {
        await wallets.renameWallet(wallet.name, value, key())
        await reload()
      } catch (e) {
        showMsg(e.message, 'error')
      }
    }))
    head.appendChild(button('Delete', 'danger small', () => { state.confirmingDelete = 'w:' + wallet.name; render() }))
  }
  card.appendChild(head)
  const accountsBox = el('div', 'wv-accounts')
  wallet.accounts.forEach((acct, i) => renderAccount(accountsBox, wallet, acct, i))
  const ed = state.editor
  if (ed && ed.mode === 'new-account' && ed.wallet === wallet.name && ed.stage === 'words') renderEditor(accountsBox)
  card.appendChild(accountsBox)
  container.appendChild(card)
}

function renderGate() {
  const gate = el('div', 'wv-gate')
  gate.appendChild(button('🔐 Unlock to view Crypto Wallets', '', async () => {
    const ok = await state.deps.authenticate()
    if (!ok) {
      showMsg('Authentication required', 'error')
      return
    }
    state.unlocked = true
    await reload()
    armHideTimer()
  }))
  state.els.content.appendChild(gate)
}

function render() {
  closeSuggest()
  const content = state.els.content
  content.textContent = ''
  state.els.toolbar.classList.toggle('hidden', !state.unlocked)
  if (!state.unlocked) {
    renderGate()
    return
  }
  const ed = state.editor
  if (ed && ed.mode === 'new-wallet' && ed.stage === 'words') renderEditor(content)
  const orphanNotes = ed && ed.stage === 'notes' && ed.mode !== 'edit' && !state.list.some((w) => w.accounts.some((a) => a.id === ed.accountId))
  if (orphanNotes) renderEditor(content)
  if (state.list.length === 0 && !ed) {
    content.appendChild(el('div', 'wv-empty', 'No wallets yet. Click Add Wallet to save your first seed phrase.'))
    return
  }
  const names = state.list.map((w) => w.name)
  state.list.forEach((wallet, i) => renderWallet(content, wallet, i, names))
}

function onTabHidden() {
  closeSection()
}

async function onTabShown() {
  await loadHideSeconds()
  if (!key()) {
    lock()
    return
  }
  if (state.unlocked) await reload()
  else render()
}

function init(deps) {
  state.deps = deps
  state.els = {
    content: document.getElementById('wallets-content'),
    toolbar: document.getElementById('wallets-toolbar'),
    msg: document.getElementById('msg-wallets')
  }
  document.getElementById('btn-add-wallet').onclick = () => openEditor({ mode: 'new-wallet', label: 'Account 1' })
  document.getElementById('btn-sort-wallets').onclick = async () => {
    await wallets.sortWalletsAZ(key())
    await reload()
  }
  window.addEventListener('blur', () => hideAll())
  document.addEventListener('visibilitychange', () => { if (document.hidden) closeSection() })
  state.els.content.addEventListener('click', armHideTimer, true)
  state.els.content.addEventListener('keydown', armHideTimer, true)
  window.addEventListener('scroll', () => closeSuggest(), true)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.masterKeyBytes && !changes.masterKeyBytes.newValue) lock()
    if (area === 'local' && changes.autoLockTimeout && changes.autoLockTimeout.newValue) state.hideSeconds = changes.autoLockTimeout.newValue
  })
  loadHideSeconds()
  render()
}

export { init, lock, onTabHidden, onTabShown }
