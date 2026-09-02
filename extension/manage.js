import * as auth from './auth.js'
import * as passwords from './passwords.js'
import * as session from './session.js'
import * as store from './store.js'
import * as pairing from './pairing.js'
import QRCode from './qrcode.js'
import { splitIntoFrames, createFrameCollector } from './frames.js'
import { createEncoder, createDecoder } from './fountain.js'

const tabs = document.querySelectorAll('.sidebar-tab')
const tabManage = document.getElementById('tab-manage')
const tabPersonal = document.getElementById('tab-personal')
const tabSettings = document.getElementById('tab-settings')
const tabAbout = document.getElementById('tab-about')

const cardFp = document.getElementById('card-fp')
const cardPin = document.getElementById('card-pin')
const cardPw = document.getElementById('card-pw')
const statusFp = document.getElementById('status-fp')
const statusPin = document.getElementById('status-pin')
const statusPw = document.getElementById('status-pw')

const btnEditFp = document.getElementById('btn-edit-fp')
const btnDelFp = document.getElementById('btn-del-fp')
const btnEditPin = document.getElementById('btn-edit-pin')
const btnDelPin = document.getElementById('btn-del-pin')
const btnEditPw = document.getElementById('btn-edit-pw')
const btnDelPw = document.getElementById('btn-del-pw')

const credentialsList = document.getElementById('credentials-list')
const msgManage = document.getElementById('msg-manage')
const msgSettings = document.getElementById('msg-settings')

const inputSoftTimeout = document.getElementById('input-soft-timeout')
const inputHardTimeout = document.getElementById('input-hard-timeout')
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
    cardPin.classList.add('active'); statusPin.textContent = 'Enrolled'
  } else {
    cardPin.classList.remove('active'); statusPin.textContent = 'Not enrolled'
  }
  applyEnrollBtn(btnEditPin, status.hasPIN)

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

btnEditPin.onclick = async () => {
  const mk = await ensureUnlocked()
  if (!mk) { showMsg(msgManage, 'Authentication required', 'error'); return }
  const pin = prompt('Enter a 4-6 digit PIN:')
  if (!pin) return
  if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
    showMsg(msgManage, 'PIN must be 4-6 digits', 'error'); return
  }
  auth.startPINCreation()
  const result = await auth.setPIN(pin, mk)
  if (result.success) {
    showMsg(msgManage, 'PIN enrolled', 'success')
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

btnDelPin.onclick = async () => {
  if (confirm('Remove the PIN?')) {
    const result = await auth.removePIN()
    if (result.success) {
      showMsg(msgManage, 'PIN removed', 'success')
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

inputSoftTimeout.onchange = () => {
  let m = parseInt(inputSoftTimeout.value) || 5
  if (m < 1) m = 1
  chrome.storage.local.set({ softLockTimeout: m })
  showMsg(msgSettings, 'Soft-lock set to ' + m + ' minutes', 'success')
}

inputHardTimeout.onchange = () => {
  let m = parseInt(inputHardTimeout.value) || 20
  if (m < 1) m = 1
  chrome.storage.local.set({ hardLockTimeout: m })
  showMsg(msgSettings, 'Hard-lock set to ' + m + ' minutes', 'success')
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

const btnBackupSync = document.getElementById('btn-backup-sync')
if (btnBackupSync) btnBackupSync.onclick = () => showTab('sync')
})

async function init() {
  await loadAuthStatus()
  await loadAllCredentials()
  
  const settings = await chrome.storage.local.get(['softLockTimeout', 'hardLockTimeout'])
  inputSoftTimeout.value = settings.softLockTimeout || 5
  inputHardTimeout.value = settings.hardLockTimeout || 20
}


const btnStartSync = document.getElementById('btn-start-sync')
const btnStopSync = document.getElementById('btn-stop-sync')
const syncQr = document.getElementById('sync-qr')
const syncQrLabel = document.getElementById('sync-qr-label')
const syncVideo = document.getElementById('sync-video')
const syncCamLabel = document.getElementById('sync-cam-label')
const msgSync = document.getElementById('msg-sync')

let syncState = null

let frameAnimationTimer = null

function displayFramedQR(container, payload) {
  const frames = splitIntoFrames(payload)
  let current = 0

  if (frameAnimationTimer) {
    clearInterval(frameAnimationTimer)
    frameAnimationTimer = null
  }

  function renderFrame() {
    const qr = new QRCode({ content: frames[current], width: 256, height: 256, padding: 2, color: '#000000', background: '#ffffff' })
    const label = frames.length > 1 ? '<div style="text-align:center;color:#888;font-size:12px;margin-top:8px;">Frame ' + (current + 1) + ' of ' + frames.length + '</div>' : ''
    container.innerHTML = qr.svg() + label
    current = (current + 1) % frames.length
  }

  renderFrame()
  if (frames.length > 1) {
    frameAnimationTimer = setInterval(renderFrame, 600)
  }
}

function stopFramedQR() {
  if (frameAnimationTimer) {
    clearInterval(frameAnimationTimer)
    frameAnimationTimer = null
  }
}

let fountainTimer = null

function streamFountainQR(container, payload) {
  stopFountainQR()
  const encoder = createEncoder(payload)

  function renderNext() {
    const frame = encoder.nextFrame()
    const qr = new QRCode({ content: frame, width: 256, height: 256, padding: 2, color: '#000000', background: '#ffffff' })
    container.innerHTML = qr.svg() + '<div style="text-align:center;color:#888;font-size:12px;margin-top:8px;">Streaming ' + encoder.chunkCount + ' blocks - keep scanning until the other device completes</div>'
  }

  renderNext()
  fountainTimer = setInterval(renderNext, 300)
}

function stopFountainQR() {
  if (fountainTimer) {
    clearInterval(fountainTimer)
    fountainTimer = null
  }
}

let syncActive = false
let scanLoopRunning = false

function stopSync() {
  syncActive = false
  scanLoopRunning = false
  stopFountainQR()
  if (syncVideo.srcObject) {
    syncVideo.srcObject.getTracks().forEach(function (t) { t.stop() })
    syncVideo.srcObject = null
  }
  syncVideo.classList.add('hidden')
  syncCamLabel.classList.add('hidden')
  btnStopSync.classList.add('hidden')
}

async function scanLoop(detector, myPrivateKey) {
  const seenKeys = new Set()
  const decoder = createDecoder()
  let sharedKey = null
  let receiving = false

  scanLoopRunning = true
  while (scanLoopRunning) {
    try {
      const found = await detector.detect(syncVideo)
      for (const code of found) {
        const raw = code.rawValue
        if (!receiving) {
          const parsed = pairing.parseQR(raw)
          if (parsed.success && !seenKeys.has(raw)) {
            seenKeys.add(raw)
            sharedKey = await pairing.deriveSharedKey(myPrivateKey, parsed.publicKey)
            receiving = true
            const masterKey = session.getMasterKey()
            const transfer = await pairing.prepareTransfer(masterKey, sharedKey)
            if (transfer.success) {
              streamFountainQR(syncQr, transfer.data.payload)
            }
            showMsg(msgSync, 'Phone key received, streaming vault and reading theirs...', 'success')
          }
        } else {
          const outcome = decoder.addFrame(raw)
          if (outcome.success) {
            showMsg(msgSync, 'Receiving vault: ' + outcome.solved + ' of ' + outcome.total + ' blocks', 'success')
            if (outcome.complete) {
              const assembled = decoder.assemble()
              const localMasterKey = session.getMasterKey()
              const merged = await pairing.applyIncomingVault(assembled.payload, sharedKey, localMasterKey)
              if (merged.success) {
                showMsg(msgSync, 'Sync complete. ' + merged.count + ' credentials.', 'success')
              } else {
                showMsg(msgSync, 'Merge failed: ' + merged.error, 'error')
              }
              stopSync()
              return
            }
          }
        }
      }
    } catch (error) {
    }
    await new Promise(function (r) { setTimeout(r, 100) })
  }
}

btnStartSync.onclick = async function() {
  const masterKey = session.getMasterKey()
  if (!masterKey) {
    showMsg(msgSync, 'Unlock your vault before syncing', 'error')
    return
  }

  syncActive = true
  btnStopSync.classList.remove('hidden')

  const keyPair = await pairing.generateKeyPair()
  const myQrData = JSON.stringify({ type: 'valid-vault-pair', publicKey: keyPair.publicKey })

  syncQrLabel.classList.remove('hidden')
  const keyQr = new QRCode({ content: myQrData, width: 256, height: 256, padding: 2, color: '#000000', background: '#ffffff' })
  syncQr.innerHTML = keyQr.svg()

  if (!('BarcodeDetector' in window)) {
    showMsg(msgSync, 'This browser cannot scan. Sending only - your phone will receive.', 'success')
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    syncVideo.srcObject = stream
    syncVideo.classList.remove('hidden')
    syncCamLabel.classList.remove('hidden')
    await syncVideo.play()
    const detector = new BarcodeDetector({ formats: ['qr_code'] })
    scanLoop(detector, keyPair.privateKey)
  } catch (error) {
    showMsg(msgSync, 'Camera unavailable, sending only: ' + error.message, 'success')
  }
}

btnStopSync.onclick = function() {
  stopSync()
  showMsg(msgSync, 'Sync stopped', 'success')
}
init()
