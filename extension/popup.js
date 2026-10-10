import * as auth from './auth.js'
import * as session from './session.js'
import * as bookmarks from './bookmarks.js'
import { masterKeyToCryptoKey } from './crypto.js'
import * as uniVault from './linkedvault.js'

const MASTER_KEY_LENGTH = 32
const SIDE_WINDOW_WIDTH = 380
const SIDE_WINDOW_HEIGHT = 720
const WEBSITE_URL = 'https://hiimrook.github.io/valid-vault-password-manager/'

const viewSetup = document.getElementById('view-setup')
const viewLocked = document.getElementById('view-locked')
const viewUnlocked = document.getElementById('view-unlocked')
const viewSoftlock = document.getElementById('view-softlock')

const setupStateFp = document.getElementById('setup-state-fp')
const btnSetupFp = document.getElementById('btn-setup-fp')
const btnSetupPw = document.getElementById('btn-setup-pw')
const setupPassword = document.getElementById('setup-password')
const btnSetupDone = document.getElementById('btn-setup-done')
const msgSetup = document.getElementById('msg-setup')

const statusFp = document.getElementById('status-fp')
const statusPw = document.getElementById('status-pw')

const btnFingerprint = document.getElementById('btn-fingerprint')
const btnPassword = document.getElementById('btn-password')
const inputPassword = document.getElementById('input-password')
const msgLocked = document.getElementById('msg-locked')

const inputSoftpin = document.getElementById('input-softpin')
const btnSoftpin = document.getElementById('btn-softpin')
const btnSoftFingerprint = document.getElementById('btn-soft-fingerprint')
const setupFpNote = document.getElementById('setup-fp-note')
const inputSoftpassword = document.getElementById('input-softpassword')
const btnSoftPassword = document.getElementById('btn-soft-password')
const msgSoftlock = document.getElementById('msg-softlock')

const btnLock = document.getElementById('btn-lock')
const btnExpand = document.getElementById('btn-expand')
const menuDropdown = document.getElementById('menu-dropdown')
const menuBookmarks = document.getElementById('menu-bookmarks')
const menuGuide = document.getElementById('menu-guide')
const menuSettings = document.getElementById('menu-settings')
const menuWebsite = document.getElementById('menu-website')
const msgUnlocked = document.getElementById('msg-unlocked')

const btnBookmark = document.getElementById('btn-bookmark')
const unlockedInfo = document.getElementById('unlocked-info')
const bookmarkAdd = document.getElementById('bookmark-add')
const bookmarkName = document.getElementById('bookmark-name')
const bookmarkAddUrl = document.getElementById('bookmark-add-url')
const btnBookmarkSave = document.getElementById('btn-bookmark-save')
const btnBookmarkAddCancel = document.getElementById('btn-bookmark-add-cancel')
const bookmarkRemove = document.getElementById('bookmark-remove')
const bookmarkRemoveName = document.getElementById('bookmark-remove-name')
const btnBookmarkRemove = document.getElementById('btn-bookmark-remove')
const btnBookmarkRemoveCancel = document.getElementById('btn-bookmark-remove-cancel')

const setupState = { hasFp: false, hasPin: false, hasPw: false }
const pageState = { tabUrl: '', tabTitle: '', windowId: null, bookmark: null, busy: false }
let masterKey = null

async function persistKey() {
  try {
    const mk = session.getMasterKey()
    if (!mk) return
    const bytes = new Uint8Array(await crypto.subtle.exportKey('raw', mk))
    await chrome.runtime.sendMessage({ action: 'persistSessionKey', masterKeyBytes: Array.from(bytes) })
  } catch (e) {}
}

async function restoreSessionKey() {
  try {
    const stored = await chrome.storage.session.get('masterKeyBytes')
    if (stored && stored.masterKeyBytes && stored.masterKeyBytes.length === MASTER_KEY_LENGTH) {
      session.setMasterKey(await masterKeyToCryptoKey(new Uint8Array(stored.masterKeyBytes)))
      try { chrome.runtime.sendMessage({ action: 'activity' }) } catch (e) {}
      return true
    }
  } catch (e) {}
  return false
}

function showView(view) {
  viewSetup.classList.add('hidden')
  viewSoftlock.classList.add('hidden')
  viewLocked.classList.add('hidden')
  viewUnlocked.classList.add('hidden')
  view.classList.remove('hidden')
  if (view === viewUnlocked) checkUniVault()
}

const uniVaultReconnectBox = document.getElementById('univault-reconnect')
const btnUniVaultReconnect = document.getElementById('btn-univault-reconnect')

async function checkUniVault() {
  try {
    const mk = session.getMasterKey()
    if (!mk || !(await uniVault.getLink())) { uniVaultReconnectBox.classList.add('hidden'); return }
    const result = await uniVault.syncNow(mk)
    uniVaultReconnectBox.classList.toggle('hidden', result.state !== 'needs-permission')
  } catch (e) {}
}

btnUniVaultReconnect.onclick = async () => {
  const mk = session.getMasterKey()
  if (!mk) return
  const result = await uniVault.reconnect(mk)
  uniVaultReconnectBox.classList.toggle('hidden', result.state === 'ok')
}

function showMsg(el, msg, type) {
  el.textContent = msg
  el.className = 'msg' + (type ? ' ' + type : '')
  setTimeout(() => { el.textContent = '' }, 3000)
}

function setEnrollButton(btn, enrolled) {
  if (enrolled) {
    btn.textContent = 'Re-enroll'
    btn.classList.remove('enroll')
    btn.classList.add('reenroll')
  } else {
    btn.textContent = 'Enroll'
    btn.classList.remove('reenroll')
    btn.classList.add('enroll')
  }
}

function updateSetupStatus() {
  if (setupStateFp) setupStateFp.textContent = setupState.hasFp ? 'Enrolled' : ''
  setEnrollButton(btnSetupFp, setupState.hasFp)
  setEnrollButton(btnSetupPw, setupState.hasPw)
  const canFinish = setupState.hasFp || setupState.hasPw
  btnSetupDone.disabled = !canFinish
  btnSetupDone.style.opacity = canFinish ? '1' : '0.5'
}

async function updateStatus() {
  const status = await auth.initAuth()
  if (statusFp) statusFp.className = 'status' + (status.hasFingerprint ? ' active' : '')
  if (statusPw) statusPw.className = 'status' + (status.hasPassword ? ' active' : '')
  btnFingerprint.classList.toggle('hidden', !status.hasFingerprint)
  btnSoftFingerprint.classList.toggle('hidden', !status.hasFingerprint)
  return status
}

async function applySetupFpAvailability() {
  if (setupState.hasFp || await platformAuthAvailable()) {
    btnSetupFp.classList.remove('hidden')
    setupFpNote.classList.add('hidden')
    return
  }
  btnSetupFp.classList.add('hidden')
  setupFpNote.classList.remove('hidden')
}


async function loadActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab) return
    pageState.tabUrl = tab.url || ''
    pageState.tabTitle = tab.title || ''
    pageState.windowId = typeof tab.windowId === 'number' ? tab.windowId : null
  } catch (e) {}
}

function showBookmarkPanel(panel) {
  unlockedInfo.classList.add('hidden')
  bookmarkAdd.classList.add('hidden')
  bookmarkRemove.classList.add('hidden')
  panel.classList.remove('hidden')
}

function renderBookmarkIcon() {
  if (!session.hasMasterKey() || !bookmarks.isBookmarkable(pageState.tabUrl)) {
    btnBookmark.classList.add('hidden')
    return
  }
  btnBookmark.classList.remove('hidden')
  if (pageState.bookmark) {
    btnBookmark.classList.add('saved')
    btnBookmark.title = 'Bookmarked. Click to remove'
  } else {
    btnBookmark.classList.remove('saved')
    btnBookmark.title = 'Bookmark this page'
  }
}

async function refreshBookmarkState() {
  pageState.bookmark = null
  const mk = session.getMasterKey()
  if (mk && bookmarks.isBookmarkable(pageState.tabUrl)) {
    try { pageState.bookmark = await bookmarks.findByUrl(pageState.tabUrl, mk) } catch (e) { pageState.bookmark = null }
  }
  renderBookmarkIcon()
}

function notifyBookmarksChanged() {
  try { chrome.runtime.sendMessage({ action: 'bookmarksChanged' }).catch(() => {}) } catch (e) {}
}

async function enterUnlocked() {
  showView(viewUnlocked)
  showBookmarkPanel(unlockedInfo)
  await refreshBookmarkState()
}

async function init() {
  const tabLoad = loadActiveTab()
  const status = await updateStatus()
  setupState.hasFp = !!status.hasFingerprint
  setupState.hasPin = !!status.hasPIN
  setupState.hasPw = !!status.hasPassword
  await tabLoad

  if (session.hasMasterKey() || await restoreSessionKey()) {
    await enterUnlocked()
  } else if (await session.isSoftLocked()) {
    showView(viewSoftlock)
  } else if (status.hasFingerprint || status.hasPIN || status.hasPassword) {
    showView(viewLocked)
  } else {
    showView(viewSetup)
    updateSetupStatus()
    await applySetupFpAvailability()
  }
}

async function completeUnlock(key) {
  session.setMasterKey(key)
  await persistKey()
  await updateStatus()
  await enterUnlocked()
}

async function platformAuthAvailable() {
  try {
    return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch (e) {
    return false
  }
}

function showFpFallback() {
  msgSetup.textContent = ''
  msgSetup.className = 'msg'
  const title = document.createElement('div')
  title.textContent = 'Fingerprint / PIN not available on this device.'
  title.style.color = 'var(--green)'
  title.style.fontWeight = 'bold'
  title.style.fontSize = '12px'
  title.style.marginBottom = '4px'
  const body = document.createElement('div')
  body.textContent = 'Use a master password instead: type one above and click Enroll. Valid Vault works fully with a password.'
  msgSetup.appendChild(title)
  msgSetup.appendChild(body)
  setupPassword.focus()
}

btnSetupFp.onclick = async () => {
  if (!(await platformAuthAvailable())) { showFpFallback(); return }
  auth.startFingerprintEnrollment()
  const result = await auth.enrollFingerprint(masterKey)
  if (result.success) {
    masterKey = result.masterKey
    session.setMasterKey(masterKey)
    await persistKey()
    setupState.hasFp = true
    updateSetupStatus()
    showMsg(msgSetup, 'Fingerprint enrolled', 'success')
  } else if (result.error && /cannot bind keys/.test(result.error)) {
    showFpFallback()
  } else {
    showMsg(msgSetup, 'Fingerprint / PIN did not complete. Try again, or enroll a master password instead.', 'error')
  }
}

btnSetupPw.onclick = async () => {
  const pw = setupPassword.value
  if (pw.length < 12) {
    showMsg(msgSetup, 'Password must be at least 12 characters', 'error')
    return
  }
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^a-zA-Z0-9]/.test(pw)) {
    showMsg(msgSetup, 'Password needs a letter, a number, and a symbol', 'error')
    return
  }
  auth.startPasswordCreation()
  const result = await auth.setPassword(pw, masterKey)
  if (result.success) {
    masterKey = result.masterKey
    session.setMasterKey(masterKey)
    await persistKey()
    setupState.hasPw = true
    setupPassword.value = ''
    updateSetupStatus()
    showMsg(msgSetup, 'Password enrolled', 'success')
  } else {
    showMsg(msgSetup, result.error, 'error')
  }
}

btnSetupDone.onclick = async () => {
  if (!(setupState.hasFp || setupState.hasPw)) {
    showMsg(msgSetup, 'Enroll fingerprint or password first', 'error')
    return
  }
  await updateStatus()
  if (session.hasMasterKey()) {
    await enterUnlocked()
  } else {
    showView(viewLocked)
  }
}

btnFingerprint.onclick = async () => {
  const result = await auth.authenticateFingerprint()
  if (result.success) {
    await completeUnlock(result.masterKey)
  } else {
    showMsg(msgLocked, result.error, 'error')
  }
}

btnPassword.onclick = async () => {
  const result = await auth.authenticatePassword(inputPassword.value)
  if (result.success) {
    inputPassword.value = ''
    await completeUnlock(result.masterKey)
  } else {
    showMsg(msgLocked, result.error, 'error')
  }
}

btnSoftpin.onclick = async () => {
  const result = await auth.authenticatePIN(inputSoftpin.value)
  if (result.success) {
    inputSoftpin.value = ''
    await completeUnlock(result.masterKey)
  } else {
    showMsg(msgSoftlock, result.error || 'Incorrect PIN', 'error')
  }
}

btnSoftFingerprint.onclick = async () => {
  const result = await auth.authenticateFingerprint()
  if (result.success) {
    await completeUnlock(result.masterKey)
  } else {
    showMsg(msgSoftlock, result.error, 'error')
  }
}

btnSoftPassword.onclick = async () => {
  const result = await auth.authenticatePassword(inputSoftpassword.value)
  if (result.success) {
    inputSoftpassword.value = ''
    await completeUnlock(result.masterKey)
  } else {
    showMsg(msgSoftlock, result.error, 'error')
  }
}

btnLock.onclick = async () => {
  await session.lockAll()
  try { await chrome.storage.session.remove(['masterKeyBytes', 'softLocked']) } catch (e) {}
  pageState.bookmark = null
  renderBookmarkIcon()
  menuDropdown.classList.add('hidden')
  await updateStatus()
  showView(viewLocked)
}

btnBookmark.onclick = () => {
  if (pageState.busy) return
  if (pageState.bookmark) {
    bookmarkRemoveName.textContent = pageState.bookmark.title
    showBookmarkPanel(bookmarkRemove)
    return
  }
  bookmarkName.value = pageState.tabTitle || ''
  bookmarkAddUrl.textContent = bookmarks.normalizeUrl(pageState.tabUrl)
  showBookmarkPanel(bookmarkAdd)
  bookmarkName.focus()
  bookmarkName.select()
}

btnBookmarkAddCancel.onclick = () => showBookmarkPanel(unlockedInfo)
btnBookmarkRemoveCancel.onclick = () => showBookmarkPanel(unlockedInfo)

btnBookmarkSave.onclick = async () => {
  const mk = session.getMasterKey()
  if (!mk || pageState.busy) return
  pageState.busy = true
  try {
    const item = await bookmarks.saveBookmark(pageState.tabUrl, bookmarkName.value, mk)
    pageState.bookmark = item
    renderBookmarkIcon()
    showBookmarkPanel(unlockedInfo)
    showMsg(msgUnlocked, 'Bookmarked: ' + item.title, 'success')
    notifyBookmarksChanged()
  } catch (e) {
    showMsg(msgUnlocked, 'Could not save bookmark', 'error')
  }
  pageState.busy = false
}

btnBookmarkRemove.onclick = async () => {
  const mk = session.getMasterKey()
  if (!mk || !pageState.bookmark || pageState.busy) return
  pageState.busy = true
  const title = pageState.bookmark.title
  try {
    await bookmarks.removeBookmark(pageState.bookmark.id, mk)
    pageState.bookmark = null
    renderBookmarkIcon()
    showBookmarkPanel(unlockedInfo)
    showMsg(msgUnlocked, 'Removed: ' + title, 'success')
    notifyBookmarksChanged()
  } catch (e) {
    showMsg(msgUnlocked, 'Could not remove bookmark', 'error')
  }
  pageState.busy = false
}

bookmarkName.onkeydown = (e) => { if (e.key === 'Enter') btnBookmarkSave.click() }

btnExpand.onclick = (e) => {
  e.stopPropagation()
  menuDropdown.classList.toggle('hidden')
}

function openBookmarksWindow() {
  chrome.windows.create({ url: 'bookmarks.html', type: 'popup', width: SIDE_WINDOW_WIDTH, height: SIDE_WINDOW_HEIGHT })
    .catch(() => {})
    .finally(() => window.close())
}

menuBookmarks.onclick = () => {
  if (chrome.sidePanel && chrome.sidePanel.open && pageState.windowId !== null) {
    chrome.sidePanel.open({ windowId: pageState.windowId })
      .then(() => window.close())
      .catch(() => openBookmarksWindow())
    return
  }
  openBookmarksWindow()
}

menuGuide.onclick = () => {
  chrome.tabs.create({ url: 'guide.html' })
}

menuSettings.onclick = () => {
  chrome.tabs.create({ url: 'manage.html' })
}

menuWebsite.onclick = () => {
  chrome.tabs.create({ url: WEBSITE_URL })
}

document.addEventListener('click', (e) => {
  if (!menuDropdown.classList.contains('hidden') && !e.target.closest('.menu-wrap')) {
    menuDropdown.classList.add('hidden')
  }
})

inputPassword.onkeydown = (e) => { if (e.key === 'Enter') btnPassword.click() }
inputSoftpin.onkeydown = (e) => { if (e.key === 'Enter') btnSoftpin.click() }
inputSoftpassword.onkeydown = (e) => { if (e.key === 'Enter') btnSoftPassword.click() }
setupPassword.onkeydown = (e) => { if (e.key === 'Enter') btnSetupPw.click() }

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes.masterKeyBytes) return
  if (!changes.masterKeyBytes.newValue && session.hasMasterKey()) {
    session.lockAll().then(() => {
      pageState.bookmark = null
      renderBookmarkIcon()
      showView(viewLocked)
    })
  }
})

init()
