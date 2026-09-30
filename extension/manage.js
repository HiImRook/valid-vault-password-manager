import * as auth from './auth.js'
import * as passwords from './passwords.js'
import * as webcreds from './webcreds.js'
import * as personalinfo from './personalinfo.js'
import * as bookmarks from './bookmarks.js'
import * as wallets from './wallets.js'
import * as walletsTab from './wallets-tab.js'
import * as session from './session.js'
import * as store from './store.js'
import * as pairing from './pairing.js'
import QRCode from './qrcode.js'
import { splitIntoFrames, createFrameCollector } from './frames.js'
import { createEncoder, createDecoder } from './fountain.js'
import { masterKeyToCryptoKey, decrypt } from './crypto.js'
import { formDialog, askSecret } from './dialogs.js'
import * as keypackage from './keypackage.js'
import * as uniVault from './linkedvault.js'
import { getPasswordVault, setPasswordVault } from './store.js'


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
      await chrome.storage.session.set({ masterKeyBytes: Array.from(bytes), lastActivity: Date.now() })
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
      await chrome.storage.session.set({ masterKeyBytes: Array.from(bytes), lastActivity: Date.now() })
      inputManagePassword.value = ''
      hideLockOverlay()
      location.reload()
    } else if (msgManageLock) { showMsg(msgManageLock, result.error, 'error') }
  }
}

if (inputManagePassword) {
  inputManagePassword.onkeydown = (e) => { if (e.key === 'Enter' && btnManageUnlockPw) btnManageUnlockPw.click() }
}


function attachActivityListeners() {
  
  
  let lastPing = 0
  const bump = () => {
    session.resetActivity()
    const now = Date.now()
    if (now - lastPing < 3000) return
    lastPing = now
    try { chrome.runtime.sendMessage({ action: 'activity' }) } catch (e) {}
  }
  document.body.addEventListener('click', bump, true)
  document.body.addEventListener('input', bump, true)
  document.body.addEventListener('keydown', bump, true)
  
  document.body.addEventListener('mousemove', bump, true)
  
  document.body.addEventListener('touchstart', bump, true)
  document.body.addEventListener('touchmove', bump, true)
}


async function checkAndShowLockOverlay() {
  if (session.hasMasterKey()) { hideLockOverlay(); return }
  const restored = await restoreMasterKeyFromSession()
  if (restored) { hideLockOverlay() } else { showLockOverlay(); loginCredsUnlocked = false; webCredsUnlocked = false; personalInfoUnlocked = false; walletsTab.lock() }
}
setInterval(checkAndShowLockOverlay, 5000)

const tabs = document.querySelectorAll('.sidebar-tab')
const tabManage = document.getElementById('tab-manage')
const tabWebcreds = document.getElementById('tab-webcreds')
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
  if (tabName !== 'wallets') walletsTab.onTabHidden()
  tabs.forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active')
  
  tabManage.classList.add('hidden')
  tabWebcreds.classList.add('hidden')
  tabPersonal.classList.add('hidden')
  document.getElementById('tab-sync').classList.add('hidden')
  document.getElementById('tab-wallets').classList.add('hidden')
  tabSettings.classList.add('hidden')
  tabAbout.classList.add('hidden')
  
  document.getElementById('tab-' + tabName).classList.remove('hidden')
  if (tabName === 'webcreds') loadAllWebCredentials()
  if (tabName === 'personal') loadPersonalInfo()
  if (tabName === 'wallets') walletsTab.onTabShown()
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

var loginCredsUnlocked = false

async function loadAllCredentials() {
  if (!loginCredsUnlocked) {
    credentialsList.innerHTML = '<div style="padding:24px;text-align:center;"><button id="btn-unlock-creds">\ud83d\udd10 Unlock to view credentials</button></div>'
    const btn = document.getElementById('btn-unlock-creds')
    if (btn) btn.onclick = async () => {
      const authResult = await promptAuth()
      if (!authResult.success) { showMsg(msgManage, 'Authentication required', 'error'); return }
      session.setMasterKey(authResult.masterKey)
      loginCredsUnlocked = true
      loadAllCredentials()
    }
    return
  }
  let tree = null
  try {
    tree = await passwords.readVaultTree(session.getMasterKey())
  } catch (e) {
    credentialsList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--danger);">Could not open saved credentials with the current master key</div>'
    return
  }
  const domains = Object.keys(tree.credentials).filter((d) => tree.credentials[d].some((c) => !c.deleted)).sort()
  if (domains.length === 0) {
    credentialsList.innerHTML = '<div style="padding:24px;text-align:center;color:#666;">No saved credentials</div>'
    return
  }

  credentialsList.innerHTML = ''

  for (const domain of domains) {
    const domainCreds = tree.credentials[domain].filter((c) => !c.deleted)
    
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
      credRow.style.cssText = 'padding:12px 0;border-bottom:1px solid #1a1a1a;'
      credRow.innerHTML =
        '<div style="display:flex;align-items:center;gap:12px;">' +
        '<select class="credential-logintype small" style="width:auto;">' +
        '<option value="username">👤 Username</option>' +
        '<option value="email">📧 Email</option>' +
        '<option value="phone">📱 Phone</option>' +
        '</select>' +
        '<div class="credential-username">Account ' + (i + 1) + '</div>' +
        '<div class="credential-password">••••••••</div>' +
        '<div class="credential-actions">' +
        '<button class="small secondary btn-show">👁️</button>' +
        '<button class="small secondary btn-edit">✏️</button>' +
        '<button class="small danger btn-delete">🗑️</button>' +
        '</div>' +
        '</div>' +
        '<div class="credential-extra" style="display:none;margin-top:8px;padding-left:4px;"></div>'

      credRow.dataset.credId = cred.id
      credRow.dataset.credIndex = i

      const loginTypeEl = credRow.querySelector('.credential-logintype')
      loginTypeEl.value = cred.loginType || 'username'
      loginTypeEl.onclick = (e) => e.stopPropagation()
      loginTypeEl.onchange = async (e) => {
        e.stopPropagation()
        let masterKey = session.getMasterKey()
        if (!masterKey) {
          const authResult = await promptAuth()
          if (!authResult.success) {
            showMsg(msgManage, 'Authentication required to edit', 'error')
            loginTypeEl.value = cred.loginType || 'username'
            return
          }
          masterKey = authResult.masterKey
          session.setMasterKey(masterKey)
        }
        const result = await passwords.updateCredential(cred.id, { loginType: loginTypeEl.value }, masterKey)
        if (result.success) {
          cred.loginType = loginTypeEl.value
          showMsg(msgManage, 'Account type updated', 'success')
        } else {
          showMsg(msgManage, 'Update failed: ' + result.error, 'error')
          loginTypeEl.value = cred.loginType || 'username'
        }
      }
      
      credRow.querySelector('.btn-show').onclick = async (e) => {
        e.stopPropagation()
        const usernameEl = credRow.querySelector('.credential-username')
        const pwEl = credRow.querySelector('.credential-password')
        const extraEl = credRow.querySelector('.credential-extra')

        if (pwEl.textContent !== '••••••••') {
          pwEl.textContent = '••••••••'
          usernameEl.textContent = 'Account ' + (i + 1)
          extraEl.style.display = 'none'
          extraEl.innerHTML = ''
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
            renderExtraFields(extraEl, credential, masterKey)
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
        
        const newPassword = await askSecret('Edit password', 'New password for this login', 'The username stays the same. A different username is a separate login.')
        if (!newPassword) return
        const result = await passwords.updateCredential(cred.id, { password: newPassword }, masterKey)
        if (result.success) {
          showMsg(msgManage, 'Password updated', 'success')
          loadAllCredentials()
        } else {
          showMsg(msgManage, 'Update failed: ' + result.error, 'error')
        }
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
            const delResult = await passwords.deleteCredential(cred.id, masterKey)
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




function renderExtraFields(container, credential, masterKey) {
  container.style.display = 'block'
  container.innerHTML = ''
  const fields = credential.extraFields || []

  if (fields.length === 0) {
    const none = document.createElement('div')
    none.style.cssText = 'color:#666;font-size:12px;padding:4px 0;'
    none.textContent = 'No additional fields saved'
    container.appendChild(none)
  }

  fields.forEach((field, idx) => {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;'
    row.innerHTML =
      '<span style="width:140px;color:var(--text-dim);">' + escapeHtml(field.label) + '</span>' +
      '<span style="flex:1;">' + escapeHtml(field.value) + '</span>' +
      '<button class="small secondary btn-edit-extra">Edit</button>' +
      '<button class="small danger btn-delete-extra">Delete</button>'

    row.querySelector('.btn-edit-extra').onclick = async () => {
      const newValue = window.prompt('New value for "' + field.label + '":', field.value)
      if (newValue === null) return
      const updated = fields.map((f, i2) => i2 === idx ? { label: f.label, value: newValue } : f)
      const result = await passwords.updateCredential(credential.id, { extraFields: updated }, masterKey)
      if (result.success) { showMsg(msgManage, 'Updated', 'success'); loadAllCredentials() }
      else { showMsg(msgManage, 'Update failed: ' + result.error, 'error') }
    }

    row.querySelector('.btn-delete-extra').onclick = async () => {
      if (!confirm('Delete "' + field.label + '"?')) return
      const updated = fields.filter((f, i2) => i2 !== idx)
      const result = await passwords.updateCredential(credential.id, { extraFields: updated }, masterKey)
      if (result.success) { showMsg(msgManage, 'Deleted', 'success'); loadAllCredentials() }
      else { showMsg(msgManage, 'Delete failed: ' + result.error, 'error') }
    }

    container.appendChild(row)
  })

  const addBtn = document.createElement('button')
  addBtn.className = 'small secondary'
  addBtn.style.marginTop = '4px'
  addBtn.textContent = '+ Add Field'
  addBtn.onclick = async () => {
    const label = window.prompt('Field name (e.g. Account Number):')
    if (!label) return
    const value = window.prompt('Value:')
    if (value === null) return
    const updated = fields.concat([{ label: label.trim(), value }])
    const result = await passwords.updateCredential(credential.id, { extraFields: updated }, masterKey)
    if (result.success) { showMsg(msgManage, 'Added', 'success'); loadAllCredentials() }
    else { showMsg(msgManage, 'Add failed: ' + result.error, 'error') }
  }
  container.appendChild(addBtn)
}

const msgWebcreds = document.getElementById('msg-webcreds')
const webCredsListEl = document.getElementById('webcreds-list')
const btnAddWebcred = document.getElementById('btn-add-webcred')

var webCredsUnlocked = false

async function loadAllWebCredentials() {
  if (!webCredsUnlocked) {
    webCredsListEl.innerHTML = '<div style="padding:24px;text-align:center;"><button id="btn-unlock-webcreds">\ud83d\udd10 Unlock to view web credentials</button></div>'
    const btn = document.getElementById('btn-unlock-webcreds')
    if (btn) btn.onclick = async () => {
      const authResult = await promptAuth()
      if (!authResult.success) { showMsg(msgWebcreds, 'Authentication required', 'error'); return }
      session.setMasterKey(authResult.masterKey)
      webCredsUnlocked = true
      loadAllWebCredentials()
    }
    return
  }
  const catResult = await webcreds.getAllCategories()
  if (!catResult.success || catResult.categories.length === 0) {
    webCredsListEl.innerHTML = '<div style="padding:24px;text-align:center;color:#666;">No web credentials saved</div>'
    return
  }

  const categories = catResult.categories.sort()
  webCredsListEl.innerHTML = ''

  for (const category of categories) {
    const vaultData = await store.getWebCredsVault()
    const catCreds = (vaultData?.credentials?.[category] || []).filter(c => !c.deleted)

    const catItem = document.createElement('div')
    catItem.style.cssText = 'border-bottom:1px solid #2a2a2a;'

    const catHeader = document.createElement('div')
    catHeader.className = 'credential-item'
    catHeader.style.cursor = 'pointer'
    catHeader.innerHTML =
      '<span style="color:#666;margin-right:8px;">\u25b6</span>' +
      '<div class="credential-domain">' + escapeHtml(category) + '</div>' +
      '<div style="flex:1;"></div>' +
      '<div style="color:#666;font-size:12px;">' + catCreds.length + ' item' + (catCreds.length !== 1 ? 's' : '') + '</div>'

    const catContent = document.createElement('div')
    catContent.style.cssText = 'display:none;background:#111;padding:0 16px;'

    catHeader.onclick = () => {
      const isExpanded = catContent.style.display !== 'none'
      if (isExpanded) {
        catContent.style.display = 'none'
        catHeader.querySelector('span').textContent = '\u25b6'
      } else {
        catContent.style.display = 'block'
        catHeader.querySelector('span').textContent = '\u25bc'
      }
    }

    for (const cred of catCreds) {
      const row = document.createElement('div')
      row.style.cssText = 'padding:12px 0;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:12px;'
      row.innerHTML =
        '<div class="credential-username">Item</div>' +
        '<div class="credential-password">\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022</div>' +
        '<div class="credential-actions">' +
        '<button class="small secondary btn-show">\ud83d\udc41\ufe0f</button>' +
        '<button class="small secondary btn-edit">\u270f\ufe0f</button>' +
        '<button class="small danger btn-delete">\ud83d\uddd1\ufe0f</button>' +
        '</div>'

      const nameEl = row.querySelector('.credential-username')
      const valueEl = row.querySelector('.credential-password')
      nameEl.textContent = 'Item'

      row.querySelector('.btn-show').onclick = async (e) => {
        e.stopPropagation()
        if (valueEl.textContent !== '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022') {
          valueEl.textContent = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
          nameEl.textContent = 'Item'
          return
        }
        let masterKey = session.getMasterKey()
        if (!masterKey) {
          const authResult = await promptAuth()
          if (!authResult.success) { showMsg(msgWebcreds, 'Authentication required', 'error'); return }
          masterKey = authResult.masterKey
          session.setMasterKey(masterKey)
        }
        const result = await webcreds.getWebCredentials(category, masterKey)
        if (result.success) {
          const item = result.credentials.find(c => c.id === cred.id)
          if (item) { nameEl.textContent = item.name; valueEl.textContent = item.value }
        }
      }

      row.querySelector('.btn-edit').onclick = async (e) => {
        e.stopPropagation()
        let masterKey = session.getMasterKey()
        if (!masterKey) {
          const authResult = await promptAuth()
          if (!authResult.success) { showMsg(msgWebcreds, 'Authentication required', 'error'); return }
          masterKey = authResult.masterKey
          session.setMasterKey(masterKey)
        }
        const newValue = window.prompt('New value for this item (name stays the same; a different name is a separate item):')
        if (!newValue) return
        const result = await webcreds.updateWebCredential(cred.id, { value: newValue }, masterKey)
        if (result.success) { showMsg(msgWebcreds, 'Updated', 'success'); loadAllWebCredentials() }
        else { showMsg(msgWebcreds, 'Update failed: ' + result.error, 'error') }
      }

      row.querySelector('.btn-delete').onclick = async (e) => {
        e.stopPropagation()
        let masterKey = session.getMasterKey()
        if (!masterKey) {
          const authResult = await promptAuth()
          if (!authResult.success) { showMsg(msgWebcreds, 'Authentication required', 'error'); return }
          masterKey = authResult.masterKey
          session.setMasterKey(masterKey)
        }
        const result = await webcreds.getWebCredentials(category, masterKey)
        const item = result.success ? result.credentials.find(c => c.id === cred.id) : null
        const label = item ? item.name : 'this item'
        if (confirm('Delete "' + label + '" from ' + category + '?')) {
          const delResult = await webcreds.deleteWebCredential(cred.id)
          if (delResult.success) { showMsg(msgWebcreds, 'Deleted', 'success'); loadAllWebCredentials() }
          else { showMsg(msgWebcreds, 'Delete failed: ' + delResult.error, 'error') }
        }
      }

      catContent.appendChild(row)
    }

    catItem.appendChild(catHeader)
    catItem.appendChild(catContent)
    webCredsListEl.appendChild(catItem)
  }
}

if (btnAddWebcred) {
  btnAddWebcred.onclick = async () => {
    let masterKey = session.getMasterKey()
    if (!masterKey) {
      const authResult = await promptAuth()
      if (!authResult.success) { showMsg(msgWebcreds, 'Authentication required', 'error'); return }
      masterKey = authResult.masterKey
      session.setMasterKey(masterKey)
    }
    const category = prompt('Category (e.g. Wi-Fi):')
    if (!category) return
    const name = prompt('Name (e.g. Home Router):')
    if (!name) return
    const value = prompt('Value:')
    if (!value) return
    const result = await webcreds.saveWebCredential(category.trim(), name.trim(), value, masterKey)
    if (result.success) { showMsg(msgWebcreds, 'Saved', 'success'); loadAllWebCredentials() }
    else { showMsg(msgWebcreds, 'Save failed', 'error') }
  }
}


const msgPersonalInfo = document.getElementById('msg-personalinfo')
const personalInfoContent = document.getElementById('personalinfo-content')

var personalInfoUnlocked = false




async function loadPersonalInfo() {
  if (!personalInfoUnlocked) {
    personalInfoContent.innerHTML = '<div style="padding:24px;text-align:center;"><button id="btn-unlock-personalinfo">\ud83d\udd10 Unlock to view Personal Info</button></div>'
    const btn = document.getElementById('btn-unlock-personalinfo')
    if (btn) btn.onclick = async () => {
      const authResult = await promptAuth()
      if (!authResult.success) { showMsg(msgPersonalInfo, 'Authentication required', 'error'); return }
      session.setMasterKey(authResult.masterKey)
      personalInfoUnlocked = true
      loadPersonalInfo()
    }
    return
  }

  const masterKey = session.getMasterKey()
  if (!masterKey) { personalInfoUnlocked = false; loadPersonalInfo(); return }

  const result = await personalinfo.getProfile(masterKey)
  if (!result.success) { personalInfoContent.innerHTML = '<p style="color:var(--danger);">' + result.error + '</p>'; return }
  const p = result.profile

  var html = ''
  html += fieldRow('First Name', p.firstName || '(not set)', 'firstName')
  html += fieldRow('Last Name', p.lastName || '(not set)', 'lastName')
  html += fieldRow('Phone', p.phone || '(not set)', 'phone')

  html += '<h3 style="margin-top:18px;">Emails</h3>'
  if (!p.emails || p.emails.length === 0) {
    html += '<p style="color:var(--text-dim);font-size:13px;">No emails saved.</p>'
  } else {
    const sorted = p.emails.slice().sort((a, b) => a.position - b.position)
    sorted.forEach(function (e, i) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #1a1a1a;">'
      html += '<span style="flex:1;">' + escapeHtml(e.value) + (i === 0 ? ' <span style="color:var(--green);font-size:11px;">(Primary)</span>' : '') + '</span>'
      html += '<button class="small secondary" data-email-up="' + e.id + '"' + (i === 0 ? ' disabled' : '') + '>\u2191</button>'
      html += '<button class="small secondary" data-email-down="' + e.id + '"' + (i === sorted.length - 1 ? ' disabled' : '') + '>\u2193</button>'
      html += '<button class="small danger" data-email-del="' + e.id + '">Delete</button>'
      html += '</div>'
    })
  }
  html += '<button style="margin-top:8px;" id="btn-add-email">+ Add Email</button>'

  html += '<h3 style="margin-top:18px;">Address</h3>'
  html += fieldRow('Street', (p.address && p.address.street) || '(not set)', 'address.street')
  html += fieldRow('City', (p.address && p.address.city) || '(not set)', 'address.city')
  html += fieldRow('State', (p.address && p.address.state) || '(not set)', 'address.state')
  html += fieldRow('ZIP', (p.address && p.address.zip) || '(not set)', 'address.zip')
  html += fieldRow('Country', (p.address && p.address.country) || '(not set)', 'address.country')

  personalInfoContent.innerHTML = html

  if (!personalInfoContent._delegated) {
    personalInfoContent._delegated = true
    personalInfoContent.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-edit-field]')
      if (editBtn) { await editPersonalInfoField(editBtn.getAttribute('data-edit-field')); return }
      const upBtn = e.target.closest('[data-email-up]')
      if (upBtn && !upBtn.disabled) { await moveEmail(upBtn.getAttribute('data-email-up'), -1); return }
      const downBtn = e.target.closest('[data-email-down]')
      if (downBtn && !downBtn.disabled) { await moveEmail(downBtn.getAttribute('data-email-down'), 1); return }
      const delBtn = e.target.closest('[data-email-del]')
      if (delBtn) { await deleteEmail(delBtn.getAttribute('data-email-del')); return }
    })
  }
  const addEmailBtn = document.getElementById('btn-add-email')
  if (addEmailBtn) addEmailBtn.onclick = addEmail
}

function fieldRow(label, value, fieldKey) {
  return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #1a1a1a;">' +
    '<span style="width:100px;color:var(--text-dim);font-size:13px;">' + label + '</span>' +
    '<span style="flex:1;">' + escapeHtml(value) + '</span>' +
    '<button class="small secondary" data-edit-field="' + fieldKey + '">Edit</button>' +
    '</div>'
}

async function getFieldValue(profile, fieldKey) {
  if (fieldKey.indexOf('address.') === 0) {
    const sub = fieldKey.split('.')[1]
    return (profile.address && profile.address[sub]) || ''
  }
  return profile[fieldKey] || ''
}

async function editPersonalInfoField(fieldKey) {
  const authResult = await promptAuth()
  if (!authResult.success) { showMsg(msgPersonalInfo, 'Authentication required', 'error'); return }
  const masterKey = authResult.masterKey
  session.setMasterKey(masterKey)

  const current = await personalinfo.getProfile(masterKey)
  if (!current.success) { showMsg(msgPersonalInfo, current.error, 'error'); return }
  const profile = current.profile

  const currentValue = await getFieldValue(profile, fieldKey)
  const newValue = window.prompt('New value:', currentValue)
  if (newValue === null) return

  if (fieldKey.indexOf('address.') === 0) {
    const sub = fieldKey.split('.')[1]
    if (!profile.address) profile.address = { street: '', city: '', state: '', zip: '', country: '' }
    profile.address[sub] = newValue
  } else {
    profile[fieldKey] = newValue
  }

  const saveResult = await personalinfo.saveProfile(profile, masterKey)
  if (saveResult.success) { showMsg(msgPersonalInfo, 'Saved', 'success'); loadPersonalInfo() }
  else { showMsg(msgPersonalInfo, 'Save failed', 'error') }
}

async function addEmail() {
  const authResult = await promptAuth()
  if (!authResult.success) { showMsg(msgPersonalInfo, 'Authentication required', 'error'); return }
  const masterKey = authResult.masterKey
  session.setMasterKey(masterKey)

  const email = window.prompt('New email address:')
  if (!email) return

  const current = await personalinfo.getProfile(masterKey)
  if (!current.success) { showMsg(msgPersonalInfo, current.error, 'error'); return }
  const profile = current.profile
  if (!profile.emails) profile.emails = []
  const nextPosition = profile.emails.length
  profile.emails.push({ id: personalinfo.generateId(), value: email, position: nextPosition })

  const saveResult = await personalinfo.saveProfile(profile, masterKey)
  if (saveResult.success) { showMsg(msgPersonalInfo, 'Email added', 'success'); loadPersonalInfo() }
  else { showMsg(msgPersonalInfo, 'Save failed', 'error') }
}

async function moveEmail(emailId, direction) {
  const authResult = await promptAuth()
  if (!authResult.success) { showMsg(msgPersonalInfo, 'Authentication required', 'error'); return }
  const masterKey = authResult.masterKey
  session.setMasterKey(masterKey)

  const current = await personalinfo.getProfile(masterKey)
  if (!current.success) { showMsg(msgPersonalInfo, current.error, 'error'); return }
  const profile = current.profile
  const sorted = profile.emails.slice().sort((a, b) => a.position - b.position)
  const index = sorted.findIndex(e => e.id === emailId)
  const swapIndex = index + direction
  if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) return

  const tmp = sorted[index].position
  sorted[index].position = sorted[swapIndex].position
  sorted[swapIndex].position = tmp
  profile.emails = sorted

  const saveResult = await personalinfo.saveProfile(profile, masterKey)
  if (saveResult.success) { loadPersonalInfo() }
  else { showMsg(msgPersonalInfo, 'Save failed', 'error') }
}

async function deleteEmail(emailId) {
  const authResult = await promptAuth()
  if (!authResult.success) { showMsg(msgPersonalInfo, 'Authentication required', 'error'); return }
  const masterKey = authResult.masterKey
  session.setMasterKey(masterKey)

  if (!window.confirm('Delete this email?')) return

  const current = await personalinfo.getProfile(masterKey)
  if (!current.success) { showMsg(msgPersonalInfo, current.error, 'error'); return }
  const profile = current.profile
  profile.emails = (profile.emails || []).filter(e => e.id !== emailId)
    .sort((a, b) => a.position - b.position)
    .map((e, i) => ({ ...e, position: i }))

  const saveResult = await personalinfo.saveProfile(profile, masterKey)
  if (saveResult.success) { showMsg(msgPersonalInfo, 'Deleted', 'success'); loadPersonalInfo() }
  else { showMsg(msgPersonalInfo, 'Save failed', 'error') }
}


async function promptAuth() {
  const status = await auth.initAuth()

  
  if (status.hasFingerprint) {
    const result = await auth.authenticateFingerprint()
    if (result.success) return { success: true, masterKey: result.masterKey }
  }

  const pw = await askSecret('Unlock', 'Master password', status.hasFingerprint ? 'Fingerprint did not complete. Enter your master password instead.' : 'Enter your master password.')
  if (pw) {
    const result = await auth.authenticatePassword(pw)
    if (result.success) return { success: true, masterKey: result.masterKey }
  }

  return { success: false }
}

const aboutVersion = document.getElementById('about-version')
if (aboutVersion) aboutVersion.textContent = 'v' + chrome.runtime.getManifest().version

walletsTab.init({
  getKey: () => session.getMasterKey(),
  authenticate: async () => {
    const authResult = await promptAuth()
    if (!authResult.success) return false
    session.setMasterKey(authResult.masterKey)
    return true
  }
})

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

async function requireFreshAuth() {
  const authResult = await promptAuth()
  if (!authResult.success) return null
  session.setMasterKey(authResult.masterKey)
  return authResult.masterKey
}

btnEditFp.onclick = async () => {
  const mk = await requireFreshAuth()
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
  const mk = await requireFreshAuth()
  if (!mk) { showMsg(msgManage, 'Authentication required', 'error'); return }
  const pw = await askSecret('Set master password', 'New master password', '12+ characters with a letter, a number, and a symbol.')
  if (!pw) return
  if (pw.length < 12) { showMsg(msgManage, 'Password must be 12+ characters', 'error'); return }
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^a-zA-Z0-9]/.test(pw)) { showMsg(msgManage, 'Password needs a letter, a number, and a symbol', 'error'); return }
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
  if (!(await requireFreshAuth())) { showMsg(msgManage, 'Authentication required', 'error'); return }
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
  if (!(await requireFreshAuth())) { showMsg(msgManage, 'Authentication required', 'error'); return }
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
  if (!(await requireFreshAuth())) { showMsg(msgSettings, 'Authentication required to clear the vault', 'error'); return }
  const confirm1 = confirm(
    'Delete all vault data permanently?\n\n' +
    'Recommendation: Back up to another device first.\n\n' +
    'This cannot be undone.'
  )
  
  if (!confirm1) return
  
  const confirm2 = confirm('Final confirmation: This will delete everything. Continue?')
  
  if (confirm2) {
    await uniVault.clearLink()
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

const AUTOLOCK_MIN_SEC = 10
const AUTOLOCK_MAX_SEC = 7200
const QR_TIMEOUT_MIN_SEC = 5
const QR_TIMEOUT_MAX_SEC = 600
const readoutAutolockTimeout = document.getElementById('readout-autolock-timeout')
const readoutQrTimeout = document.getElementById('readout-qr-timeout')

function formatDuration(totalSeconds, showHours) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hours = Math.floor(s / 3600)
  const minutes = showHours ? Math.floor((s % 3600) / 60) : Math.floor(s / 60)
  const seconds = s % 60
  const tail = String(minutes).padStart(2, '0') + 'm ' + String(seconds).padStart(2, '0') + 's'
  return showHours ? String(hours).padStart(2, '0') + 'h ' + tail : tail
}

function updateTimeReadouts() {
  if (readoutAutolockTimeout) readoutAutolockTimeout.textContent = formatDuration(inputAutolockTimeout.value, true)
  if (readoutQrTimeout) readoutQrTimeout.textContent = formatDuration(inputQrTimeout.value, false)
}

inputAutolockTimeout.oninput = updateTimeReadouts
inputQrTimeout.oninput = updateTimeReadouts

inputAutolockTimeout.onchange = () => {
  let v = parseInt(inputAutolockTimeout.value) || 60
  if (v < AUTOLOCK_MIN_SEC) v = AUTOLOCK_MIN_SEC; if (v > AUTOLOCK_MAX_SEC) v = AUTOLOCK_MAX_SEC
  inputAutolockTimeout.value = v
  updateTimeReadouts()
  chrome.storage.local.set({ autoLockTimeout: v })
}
inputQrTimeout.onchange = async () => {
  let v = parseInt(inputQrTimeout.value) || 30
  if (v < QR_TIMEOUT_MIN_SEC) v = QR_TIMEOUT_MIN_SEC; if (v > QR_TIMEOUT_MAX_SEC) v = QR_TIMEOUT_MAX_SEC
  inputQrTimeout.value = v
  updateTimeReadouts()
  try { const a = await store.getAuth() || {}; a.qrStreamTimeout = v; await store.setAuth(a) } catch (e) {}
}

const GEN_MIN_CHOICES = [16, 20]
const GEN_MAX_CHOICES = [24, 32, 48, 64]
const GEN_DEFAULT_MIN = 16
const GEN_DEFAULT_MAX = 24
const selectGenMin = document.getElementById('select-gen-min')
const selectGenMax = document.getElementById('select-gen-max')

async function loadGeneratorSettings() {
  if (!selectGenMin || !selectGenMax) return
  let stored = {}
  try { stored = await chrome.storage.local.get(['genMinLength', 'genMaxLength']) } catch (e) {}
  selectGenMin.value = String(GEN_MIN_CHOICES.includes(stored.genMinLength) ? stored.genMinLength : GEN_DEFAULT_MIN)
  selectGenMax.value = String(GEN_MAX_CHOICES.includes(stored.genMaxLength) ? stored.genMaxLength : GEN_DEFAULT_MAX)
}

if (selectGenMin) selectGenMin.onchange = () => {
  const v = parseInt(selectGenMin.value)
  if (GEN_MIN_CHOICES.includes(v)) chrome.storage.local.set({ genMinLength: v })
}
if (selectGenMax) selectGenMax.onchange = () => {
  const v = parseInt(selectGenMax.value)
  if (GEN_MAX_CHOICES.includes(v)) chrome.storage.local.set({ genMaxLength: v })
}
loadGeneratorSettings()

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
  updateTimeReadouts()
  refreshUniVault()
  uniVaultTick()

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



const msgSync = document.getElementById('msg-sync')

function syncMsg(t, kind) { showMsg(msgSync, t, kind || 'success') }


async function getQrTimeoutSeconds() {
  try { const a = await store.getAuth() || {}; if (a.qrStreamTimeout) return a.qrStreamTimeout } catch (e) {}
  return 30
}


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
  const webCredsData = await store.getWebCredsVault()
  const personalInfoData = await store.getPersonalInfo()
  if (!vaultData && !webCredsData && !personalInfoData) { syncMsg('Nothing to sync yet', 'error'); return }
  streamShare(JSON.stringify({ kind: 'vault', vault: vaultData, webcreds: webCredsData, personalInfo: personalInfoData }), 'Scan this with your other device to receive your logins')
}
const _btnShareKey = document.getElementById('btn-share-key'); if (_btnShareKey) _btnShareKey.onclick = async function () {
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock your vault first', 'error'); return }
  let pkg = null
  try { pkg = await ensureKeyPackage(mk) } catch (e) { syncMsg('Could not prepare the key: ' + (e && e.message ? e.message : e), 'error'); return }
  if (!pkg) return
  streamShare(JSON.stringify({ kind: 'keyfile', key: pkg }), 'Scan this with your other device. It will ask for your passphrase and answers before accepting the key.')
}
const _btnStopShare = document.getElementById('btn-stop-share'); if (_btnStopShare) _btnStopShare.onclick = stopShare


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

function backupFileName(nickname) {
  const safeName = nickname ? '-' + nickname.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-') : ''
  return 'valid-vault-backup' + safeName + '.vault'
}

const VAULT_FILE_TYPES = [{ description: 'Valid Vault vault', accept: { 'application/json': ['.vault'] } }]

const _btnExportVault = document.getElementById('btn-export-vault'); if (_btnExportVault) _btnExportVault.onclick = async function () {
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock first', 'error'); return }
  const bundle = await uniVault.buildBundle()
  if (!uniVault.bundleHasData(bundle)) { syncMsg('Nothing to export yet', 'error'); return }
  let nickname = ''
  try { const a = await store.getAuth() || {}; nickname = (a.keyNickname || '').trim() } catch (e) {}
  const fname = backupFileName(nickname)
  if (!uniVault.uniVaultSupported()) {
    if (downloadFile(fname, JSON.stringify(bundle))) syncMsg('Vault exported. It stays encrypted, useless without your master key.', 'success')
    else syncMsg('Could not save the file', 'error')
    return
  }
  let handle
  try { handle = await window.showSaveFilePicker({ suggestedName: fname, types: VAULT_FILE_TYPES }) } catch (e) {
    syncMsg('Export cancelled. Nothing was saved.', 'error')
    return
  }
  const linked = await uniVault.getLink()
  if (linked) {
    try {
      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(bundle))
      await writable.close()
      syncMsg('Backup saved. It stays encrypted, useless without your master key. This browser stays linked to ' + linked.name + '.', 'success')
    } catch (e) { syncMsg('Could not save the file', 'error') }
    return
  }
  const choice = await formDialog({
    title: 'Use this as your Uni-Vault file?',
    text: 'Link this browser to ' + handle.name + ' and it stays up to date automatically. Every browser on this computer that imports the same file shares one vault. Choose Backup only to save a one-time copy, for example on a USB drive.',
    okLabel: 'Link this file',
    cancelLabel: 'Backup only'
  })
  if (choice) {
    const result = await uniVault.linkNew(handle, mk)
    if (result.state === 'ok') syncMsg('Uni-Vault linked to ' + handle.name + '. In your other browsers, use Import Key, then Import Vault and pick this same file.', 'success')
    else syncMsg(result.message || 'Could not link the file.', 'error')
  } else {
    try {
      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(bundle))
      await writable.close()
      syncMsg('Backup saved. It stays encrypted, useless without your master key.', 'success')
    } catch (e) { syncMsg('Could not save the file', 'error') }
  }
  refreshUniVault()
}

async function importVaultText(text) {
  if (!text) { syncMsg('No file selected', 'error'); return }
  try {
    const fileObj = JSON.parse(text)
    if (fileObj.format !== uniVault.VAULT_FILE_FORMAT) { syncMsg('Not a Valid Vault backup file', 'error'); return }
    const mk = session.getMasterKey()
    if (!mk) { syncMsg('Unlock first', 'error'); return }
    await uniVault.mergeBundle(fileObj, mk)
    syncMsg('Vault merged.', 'success')
    refreshAfterSync()
  } catch (e) { syncMsg('Import failed: ' + (e && e.message ? e.message : e), 'error') }
}

const _btnImportVault = document.getElementById('btn-import-vault'); if (_btnImportVault) _btnImportVault.onclick = async function () {
  if (!uniVault.uniVaultSupported()) { readFileText(importVaultText); return }
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock first', 'error'); return }
  let handle
  try { [handle] = await window.showOpenFilePicker({ types: VAULT_FILE_TYPES, multiple: false }) } catch (e) {
    syncMsg('No file selected', 'error')
    return
  }
  const linked = await uniVault.getLink()
  const choice = await formDialog({
    title: 'Link this vault file?',
    text: (linked ? 'This browser is linked to ' + linked.name + '. ' : '') + 'Link to ' + handle.name + ' and this browser merges it now and keeps it up to date automatically, sharing one vault with every browser that uses the same file. Choose Merge once to only copy its contents in, for example from a backup.',
    okLabel: 'Link this file',
    cancelLabel: 'Merge once'
  })
  if (choice) {
    const result = await uniVault.linkExisting(handle, mk)
    if (result.state === 'ok') syncMsg('Uni-Vault linked to ' + handle.name + '. This browser now stays in sync with it.', 'success')
    else syncMsg(result.message || 'Could not link the file.', 'error')
    refreshAfterSync()
    refreshUniVault()
    return
  }
  try { await importVaultText(await (await handle.getFile()).text()) } catch (e) { syncMsg('Could not read the file', 'error') }
}

const uniVaultStatusEl = document.getElementById('univault-status')
const btnUniVaultReconnect = document.getElementById('btn-univault-reconnect')
const btnUniVaultUnlink = document.getElementById('btn-univault-unlink')
const UNIVAULT_POLL_MS = 5000

function timeAgo(ts) {
  if (!ts) return 'not yet'
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (secs < 60) return 'just now'
  if (secs < 3600) return Math.round(secs / 60) + ' min ago'
  return new Date(ts).toLocaleString()
}

async function refreshUniVault() {
  if (!uniVaultStatusEl) return
  const info = await uniVault.getStatus()
  if (!uniVault.uniVaultSupported() && !info.linked) {
    uniVaultStatusEl.textContent = uniVault.isBrave()
      ? 'Uni-Vault is switched off in Brave. Brave blocks the browser feature it needs. See the User Guide, Uni-Vault on One Computer, for the one setting that fixes it.'
      : 'This browser does not support Uni-Vault. Use Export Vault and Import Vault to move changes between browsers.'
    btnUniVaultReconnect.classList.add('hidden')
    btnUniVaultUnlink.classList.add('hidden')
    return
  }
  if (!info.linked) {
    uniVaultStatusEl.textContent = 'Not linked. Export Vault or Import Vault to link a vault file.'
    btnUniVaultReconnect.classList.add('hidden')
    btnUniVaultUnlink.classList.add('hidden')
    return
  }
  const state = info.status ? info.status.state : 'ok'
  let text = 'Linked to ' + info.name + '. Last synced ' + timeAgo(info.syncedAt) + '.'
  if (state !== 'ok' && info.status && info.status.message) text = 'Linked to ' + info.name + '. ' + info.status.message
  uniVaultStatusEl.textContent = text
  btnUniVaultReconnect.classList.toggle('hidden', state === 'ok')
  btnUniVaultUnlink.classList.remove('hidden')
}

function refreshAfterSync() {
  if (loginCredsUnlocked) loadAllCredentials()
  if (webCredsUnlocked) loadAllWebCredentials()
  if (personalInfoUnlocked) loadPersonalInfo()
}

async function uniVaultTick() {
  const mk = session.getMasterKey()
  if (!mk || document.hidden) return
  const link = await uniVault.getLink()
  if (!link) return
  const result = await uniVault.syncNow(mk)
  if (result.merged) refreshAfterSync()
  refreshUniVault()
}

if (btnUniVaultReconnect) btnUniVaultReconnect.onclick = async () => {
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock first', 'error'); return }
  const result = await uniVault.reconnect(mk)
  if (result.state === 'ok') syncMsg('Vault file reconnected.', 'success')
  else syncMsg(result.message || 'Could not reconnect the vault file.', 'error')
  if (result.merged) refreshAfterSync()
  refreshUniVault()
}

if (btnUniVaultUnlink) btnUniVaultUnlink.onclick = async () => {
  if (!window.confirm('Unlink this browser from the vault file? This browser keeps its own copy of everything. The file is not deleted.')) return
  await uniVault.clearLink()
  syncMsg('Unlinked. This browser keeps its own copy.', 'success')
  refreshUniVault()
}

setInterval(uniVaultTick, UNIVAULT_POLL_MS)

chrome.runtime.onMessage.addListener((request) => {
  if (request && request.action === 'vaultSynced') { refreshAfterSync(); refreshUniVault() }
})

const PASSPHRASE_TIP = 'Use four or more random words plus a number and a symbol, like copper-lantern-mosaic-drift7!. Capitalization matters.'
const ANSWER_TIP = 'One word. Capitalization matters.'

async function setupKeyPackage(mk, isChange) {
  const defaults = keypackage.pickThreeQuestions()
  const nickname = await keypackage.getNickname()
  const questionOptions = keypackage.SECURITY_QUESTIONS.map((label, value) => ({ label, value }))
  const fields = [
    { label: 'Passphrase', secret: true, hint: PASSPHRASE_TIP },
    { label: 'Confirm passphrase', secret: true }
  ]
  defaults.forEach((q, i) => {
    fields.push({ label: 'Question ' + (i + 1), options: questionOptions, value: q })
    fields.push({ label: 'Answer ' + (i + 1), secret: true, hint: ANSWER_TIP })
  })
  return formDialog({
    title: isChange ? 'Change key protection' : 'Protect your master key',
    text: (isChange ? 'This replaces the passphrase and answers for new key shares and key files. Key files you already saved keep their old passphrase. ' : 'Your master key only leaves this device wrapped under a passphrase and three security answers. Another device must enter all of them to accept it. You set this once; Share Master Key and Export Key reuse it. ') + 'Pick questions you will always remember the answers to. A lost passphrase or answer cannot be recovered.',
    fields,
    okLabel: 'Save',
    busyLabel: 'Securing...',
    validate: async (values) => {
      const problem = keypackage.passphraseProblem(values[0])
      if (problem) return { error: problem, focus: 0 }
      if (values[0] !== values[1]) return { error: 'The passphrases do not match.', focus: 1 }
      const qIdx = [values[2], values[4], values[6]].map(Number)
      if (new Set(qIdx).size !== qIdx.length) return { error: 'Choose three different questions.', focus: 2 }
      const answers = [values[3], values[5], values[7]]
      const blank = answers.findIndex((a) => !a)
      if (blank !== -1) return { error: 'All three answers are required.', focus: 3 + blank * 2 }
      const pkg = await keypackage.buildPackage(mk, values[0], qIdx, answers, nickname)
      await keypackage.savePackage(mk, pkg)
      return { value: pkg }
    }
  })
}

async function ensureKeyPackage(mk) {
  const saved = await keypackage.getSavedPackage(mk)
  if (saved) return saved
  return setupKeyPackage(mk, false)
}

async function unlockKeyPackage(pkg, sourceLabel) {
  const fields = [{ label: 'Passphrase', secret: true }]
    .concat(pkg.questions.map((q) => ({ label: keypackage.SECURITY_QUESTIONS[q], secret: true, hint: ANSWER_TIP })))
  return formDialog({
    title: 'Accept master key',
    text: sourceLabel + ': ' + (pkg.nickname || 'Master Key') + '. Enter the passphrase and the three answers it was protected with.',
    fields,
    okLabel: 'Unlock key',
    busyLabel: 'Checking...',
    validate: async (values) => {
      if (!values[0]) return { error: 'Enter the passphrase.', focus: 0 }
      try {
        return { value: await keypackage.openPackage(pkg, values[0], values.slice(1)) }
      } catch (e) {
        return { error: 'Wrong passphrase or answers. Check capitalization and try again.', focus: 0 }
      }
    }
  })
}

async function acceptKeyPackage(pkg, sourceLabel) {
  const importedKey = await unlockKeyPackage(pkg, sourceLabel)
  if (!importedKey) { syncMsg('Key import cancelled. Nothing changed.', 'error'); return }
  const adopted = await adoptImportedKey(importedKey)
  if (adopted) {
    try { await keypackage.savePackage(importedKey, pkg) } catch (e) {}
  }
}

const _btnExportKey = document.getElementById('btn-export-key'); if (_btnExportKey) _btnExportKey.onclick = async function () {
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock first', 'error'); return }
  try {
    const pkg = await ensureKeyPackage(mk)
    if (!pkg) return
    const fname = (pkg.nickname || 'master-key').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.vaultkey'
    if (downloadFile(fname, JSON.stringify(pkg))) syncMsg('Key exported. Keep the file, passphrase, and answers safe.', 'success')
    else syncMsg('Could not save the file', 'error')
  } catch (e) { syncMsg('Export failed: ' + (e && e.message ? e.message : e), 'error') }
}
const _btnImportKey = document.getElementById('btn-import-key'); if (_btnImportKey) _btnImportKey.onclick = function () {
  readFileText(async function (text) {
    if (!text) { syncMsg('No file selected', 'error'); return }
    let fileObj = null
    try { fileObj = JSON.parse(text) } catch (e) { syncMsg('Could not read the file', 'error'); return }
    if (!keypackage.isKeyPackage(fileObj)) { syncMsg('Not a key file', 'error'); return }
    try { await acceptKeyPackage(fileObj, 'Key file') }
    catch (e) { syncMsg('Key import failed: ' + (e && e.message ? e.message : e), 'error') }
  })
}
const _btnChangeKeyProtection = document.getElementById('btn-change-key-protection'); if (_btnChangeKeyProtection) _btnChangeKeyProtection.onclick = async function () {
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock first', 'error'); return }
  const authResult = await promptAuth()
  if (!authResult.success) { syncMsg('Authentication required', 'error'); return }
  try {
    const pkg = await setupKeyPackage(mk, true)
    if (pkg) syncMsg('Key protection updated. New key shares and key files use it.', 'success')
  } catch (e) { syncMsg('Could not update key protection: ' + (e && e.message ? e.message : e), 'error') }
}

const VAULT_STORES = ['passwords', 'webcreds', 'personalInfo', 'vaultMigration', 'bookmarks', 'wallets']

function passwordMeetsRule(pw) {
  return !!pw && pw.length >= 12 && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw) && /[^a-zA-Z0-9]/.test(pw)
}

async function clearLocalVaultData() {
  const database = await store.openDB()
  for (const storeName of VAULT_STORES) {
    await new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

async function choosePasswordForImport(status) {
  if (status.hasPassword) {
    const current = await askSecret('Confirm key import', 'This browser\'s master password', 'The imported key gets locked under this browser\'s password so it survives lock and unlock.')
    if (!current) { syncMsg('Key import cancelled. Nothing changed.', 'error'); return null }
    const check = await auth.authenticatePassword(current)
    if (!check.success) { syncMsg('Wrong password. Key import cancelled, nothing changed.', 'error'); return null }
    if (passwordMeetsRule(current)) return current
  }
  const fresh = await askSecret('Set a master password', 'New master password', 'This browser has no password yet. Set one for the imported key: 12+ characters with a letter, a number, and a symbol.')
  if (!fresh) { syncMsg('Key import cancelled. Nothing changed.', 'error'); return null }
  if (!passwordMeetsRule(fresh)) { syncMsg('Password must be 12+ characters with a letter, a number, and a symbol. Key import cancelled, nothing changed.', 'error'); return null }
  return fresh
}

async function platformUnlockAvailable() {
  try {
    return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch (e) {
    return false
  }
}

async function chooseImportLock() {
  if (!(await platformUnlockAvailable())) return 'password'
  const values = await formDialog({
    title: 'Lock the imported key',
    text: 'Choose how this browser unlocks the imported key. Fingerprint or device PIN is recommended: the unlock secret stays inside Windows Hello, so nothing saved in the browser can be guessed at. A password works on any device, but anyone who copies your browser data can try guessing it offline.',
    fields: [{
      label: 'Unlock with',
      options: [
        { value: 'device', label: 'Fingerprint or device PIN (recommended)' },
        { value: 'password', label: 'Master password' }
      ],
      value: 'device'
    }],
    okLabel: 'Continue'
  })
  if (!values) return null
  return values[0]
}

async function lockWithDevice(importedKey, status) {
  if (status.hasFingerprint) {
    const rewrapped = await auth.rewrapFingerprint(importedKey)
    if (rewrapped.success) return true
  }
  try {
    auth.startFingerprintEnrollment()
    const fp = await auth.enrollFingerprint(importedKey)
    return !!fp.success
  } catch (e) {
    return false
  }
}

async function settleBackupPassword(importedKey, status) {
  if (!status.hasPassword) return ''
  const keep = window.confirm('Keep a master password on this browser as a backup unlock?\n\nOK: set the password for the imported key (you can reuse this browser\'s current password).\nCancel: turn password unlock off. You can add one later in Manage.')
  if (keep) {
    const pw = await askSecret('Backup password', 'Master password', 'Set the backup password for the imported key: 12+ characters with a letter, a number, and a symbol.')
    if (pw && passwordMeetsRule(pw)) {
      auth.startPasswordCreation()
      const result = await auth.setPassword(pw, importedKey)
      if (result.success) return ''
    }
  }
  await auth.removePassword()
  return ' Password unlock is off on this browser until you set one in Manage.'
}

async function relinkFingerprint(importedKey, status) {
  if (!status.hasFingerprint) return ''
  let relinked = false
  if (window.confirm('Relink fingerprint unlock to the imported key? You will be asked for your fingerprint or device PIN. Cancel turns fingerprint unlock off until you re-enroll it in Manage.')) {
    const rewrapped = await auth.rewrapFingerprint(importedKey)
    relinked = !!rewrapped.success
    if (!relinked) {
      try {
        auth.startFingerprintEnrollment()
        const fp = await auth.enrollFingerprint(importedKey)
        relinked = !!fp.success
      } catch (e) {}
    }
  }
  if (relinked) return ''
  await auth.removeFingerprint()
  return ' Fingerprint unlock is off until you re-enroll it in Manage.'
}

async function adoptImportedKey(importedKey) {
  const matches = await uniVault.localVaultOpensWith(importedKey)
  if (!matches) {
    const proceed = window.confirm(
      'WARNING: This browser\'s current vault was made with a different master key.\n\n' +
      'Importing this key makes that vault unusable, so it will be cleared from this browser.\n\n' +
      'This is how you get ready to receive the vault from your other device: import the key first, then import or scan the vault.\n\n' +
      'Continue?'
    )
    if (!proceed) { syncMsg('Key import cancelled. Nothing changed.', 'error'); return false }
  }

  const status = await auth.initAuth()
  let method = await chooseImportLock()
  if (!method) { syncMsg('Key import cancelled. Nothing changed.', 'error'); return false }

  let note = ''
  if (method === 'device') {
    const locked = await lockWithDevice(importedKey, status)
    if (!locked) {
      if (!window.confirm('Fingerprint or device PIN did not complete. Lock the imported key with a master password instead?')) {
        syncMsg('Key import cancelled. Nothing changed.', 'error')
        return false
      }
      method = 'password'
    } else {
      if (!matches) await clearLocalVaultData()
      note = await settleBackupPassword(importedKey, status)
    }
  }

  if (method === 'password') {
    const password = await choosePasswordForImport(status)
    if (!password) return false
    if (!matches) await clearLocalVaultData()
    auth.startPasswordCreation()
    const result = await auth.setPassword(password, importedKey)
    if (!result.success) { syncMsg('Could not save the imported key: ' + result.error, 'error'); return false }
    note = await relinkFingerprint(importedKey, status)
  }

  session.setMasterKey(importedKey)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', importedKey))
  try { await chrome.storage.session.set({ masterKeyBytes: Array.from(raw), lastActivity: Date.now() }) } catch (e) {}
  loginCredsUnlocked = false
  webCredsUnlocked = false
  personalInfoUnlocked = false
  walletsTab.lock()
  await loadAuthStatus()
  await loadAllCredentials()

  syncMsg(matches
    ? 'Master key imported and saved on this browser.' + note
    : 'Master key imported and saved. Now import or scan the vault from your other device.' + note, 'success')
  return true
}


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
            if (outcome.complete) { const assembled = decoder.assemble(); cleanup(); syncMsg('Received ' + outcome.total + ' of ' + outcome.total + ', importing...', 'success'); handleImported(assembled.payload); return }
          }
        }
      }
      if (!settled) raf = requestAnimationFrame(tick)
    }
    if (!settled) raf = requestAnimationFrame(tick)
  } catch (e) { cleanup(); syncMsg('Camera failed: ' + (e && e.message ? e.message : e), 'error') }
}

async function handleImported(payloadText) {
  try {
    const data = JSON.parse(payloadText)
    if (data.kind === 'keyfile') {
      if (!keypackage.isKeyPackage(data.key)) { syncMsg('That key code is damaged or incomplete. Scan it again.', 'error'); return }
      await acceptKeyPackage(data.key, 'Scanned key')
      return
    }
    if (data.kind === 'key') {
      syncMsg('Refused: this code carries an unprotected master key from an older version. Update the other device, or move the key with Export Key and Import Key.', 'error')
      return
    }
    if (data.kind === 'vault') {
      const mk = session.getMasterKey()
      if (!mk) { syncMsg('QR sync not enabled. Import master key first', 'error'); return }
      await uniVault.mergeBundle(data, mk)
      syncMsg('Sync complete.', 'success')
      if (loginCredsUnlocked) loadAllCredentials()
      return
    }
    syncMsg('Unrecognized code', 'error')
  } catch (e) { syncMsg('Sync failed: ' + (e && e.message ? e.message : e), 'error') }
}

init()
