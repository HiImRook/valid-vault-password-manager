import * as auth from './auth.js'
import * as passwords from './passwords.js'
import * as session from './session.js'
import * as store from './store.js'
import * as pairing from './pairing.js'
import QRCode from './qrcode.js'
import { splitIntoFrames, createFrameCollector } from './frames.js'
import { createEncoder, createDecoder } from './fountain.js'
import { generateSalt, deriveKeyFromSecret, masterKeyToCryptoKey, wrapMasterKey, unwrapMasterKey } from './crypto.js'
import { getPasswordVault, setPasswordVault } from './store.js'

// ---- Restore master key from shared session storage (popup <-> manage page) ----
async function restoreMasterKeyFromSession() {
  try {
    const r = await chrome.storage.session.get('masterKeyBytes')
    if (r && r.masterKeyBytes && r.masterKeyBytes.length === 32) {
      const bytes = new Uint8Array(r.masterKeyBytes)
      const mk = await masterKeyToCryptoKey(bytes)
      session.setMasterKey(mk)
      return true
    }
  } catch (e) {}
  return false
}


// ---- Manage page inline unlock overlay ----
const lockOverlay = document.getElementById('manage-lock-overlay')
const btnManageUnlockFp = document.getElementById('btn-manage-unlock-fp')
const btnManageUnlockPw = document.getElementById('btn-manage-unlock-pw')
const inputManagePassword = document.getElementById('input-manage-password')
const msgManageLock = document.getElementById('msg-manage-lock')

function showLockOverlay() { if (lockOverlay) lockOverlay.classList.remove('hidden') }
function hideLockOverlay() { if (lockOverlay) lockOverlay.classList.add('hidden') }

async function unlockManagePage() {
  const mk = session.getMasterKey()
  if (mk) { hideLockOverlay(); return true }
  showLockOverlay()
  return false
}

if (btnManageUnlockFp) {
  btnManageUnlockFp.onclick = async () => {
    const result = await auth.authenticateFingerprint()
    if (result.success) {
      session.setMasterKey(result.masterKey)
      const bytes = new Uint8Array(await crypto.subtle.exportKey('raw', result.masterKey))
      await chrome.storage.session.set({ masterKeyBytes: Array.from(bytes) })
      hideLockOverlay()
      location.reload()
    } else if (msgManageLock) { showMsg(msgManageLock, result.error, 'error') }
  }
}

if (btnManageUnlockPw) {
  btnManageUnlockPw.onclick = async () => {
    const pw = inputManagePassword.value
    if (!pw) { if (msgManageLock) showMsg(msgManageLock, 'Enter password', 'error'); return }
    const result = await auth.authenticatePassword(pw)
    if (result.success) {
      session.setMasterKey(result.masterKey)
      const bytes = new Uint8Array(await crypto.subtle.exportKey('raw', result.masterKey))
      await chrome.storage.session.set({ masterKeyBytes: Array.from(bytes) })
      inputManagePassword.value = ''
      hideLockOverlay()
      location.reload()
    } else if (msgManageLock) { showMsg(msgManageLock, result.error, 'error') }
  }
}

if (inputManagePassword) {
  inputManagePassword.onkeydown = (e) => { if (e.key === 'Enter' && btnManageUnlockPw) btnManageUnlockPw.click() }
}

// ---- Activity tracking to reset the inactivity timeout ----
function attachActivityListeners() {
  // Attach to the whole page, not just .content, so the sidebar tabs
  // (a sibling of .content) also count as activity, not just the panel body.
  const bump = () => { session.resetActivity() }
  document.body.addEventListener('click', bump, true)
  document.body.addEventListener('input', bump, true)
  document.body.addEventListener('keydown', bump, true)
  // Desktop: mouse movement also counts (browser-throttled, negligible cost).
  document.body.addEventListener('mousemove', bump, true)
  // Phone/touch scope: tap/scroll stands in for mouse movement on touch devices.
  document.body.addEventListener('touchstart', bump, true)
  document.body.addEventListener('touchmove', bump, true)
}

// ---- Global lock monitor: catches a timeout no matter which tab is open ----
async function checkAndShowLockOverlay() {
  if (session.hasMasterKey()) { hideLockOverlay(); return }
  const restored = await restoreMasterKeyFromSession()
  if (restored) { hideLockOverlay() } else { showLockOverlay() }
}
setInterval(checkAndShowLockOverlay, 5000)

const tabs = document.querySelectorAll('.sidebar-tab')
const tabManage = document.getElementById('tab-manage')
const tabPersonal = document.getElementById('tab-personal')
const tabSettings = document.getElementById('tab-settings')
const tabAbout = document.getElementById('tab-about')

const cardFp = document.getElementById('card-fp')
const cardPw = document.getElementById('card-pw')
const statusFp = document.getElementById('status-fp')
const statusPw = document.getElementById('status-pw')

const btnEditFp = document.getElementById('btn-edit-fp')
const btnDelFp = document.getElementById('btn-del-fp')
const btnEditPw = document.getElementById('btn-edit-pw')
const btnDelPw = document.getElementById('btn-del-pw')

const credentialsList = document.getElementById('credentials-list')
const msgManage = document.getElementById('msg-manage')
const msgSettings = document.getElementById('msg-settings')

const inputAutolockTimeout = document.getElementById('input-autolock-timeout')
const inputQrTimeout = document.getElementById('input-qr-timeout')
const btnClearVault = document.getElementById('btn-clear-vault')

function showTab(tabName) {
  tabs.forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active')
  
  tabManage.classList.add('hidden')
  tabPersonal.classList.add('hidden')
  document.getElementById('tab-sync').classList.add('hidden')
  tabSettings.classList.add('hidden')
  tabAbout.classList.add('hidden')
  
  document.getElementById('tab-' + tabName).classList.remove('hidden')
}

function showMsg(el, msg, type) {
  el.textContent = msg
  el.className = 'msg ' + type
  el.classList.remove('hidden')
  setTimeout(() => el.classList.add('hidden'), 3000)
}

function applyEnrollBtn(btn, enrolled) {
  if (enrolled) {
    btn.textContent = 'Re-enroll'
    btn.classList.remove('enroll'); btn.classList.add('reenroll')
  } else {
    btn.textContent = 'Enroll'
    btn.classList.remove('reenroll'); btn.classList.add('enroll')
  }
}

async function loadAuthStatus() {
  const status = await auth.initAuth()

  if (status.hasFingerprint) {
    cardFp.classList.add('active'); statusFp.textContent = 'Enrolled'
  } else {
    cardFp.classList.remove('active'); statusFp.textContent = 'Not enrolled'
  }
  applyEnrollBtn(btnEditFp, status.hasFingerprint)

  if (status.hasPIN) {
  } else {
  }

  if (status.hasPassword) {
    cardPw.classList.add('active'); statusPw.textContent = 'Enrolled'
  } else {
    cardPw.classList.remove('active'); statusPw.textContent = 'Not enrolled'
  }
  applyEnrollBtn(btnEditPw, status.hasPassword)
}

async function loadAllCredentials() {
  const domainsResult = await passwords.getAllDomains()
  if (!domainsResult.success || domainsResult.domains.length === 0) {
    credentialsList.innerHTML = '<div style="padding:24px;text-align:center;color:#666;">No saved credentials</div>'
    return
  }
  
  const domains = domainsResult.domains.sort()
  credentialsList.innerHTML = ''
  
  for (const domain of domains) {
    const vaultData = await store.getPasswordVault()
    const domainCreds = vaultData?.credentials?.[domain] || []
    
    const domainItem = document.createElement('div')
    domainItem.style.cssText = 'border-bottom:1px solid #2a2a2a;'
    
    const domainHeader = document.createElement('div')
    domainHeader.className = 'credential-item'
    domainHeader.style.cursor = 'pointer'
    domainHeader.innerHTML = 
      '<span style="color:#666;margin-right:8px;">▶</span>' +
      '<div class="credential-domain">' + escapeHtml(domain) + '</div>' +
      '<div style="flex:1;"></div>' +
      '<div style="color:#666;font-size:12px;">' + domainCreds.length + ' account' + (domainCreds.length !== 1 ? 's' : '') + '</div>'
    
    const domainContent = document.createElement('div')
    domainContent.style.cssText = 'display:none;background:#111;padding:0 16px;'
    
    domainHeader.onclick = () => {
      const isExpanded = domainContent.style.display !== 'none'
      if (isExpanded) {
        domainContent.style.display = 'none'
        domainHeader.querySelector('span').textContent = '▶'
      } else {
        domainContent.style.display = 'block'
        domainHeader.querySelector('span').textContent = '▼'
      }
    }
    
    for (let i = 0; i < domainCreds.length; i++) {
      const cred = domainCreds[i]
      const credRow = document.createElement('div')
      credRow.style.cssText = 'padding:12px 0;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;'
      credRow.innerHTML = 
        '<div class="credential-username" style="flex:1;">Account ' + (i + 1) + '</div>' +
        '<div class="credential-password" style="width:150px;">••••••••</div>' +
        '<div class="credential-actions">' +
        '<button class="small secondary btn-show">👁️</button>' +
        '<button class="small secondary btn-edit">✏️</button>' +
        '<button class="small danger btn-delete">🗑️</button>' +
        '</div>'
      
      credRow.dataset.credId = cred.id
      credRow.dataset.credIndex = i
      
      credRow.querySelector('.btn-show').onclick = async (e) => {
        e.stopPropagation()
        const usernameEl = credRow.querySelector('.credential-username')
        const pwEl = credRow.querySelector('.credential-password')
        
        if (pwEl.textContent !== '••••••••') {
          pwEl.textContent = '••••••••'
          usernameEl.textContent = 'Account ' + (i + 1)
          return
        }
        
        let masterKey = session.getMasterKey()
        
        if (!masterKey) {
          const authResult = await promptAuth()
          if (!authResult.success) {
            showMsg(msgManage, 'Authentication required', 'error')
            return
          }
          masterKey = authResult.masterKey
          session.setMasterKey(masterKey)
        }
        
        const result = await passwords.getCredentials(domain, masterKey)
        if (result.success) {
          const credential = result.credentials.find(c => c.id === cred.id)
          if (credential) {
            usernameEl.textContent = credential.username
            pwEl.textContent = credential.password
          }
        }
      }
      
      credRow.querySelector('.btn-edit').onclick = async (e) => {
        e.stopPropagation()
        
        let masterKey = session.getMasterKey()
        
        if (!masterKey) {
          const authResult = await promptAuth()
          if (!authResult.success) {
            showMsg(msgManage, 'Authentication required to edit', 'error')
            return
          }
          masterKey = authResult.masterKey
          session.setMasterKey(masterKey)
        }
        
        showMsg(msgManage, 'Edit functionality coming soon')
      }
      
      credRow.querySelector('.btn-delete').onclick = async (e) => {
        e.stopPropagation()
        
        let masterKey = session.getMasterKey()
        
        if (!masterKey) {
          const authResult = await promptAuth()
          if (!authResult.success) {
            showMsg(msgManage, 'Authentication required to delete', 'error')
            return
          }
          masterKey = authResult.masterKey
          session.setMasterKey(masterKey)
        }
        
        const result = await passwords.getCredentials(domain, masterKey)
        if (result.success) {
          const credential = result.credentials.find(c => c.id === cred.id)
          if (credential && confirm('Delete credential for ' + credential.username + ' on ' + domain + '?')) {
            const delResult = await passwords.deleteCredential(cred.id)
            if (delResult.success) {
              showMsg(msgManage, 'Credential deleted', 'success')
              loadAllCredentials()
            } else {
              showMsg(msgManage, 'Delete failed: ' + delResult.error, 'error')
            }
          }
        }
      }
      
      domainContent.appendChild(credRow)
    }
    
    domainItem.appendChild(domainHeader)
    domainItem.appendChild(domainContent)
    credentialsList.appendChild(domainItem)
  }
}

async function promptAuth() {
  const status = await auth.initAuth()

  // Editing requires a HARD unlock: fingerprint or password (never PIN).
  if (status.hasFingerprint) {
    const result = await auth.authenticateFingerprint()
    if (result.success) return { success: true, masterKey: result.masterKey }
  }

  const pw = prompt('Enter Password:')
  if (pw) {
    const result = await auth.authenticatePassword(pw)
    if (result.success) return { success: true, masterKey: result.masterKey }
  }

  return { success: false }
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

async function ensureUnlocked() {
  if (session.hasMasterKey()) return session.getMasterKey()
  const authResult = await promptAuth()
  if (!authResult.success) return null
  session.setMasterKey(authResult.masterKey)
  return authResult.masterKey
}

btnEditFp.onclick = async () => {
  const mk = await ensureUnlocked()
  if (!mk) { showMsg(msgManage, 'Authentication required', 'error'); return }
  auth.startFingerprintEnrollment()
  const result = await auth.enrollFingerprint(mk)
  if (result.success) {
    showMsg(msgManage, 'Fingerprint enrolled', 'success')
    loadAuthStatus()
  } else {
    showMsg(msgManage, result.error, 'error')
  }
}


btnEditPw.onclick = async () => {
  const mk = await ensureUnlocked()
  if (!mk) { showMsg(msgManage, 'Authentication required', 'error'); return }
  const pw = prompt('Enter a password (8+ characters):')
  if (!pw) return
  if (pw.length < 8) { showMsg(msgManage, 'Password must be 8+ characters', 'error'); return }
  auth.startPasswordCreation()
  const result = await auth.setPassword(pw, mk)
  if (result.success) {
    showMsg(msgManage, 'Password enrolled', 'success')
    loadAuthStatus()
  } else {
    showMsg(msgManage, result.error, 'error')
  }
}

btnDelFp.onclick = async () => {
  if (confirm('Delete fingerprint authentication?')) {
    const result = await auth.removeFingerprint()
    if (result.success) {
      showMsg(msgManage, 'Fingerprint removed', 'success')
      loadAuthStatus()
    } else {
      showMsg(msgManage, result.error, 'error')
    }
  }
}


btnDelPw.onclick = async () => {
  if (confirm('Delete password authentication?')) {
    const result = await auth.removePassword()
    if (result.success) {
      showMsg(msgManage, 'Password removed', 'success')
      loadAuthStatus()
    } else {
      showMsg(msgManage, result.error, 'error')
    }
  }
}



btnClearVault.onclick = async () => {
  const confirm1 = confirm(
    'Delete all vault data permanently?\n\n' +
    'Recommendation: Back up to another device first.\n\n' +
    'This cannot be undone.'
  )
  
  if (!confirm1) return
  
  const confirm2 = confirm('Final confirmation: This will delete everything. Continue?')
  
  if (confirm2) {
    await store.clearAll()
    await session.lockAll()
    await session.clearStorageSession()
    showMsg(msgSettings, 'Vault cleared. Redirecting to setup...', 'success')
    setTimeout(() => window.close(), 2000)
  }
}

tabs.forEach(tab => {
  tab.onclick = () => showTab(tab.dataset.tab)
})

inputAutolockTimeout.onchange = () => {
  let v = parseInt(inputAutolockTimeout.value) || 60
  if (v < 10) v = 10; if (v > 3600) v = 3600
  inputAutolockTimeout.value = v
  chrome.storage.local.set({ autoLockTimeout: v })
}
inputQrTimeout.onchange = async () => {
  let v = parseInt(inputQrTimeout.value) || 30
  if (v < 5) v = 5; if (v > 600) v = 600
  inputQrTimeout.value = v
  try { const a = await store.getAuth() || {}; a.qrStreamTimeout = v; await store.setAuth(a) } catch (e) {}
}

const btnBackupSync = document.getElementById('btn-backup-sync')
if (btnBackupSync) btnBackupSync.onclick = () => showTab('sync')

async function init() {
  await restoreMasterKeyFromSession()
  if (!(await unlockManagePage())) return
  await loadAuthStatus()
  await loadAllCredentials()
  
  const settings = await chrome.storage.local.get(['autoLockTimeout'])
  inputAutolockTimeout.value = settings.autoLockTimeout || 60
  try {
    const a = await store.getAuth() || {}
    inputQrTimeout.value = a.qrStreamTimeout || 30
    const nickInput = document.getElementById('key-nickname-input')
    if (nickInput) nickInput.value = a.keyNickname || 'My Master Key'
  } catch (e) { inputQrTimeout.value = 30 }

  const btnRenameKey = document.getElementById('btn-rename-key')
  if (btnRenameKey) btnRenameKey.onclick = async () => {
    const nickInput = document.getElementById('key-nickname-input')
    const msgEl = document.getElementById('key-nickname-msg')
    const name = nickInput ? nickInput.value.trim() : ''
    if (!name) { if (msgEl) { msgEl.textContent = 'Name cannot be empty'; msgEl.style.color = 'var(--danger)' } return }
    try {
      const a = await store.getAuth() || {}
      a.keyNickname = name
      await store.setAuth(a)
      if (msgEl) { msgEl.textContent = 'Key renamed.'; msgEl.style.color = 'var(--green)' }
    } catch (e) {
      if (msgEl) { msgEl.textContent = 'Rename failed'; msgEl.style.color = 'var(--danger)' }
    }
  }

  attachActivityListeners()
}


// ===================== SYNC (phone-parity) =====================
const msgSync = document.getElementById('msg-sync')
const EXPORT_ITERATIONS = 1000000

function syncMsg(t, kind) { showMsg(msgSync, t, kind || 'success') }

// ---- QR stream timeout (persisted in auth record) ----
async function getQrTimeoutSeconds() {
  try { const a = await store.getAuth() || {}; if (a.qrStreamTimeout) return a.qrStreamTimeout } catch (e) {}
  return 30
}

// ---- Fountain streaming (Share) ----
let shareFountainTimer = null, shareCountdownTimer = null, shareShutoffTimer = null
function stopShareFountain() {
  if (shareFountainTimer) { clearInterval(shareFountainTimer); shareFountainTimer = null }
  if (shareCountdownTimer) { clearInterval(shareCountdownTimer); shareCountdownTimer = null }
  if (shareShutoffTimer) { clearTimeout(shareShutoffTimer); shareShutoffTimer = null }
  const c = document.getElementById('share-qr'); if (c) c.innerHTML = ''
}
async function streamShare(payload, label) {
  stopShareFountain()
  const wrap = document.getElementById('share-qr-wrap')
  const container = document.getElementById('share-qr')
  const labelEl = document.getElementById('share-qr-label')
  const timerEl = document.getElementById('share-qr-timer')
  if (!container) return
  if (labelEl) labelEl.textContent = label
  if (wrap) wrap.classList.remove('hidden')
  const encoder = createEncoder(payload)
  function renderNext() {
    const frame = encoder.nextFrame()
    const qr = new QRCode({ content: frame, width: 256, height: 256, padding: 2, color: '#000000', background: '#ffffff' })
    container.innerHTML = qr.svg()
  }
  renderNext()
  shareFountainTimer = setInterval(renderNext, 300)
  const seconds = await getQrTimeoutSeconds()
  let remaining = seconds
  if (timerEl) timerEl.textContent = 'Auto-closes in ' + remaining + 's'
  shareCountdownTimer = setInterval(function () {
    remaining -= 1
    if (timerEl) timerEl.textContent = remaining > 0 ? ('Auto-closes in ' + remaining + 's') : 'Closing...'
  }, 1000)
  shareShutoffTimer = setTimeout(stopShare, seconds * 1000)
}
function stopShare() {
  stopShareFountain()
  const wrap = document.getElementById('share-qr-wrap')
  if (wrap) wrap.classList.add('hidden')
}

const _btnShareVault = document.getElementById('btn-share-vault'); if (_btnShareVault) _btnShareVault.onclick = async function () {
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock your vault first', 'error'); return }
  const vaultData = await getPasswordVault()
  if (!vaultData) { syncMsg('Nothing to sync yet', 'error'); return }
  streamShare(JSON.stringify({ kind: 'vault', vault: vaultData }), 'Scan this with your other device to receive your logins')
}
const _btnShareKey = document.getElementById('btn-share-key'); if (_btnShareKey) _btnShareKey.onclick = async function () {
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock your vault first', 'error'); return }
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', mk))
  streamShare(JSON.stringify({ kind: 'key', key: Array.from(raw) }), 'Scan this with your new device to give it the master key')
}
const _btnStopShare = document.getElementById('btn-stop-share'); if (_btnStopShare) _btnStopShare.onclick = stopShare

// ---- Backup files ----
function downloadFile(filename, text) {
  try {
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
    return true
  } catch (e) { return false }
}
function readFileText(cb) {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.vaultkey,.vault,application/json'
  input.onchange = function () {
    const f = input.files && input.files[0]
    if (!f) { cb(null); return }
    const r = new FileReader()
    r.onload = function () { cb(r.result) }
    r.onerror = function () { cb(null) }
    r.readAsText(f)
  }
  input.click()
}

const SECURITY_QUESTIONS = [
  'Name of your first pet', 'City where you were born', 'Name of your first street',
  'Your mothers maiden name', 'Name of your first school', 'Your childhood best friend first name',
  'Make of your first car', 'Name of your first employer', 'Your favorite childhood teacher last name',
  'The street you grew up on'
]
function pickThreeQuestions() {
  const idx = []; const pool = SECURITY_QUESTIONS.slice()
  for (let i = 0; i < 3; i++) { const r = Math.floor(Math.random() * pool.length); idx.push(SECURITY_QUESTIONS.indexOf(pool[r])); pool.splice(r, 1) }
  return idx
}
function combineSecret(passphrase, qIdx, answers) {
  const parts = [passphrase]
  for (let i = 0; i < qIdx.length; i++) parts.push(String(qIdx[i]) + ':' + answers[i])
  return parts.join('\u0000')
}

const _btnExportVault = document.getElementById('btn-export-vault'); if (_btnExportVault) _btnExportVault.onclick = async function () {
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock first', 'error'); return }
  const vaultData = await getPasswordVault()
  if (!vaultData) { syncMsg('Nothing to export yet', 'error'); return }
  let nickname = ''
  try { const a = await store.getAuth() || {}; nickname = (a.keyNickname || '').trim() } catch (e) {}
  // filesystem-safe, but preserve the user's exact capitalization
  const safeName = nickname ? '-' + nickname.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-') : ''
  const fname = 'valid-vault-backup' + safeName + '.vault'
  if (downloadFile(fname, JSON.stringify({ format: 'valid-vault-vault', version: 1, vault: vaultData })))
    syncMsg('Vault exported. It stays encrypted, useless without your master key.', 'success')
  else syncMsg('Could not save the file', 'error')
}
const _btnImportVault = document.getElementById('btn-import-vault'); if (_btnImportVault) _btnImportVault.onclick = function () {
  readFileText(async function (text) {
    if (!text) { syncMsg('No file selected', 'error'); return }
    try {
      const fileObj = JSON.parse(text)
      if (fileObj.format !== 'valid-vault-vault') { syncMsg('Not a Valid Vault backup file', 'error'); return }
      const mk = session.getMasterKey()
      if (!mk) { syncMsg('Unlock first', 'error'); return }
      const local = await getPasswordVault()
      const incoming = fileObj.vault
      if (!local) { await setPasswordVault(incoming); syncMsg('Vault restored.', 'success'); return }
      const merged = await passwords.mergeVaults(local, incoming, mk)
      merged.meta.createdAt = Math.min(local.meta.createdAt, incoming.meta.createdAt)
      merged.meta.lastAccess = Date.now()
      await setPasswordVault(merged)
      syncMsg('Vault merged.', 'success')
    } catch (e) { syncMsg('Import failed: ' + (e && e.message ? e.message : e), 'error') }
  })
}
const _btnExportKey = document.getElementById('btn-export-key'); if (_btnExportKey) _btnExportKey.onclick = async function () {
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock first', 'error'); return }
  const qIdx = pickThreeQuestions()
  showExportKeyModal(qIdx)
}
const _btnImportKey = document.getElementById('btn-import-key'); if (_btnImportKey) _btnImportKey.onclick = function () {
  readFileText(function (text) {
    if (!text) { syncMsg('No file selected', 'error'); return }
    try { const fileObj = JSON.parse(text); if (fileObj.format !== 'valid-vault-key') { syncMsg('Not a key file', 'error'); return } showImportKeyModal(fileObj) }
    catch (e) { syncMsg('Could not read the file', 'error') }
  })
}

// export/import key modals (simple prompt-based to keep it lean)
async function showExportKeyModal(qIdx) {
  const pass = window.prompt('Set an export passphrase (12+ chars, letter/number/symbol, capitalization matters):')
  if (!pass) return
  if (pass.length < 12 || !/[a-zA-Z]/.test(pass) || !/[0-9]/.test(pass) || !/[^a-zA-Z0-9]/.test(pass)) { syncMsg('Passphrase must be 12+ chars with a letter, number, and symbol', 'error'); return }
  const answers = []
  for (let i = 0; i < qIdx.length; i++) {
    const a = window.prompt(SECURITY_QUESTIONS[qIdx[i]] + ' (one word, capitalization matters):')
    if (!a) { syncMsg('All three answers are required', 'error'); return }
    answers.push(a)
  }
  try {
    const mk = session.getMasterKey()
    const secret = combineSecret(pass, qIdx, answers)
    const salt = await generateSalt()
    const wrapKey = await deriveKeyFromSecret(secret, salt, EXPORT_ITERATIONS)
    const rawMaster = new Uint8Array(await crypto.subtle.exportKey('raw', mk))
    const wrapped = await wrapMasterKey(rawMaster, wrapKey)
    const authRec = await store.getAuth() || {}
    const nickname = authRec.keyNickname || 'My Master Key'
    const fileObj = { format: 'valid-vault-key', version: 1, nickname: nickname, questions: qIdx, salt: Array.from(salt), iterations: EXPORT_ITERATIONS, wrapped: wrapped }
    const fname = nickname.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.vaultkey'
    if (downloadFile(fname, JSON.stringify(fileObj))) syncMsg('Key exported. Store the file, passphrase, and answers safely.', 'success')
    else syncMsg('Could not save the file', 'error')
  } catch (e) { syncMsg('Export failed: ' + (e && e.message ? e.message : e), 'error') }
}
async function showImportKeyModal(fileObj) {
  const pass = window.prompt('Key file: ' + (fileObj.nickname || 'Master Key') + '\nEnter passphrase:')
  if (!pass) return
  const answers = []
  for (let i = 0; i < fileObj.questions.length; i++) {
    const a = window.prompt(SECURITY_QUESTIONS[fileObj.questions[i]] + ' (capitalization matters):')
    if (a == null) return
    answers.push(a)
  }
  try {
    const secret = combineSecret(pass, fileObj.questions, answers)
    const salt = new Uint8Array(fileObj.salt)
    const wrapKey = await deriveKeyFromSecret(secret, salt, fileObj.iterations || EXPORT_ITERATIONS)
    const rawMaster = await unwrapMasterKey(fileObj.wrapped, wrapKey)
    const importedKey = await masterKeyToCryptoKey(rawMaster)
    session.setMasterKey(importedKey)
    syncMsg('Master key imported. This device can now sync and decrypt vaults.', 'success')
  } catch (e) { syncMsg('Wrong passphrase or answers.', 'error') }
}

// ---- Scan (getUserMedia + jsQR, in-box) ----
let scanActive = false
const _qrScanBox = document.getElementById('qr-scan-box'); if (_qrScanBox) _qrScanBox.onclick = async function () {
  if (scanActive) return
  const box = document.getElementById('qr-scan-box')
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { syncMsg('Camera not available', 'error'); return }
  scanActive = true
  const decoder = createDecoder()
  let settled = false, stream = null, raf = null
  const origHtml = box.innerHTML
  box.innerHTML = ''
  const video = document.createElement('video'); video.setAttribute('playsinline', 'true'); video.muted = true
  video.style.cssText = 'width:100%;height:100%;object-fit:cover;'
  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel'
  cancel.style.cssText = 'position:absolute;top:8px;left:8px;z-index:3;background:var(--danger);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-weight:700;'
  const status = document.createElement('div'); status.style.cssText = 'position:absolute;bottom:8px;left:0;right:0;text-align:center;color:#33ff66;font-family:monospace;font-size:12px;z-index:3;'
  status.textContent = 'Point at the other device'
  box.appendChild(video); box.appendChild(cancel); box.appendChild(status)
  function cleanup() {
    settled = true
    setTimeout(function () { scanActive = false }, 400)
    if (raf) { cancelAnimationFrame(raf); raf = null }
    try { if (stream) { stream.getTracks().forEach(function (t) { t.stop() }); stream = null } } catch (e) {}
    try { video.pause(); video.srcObject = null } catch (e) {}
    box.innerHTML = origHtml
  }
  cancel.onclick = function (e) { if (e) { e.stopPropagation(); e.preventDefault() } cleanup(); syncMsg('Scan cancelled', 'success') }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    video.srcObject = stream; await video.play()
    function tick() {
      if (settled) return
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        if (code && code.data) {
          const outcome = decoder.addFrame(code.data)
          if (outcome.success) {
            status.textContent = 'Receiving: ' + outcome.solved + ' of ' + outcome.total
            if (outcome.complete) { const assembled = decoder.assemble(); cleanup(); handleImported(assembled.payload); return }
          }
        }
      }
      if (!settled) raf = requestAnimationFrame(tick)
    }
    if (!settled) raf = requestAnimationFrame(tick)
  } catch (e) { cleanup(); syncMsg('Camera failed: ' + (e && e.message ? e.message : e), 'error') }
}

async function handleImported(payloadText) {
  const data = JSON.parse(payloadText)
  if (data.kind === 'key') {
    const importedKey = await masterKeyToCryptoKey(new Uint8Array(data.key))
    session.setMasterKey(importedKey)
    syncMsg('Sync key imported. This device can now sync.', 'success')
    return
  }
  if (data.kind === 'vault') {
    const mk = session.getMasterKey()
    if (!mk) { syncMsg('QR sync not enabled. Import master key first', 'error'); return }
    const local = await getPasswordVault()
    const incoming = data.vault
    if (!local) { await setPasswordVault(incoming); syncMsg('Vault imported.', 'success'); return }
    const merged = await passwords.mergeVaults(local, incoming, mk)
    merged.meta.createdAt = Math.min(local.meta.createdAt, incoming.meta.createdAt)
    merged.meta.lastAccess = Date.now()
    await setPasswordVault(merged)
    syncMsg('Sync complete.', 'success')
    return
  }
  syncMsg('Unrecognized code', 'error')
}

init()
