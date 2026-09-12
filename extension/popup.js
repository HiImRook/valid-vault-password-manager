import * as auth from './auth.js'
import * as passwords from './passwords.js'
import * as session from './session.js'
import * as store from './store.js'

const viewSetup = document.getElementById('view-setup')
const viewLocked = document.getElementById('view-locked')
const viewUnlocked = document.getElementById('view-unlocked')
const viewAdd = document.getElementById('view-add')

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

const viewSoftlock = document.getElementById('view-softlock')
const inputSoftpin = document.getElementById('input-softpin')
const btnSoftpin = document.getElementById('btn-softpin')
const btnSoftFingerprint = document.getElementById('btn-soft-fingerprint')
const inputSoftpassword = document.getElementById('input-softpassword')
const btnSoftPassword = document.getElementById('btn-soft-password')
const msgSoftlock = document.getElementById('msg-softlock')

const btnLock = document.getElementById('btn-lock')
const btnExpand = document.getElementById('btn-expand')
const btnAdd = document.getElementById('btn-add')
const btnSave = document.getElementById('btn-save')
const btnCancel = document.getElementById('btn-cancel')
const currentDomain = document.getElementById('current-domain')
const credentialsList = document.getElementById('credentials-list')
const addDomain = document.getElementById('add-domain')
const addUsername = document.getElementById('add-username')
const addPassword = document.getElementById('add-password')
const msgUnlocked = document.getElementById('msg-unlocked')
const msgAdd = document.getElementById('msg-add')

let activeDomain = ''
let setupState = { hasFp: false, hasPin: false, hasPw: false }
let masterKey = null

async function persistKey() {
  try {
    const mk = session.getMasterKey()
    if (!mk) return
    const bytes = new Uint8Array(await crypto.subtle.exportKey('raw', mk))
    await chrome.storage.session.set({ masterKeyBytes: Array.from(bytes), lastActivity: Date.now() })
  } catch (e) {}
}

function showView(view) {
  viewSetup.classList.add('hidden')
  if (viewSoftlock) viewSoftlock.classList.add('hidden')
  viewLocked.classList.add('hidden')
  viewUnlocked.classList.add('hidden')
  viewAdd.classList.add('hidden')
  view.classList.remove('hidden')
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
  // Finish is available once at least one HARD unlock (fingerprint or password) exists.
  const canFinish = setupState.hasFp || setupState.hasPw
  btnSetupDone.disabled = !canFinish
  btnSetupDone.style.opacity = canFinish ? '1' : '0.5'
}

async function updateStatus() {
  const status = await auth.initAuth()
  if (statusFp) statusFp.className = 'status' + (status.hasFingerprint ? ' active' : '')
  if (statusPw) statusPw.className = 'status' + (status.hasPassword ? ' active' : '')
  return status
}

async function init() {
  const status = await updateStatus()

  // seed setup state from real enrollment so Enroll/Re-enroll shows correctly
  setupState.hasFp = !!status.hasFingerprint
  setupState.hasPin = !!status.hasPIN
  setupState.hasPw = !!status.hasPassword

  if (session.hasMasterKey()) {
    showView(viewUnlocked)
    await loadCurrentSite()
  } else if (await session.isSoftLocked()) {
    // idle soft-lock: PIN can resume, fingerprint/password also work
    showView(viewSoftlock)
  } else if (status.hasFingerprint || status.hasPIN || status.hasPassword) {
    showView(viewLocked)
  } else {
    showView(viewSetup)
    updateSetupStatus()
  }
}

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tabs[0] && tabs[0].url) {
    try {
      const url = new URL(tabs[0].url)
      return url.hostname
    } catch (e) {
      return ''
    }
  }
  return ''
}

async function loadCurrentSite() {
  activeDomain = await getCurrentTab()
  currentDomain.textContent = activeDomain || 'No site detected'
  
  if (!activeDomain) {
    credentialsList.innerHTML = ''
    return
  }
  
  const mk = session.getMasterKey()
  const result = await passwords.getCredentials(activeDomain, mk)
  
  if (result.success && result.credentials.length > 0) {
    credentialsList.innerHTML = ''
    for (const cred of result.credentials) {
      const item = document.createElement('div')
      item.className = 'credential-item'
      item.innerHTML = 
        '<div class="credential-domain">' + escapeHtml(cred.username) + '</div>' +
        '<div class="credential-user">••••••••</div>' +
        '<div class="credential-actions">' +
        '<button class="small secondary btn-show">👁️ Show</button>' +
        '</div>'
      item.dataset.password = cred.password
      
      item.querySelector('.btn-show').onclick = (e) => {
        const userEl = item.querySelector('.credential-user')
        if (e.target.textContent.includes('Show')) {
          userEl.textContent = cred.password
          e.target.textContent = '👁️ Hide'
        } else {
          userEl.textContent = '••••••••'
          e.target.textContent = '👁️ Show'
        }
      }
      
      credentialsList.appendChild(item)
    }
  } else {
    credentialsList.innerHTML = '<div class="msg">No credentials for this site</div>'
  }
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

btnSetupFp.onclick = async () => {
  auth.startFingerprintEnrollment()
  const result = await auth.enrollFingerprint(masterKey)
  if (result.success) {
    masterKey = result.masterKey
    session.setMasterKey(masterKey)
    await persistKey()
    setupState.hasFp = true
    updateSetupStatus()
    showMsg(msgSetup, 'Fingerprint enrolled', 'success')
  } else {
    showMsg(msgSetup, result.error, 'error')
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
    showView(viewUnlocked)
    await loadCurrentSite()
  } else {
    showView(viewLocked)
  }
}

btnFingerprint.onclick = async () => {
  const result = await auth.authenticateFingerprint()
  if (result.success) {
    session.setMasterKey(result.masterKey)
    await persistKey()
    await updateStatus()
    showView(viewUnlocked)
    await loadCurrentSite()
  } else {
    showMsg(msgLocked, result.error, 'error')
  }
}

btnPassword.onclick = async () => {
  const pw = inputPassword.value
  const result = await auth.authenticatePassword(pw)
  if (result.success) {
    session.setMasterKey(result.masterKey)
    await persistKey()
    inputPassword.value = ''
    await updateStatus()
    showView(viewUnlocked)
    await loadCurrentSite()
  } else {
    showMsg(msgLocked, result.error, 'error')
  }
}

// ---- Soft-lock (idle) resume handlers ----
btnSoftpin.onclick = async () => {
  const pin = inputSoftpin.value
  const result = await auth.authenticatePIN(pin)
  if (result.success) {
    session.setMasterKey(result.masterKey)
    inputSoftpin.value = ''
    await persistKey()
    await updateStatus()
    showView(viewUnlocked)
    await loadCurrentSite()
  } else {
    showMsg(msgSoftlock, result.error || 'Incorrect PIN', 'error')
  }
}

btnSoftFingerprint.onclick = async () => {
  const result = await auth.authenticateFingerprint()
  if (result.success) {
    session.setMasterKey(result.masterKey)
    await persistKey()
    await updateStatus()
    showView(viewUnlocked)
    await loadCurrentSite()
  } else {
    showMsg(msgSoftlock, result.error, 'error')
  }
}

btnSoftPassword.onclick = async () => {
  const pw = inputSoftpassword.value
  const result = await auth.authenticatePassword(pw)
  if (result.success) {
    session.setMasterKey(result.masterKey)
    await persistKey()
    inputSoftpassword.value = ''
    await updateStatus()
    showView(viewUnlocked)
    await loadCurrentSite()
  } else {
    showMsg(msgSoftlock, result.error, 'error')
  }
}

btnLock.onclick = async () => {
  // Lock icon soft-locks: PIN can resume, fingerprint/password also work.
  // Only soft-lock if a PIN exists to resume with; otherwise hard-lock.
  const status = await auth.initAuth()
  if (status.hasPIN) {
    await session.softLock()
    try { chrome.storage.session.remove('masterKeyBytes') } catch (e) {}
    credentialsList.innerHTML = ''
    showView(viewSoftlock)
  } else {
    await session.lockAll()
    try { chrome.storage.session.remove('masterKeyBytes') } catch (e) {}
    credentialsList.innerHTML = ''
    showView(viewLocked)
  }
}

const menuDropdown = document.getElementById('menu-dropdown')
const menuSettings = document.getElementById('menu-settings')

btnExpand.onclick = (e) => {
  e.stopPropagation()
  menuDropdown.classList.toggle('hidden')
}

menuSettings.onclick = () => {
  chrome.tabs.create({ url: 'manage.html' })
}

const menuWebsite = document.getElementById('menu-website')
menuWebsite.onclick = () => {
  chrome.tabs.create({ url: 'https://hiimrook.github.io/valid-vault-password-manager/' })
}

document.addEventListener('click', (e) => {
  if (!menuDropdown.classList.contains('hidden') && !e.target.closest('.menu-wrap')) {
    menuDropdown.classList.add('hidden')
  }
})

if (btnAdd) btnAdd.onclick = async () => {
  addDomain.value = activeDomain
  addUsername.value = ''
  addPassword.value = ''
  showView(viewAdd)
}

if (btnCancel) btnCancel.onclick = () => {
  showView(viewUnlocked)
}

if (btnSave) btnSave.onclick = async () => {
  const domain = addDomain.value
  const username = addUsername.value
  const password = addPassword.value
  const mk = session.getMasterKey()
  
  if (!domain || !username || !password) {
    showMsg(msgAdd, 'All fields required', 'error')
    return
  }
  
  const result = await passwords.saveCredential(domain, username, password, mk)
  if (result.success) {
    showView(viewUnlocked)
    await loadCurrentSite()
    showMsg(msgUnlocked, 'Saved', 'success')
  } else {
    showMsg(msgAdd, result.error, 'error')
  }
}

inputPassword.onkeydown = (e) => { if (e.key === 'Enter') btnPassword.click() }
inputSoftpin.onkeydown = (e) => { if (e.key === 'Enter') btnSoftpin.click() }
inputSoftpassword.onkeydown = (e) => { if (e.key === 'Enter') btnSoftPassword.click() }
setupPassword.onkeydown = (e) => { if (e.key === 'Enter') btnSetupPw.click() }

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCredentialsForDomain') {
    const masterKey = session.getMasterKey()
    if (!masterKey) {
      sendResponse({ success: false, credentials: [] })
      return
    }
    
    passwords.getCredentials(request.domain, masterKey).then(result => {
      sendResponse(result)
    })
    return true
  }
  
  if (request.action === 'openManage') {
    chrome.tabs.create({ url: 'manage.html' })
    sendResponse({ success: true })
  }
})
init()