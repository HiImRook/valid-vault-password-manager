import * as auth from './auth.js'
import * as passwords from './passwords.js'
import * as webcreds from './webcreds.js'
import * as personalinfo from './personalinfo.js'
import * as bookmarks from './bookmarks.js'
import * as wallets from './wallets.js'
import * as walletsTab from './wallets-tab.js'
import * as session from './session.js'
import * as store from './store.js'
import { createEncoder, createDecoder, QR_FRAME_MS } from './fountain.js'
import { qrSvg, openCamera, scanStream, scanReadout } from './qrtools.js'
import { masterKeyToCryptoKey } from './crypto.js'
import { formDialog, confirmDialog, askSecret, closeAllDialogs } from './dialogs.js'
import * as keypackage from './keypackage.js'
import * as uniVault from './linkedvault.js'
import * as vaultFile from './vaultfile.js'
import * as importFlow from './importflow.js'


const LOCK_ICON = '<svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><path d="M12 14.6v2.2"/></svg>'
const ARROW_UP_ICON = '<svg class="mini-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>'
const ARROW_DOWN_ICON = '<svg class="mini-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>'
const CHEVRON_ICON = '<svg class="group-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
const HIDDEN_SECRET = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'

function gateHtml(id, label) {
  return '<div class="gate"><button id="' + id + '">' + LOCK_ICON + label + '</button></div>'
}

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

function showLockOverlay() {
  if (!lockOverlay) return
  if (lockOverlay.classList.contains('hidden')) closeAllDialogs()
  lockOverlay.classList.remove('hidden')
}
function hideLockOverlay() { if (lockOverlay) lockOverlay.classList.add('hidden') }

async function unlockManagePage() {
  const mk = session.getMasterKey()
  if (mk) { hideLockOverlay(); return true }
  if (btnManageUnlockFp) btnManageUnlockFp.classList.toggle('hidden', !(await auth.initAuth()).hasFingerprint)
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
      try { await uniVault.reconnectAfterUnlock(result.masterKey) } catch (e) {}
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
      try { await uniVault.reconnectAfterUnlock(result.masterKey) } catch (e) {}
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
  if (restored) { hideLockOverlay() } else { showLockOverlay(); loginCredsUnlocked = false; webCredsUnlocked = false; personalInfoUnlocked = false; walletsTab.lock(); loadAllCredentials(); loadAllWebCredentials(); loadPersonalInfo() }
}
setInterval(checkAndShowLockOverlay, 5000)
session.onLock(() => { checkAndShowLockOverlay() })

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
    cardFp.classList.remove('active')
    statusFp.textContent = (await platformUnlockAvailable()) ? 'Not enrolled' : 'Not available in this browser'
  }
  if (btnManageUnlockFp) btnManageUnlockFp.classList.toggle('hidden', !status.hasFingerprint)
  applyEnrollBtn(btnEditFp, status.hasFingerprint)

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
    credentialsList.innerHTML = gateHtml('btn-unlock-creds', 'Unlock to view credentials')
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
    credentialsList.innerHTML = '<div class="gate gate-error">Could not open saved credentials with the current master key</div>'
    return
  }
  const domains = Object.keys(tree.credentials).filter((d) => tree.credentials[d].some((c) => !c.deleted)).sort()
  if (domains.length === 0) {
    credentialsList.innerHTML = '<div class="empty-note">No saved credentials</div>'
    return
  }

  credentialsList.innerHTML = ''

  for (const domain of domains) {
    const domainCreds = tree.credentials[domain].filter((c) => !c.deleted)
    
    const domainItem = document.createElement('div')
    domainItem.className = 'group'

    const domainHeader = document.createElement('div')
    domainHeader.className = 'credential-item'
    domainHeader.innerHTML =
      CHEVRON_ICON +
      '<div class="credential-domain">' + escapeHtml(domain) + '</div>' +
      '<div class="group-count">' + domainCreds.length + ' account' + (domainCreds.length !== 1 ? 's' : '') + '</div>'

    const domainContent = document.createElement('div')
    domainContent.className = 'group-body'

    domainHeader.onclick = () => { domainItem.classList.toggle('open') }
    
    for (let i = 0; i < domainCreds.length; i++) {
      const cred = domainCreds[i]
      const credRow = document.createElement('div')
      credRow.className = 'cred-row'
      credRow.innerHTML =
        '<div class="cred-main">' +
        '<select class="credential-logintype">' +
        '<option value="username">Username</option>' +
        '<option value="email">Email</option>' +
        '<option value="phone">Phone</option>' +
        '</select>' +
        '<div class="credential-username">Account ' + (i + 1) + '</div>' +
        '<div class="credential-password">' + HIDDEN_SECRET + '</div>' +
        '<div class="credential-actions">' +
        '<button class="small secondary btn-show">Show</button>' +
        '<button class="small secondary btn-edit">Edit</button>' +
        '<button class="small danger btn-delete">Delete</button>' +
        '</div>' +
        '</div>' +
        '<div class="credential-extra"></div>'

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
        const showBtn = credRow.querySelector('.btn-show')

        if (pwEl.textContent !== HIDDEN_SECRET) {
          pwEl.textContent = HIDDEN_SECRET
          usernameEl.textContent = 'Account ' + (i + 1)
          extraEl.classList.remove('open')
          extraEl.innerHTML = ''
          showBtn.textContent = 'Show'
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
            showBtn.textContent = 'Hide'
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
          if (credential && await confirmDialog({ title: 'Delete login', text: 'Delete the login for ' + credential.username + ' on ' + domain + '?', okLabel: 'Delete', danger: true })) {
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
  container.classList.add('open')
  container.innerHTML = ''
  const fields = credential.extraFields || []

  const used = document.createElement('div')
  used.className = 'extra-meta'
  used.textContent = credential.lastUsedAt ? 'Last used ' + new Date(credential.lastUsedAt).toLocaleString() : 'Last used: not recorded yet'
  container.appendChild(used)

  if (fields.length === 0) {
    const none = document.createElement('div')
    none.className = 'extra-meta'
    none.textContent = 'No additional fields saved'
    container.appendChild(none)
  }

  fields.forEach((field, idx) => {
    const row = document.createElement('div')
    row.className = 'extra-row'
    row.innerHTML =
      '<span class="extra-label">' + escapeHtml(field.label) + '</span>' +
      '<span class="extra-value">' + escapeHtml(field.value) + '</span>' +
      '<button class="small secondary btn-edit-extra">Edit</button>' +
      '<button class="small danger btn-delete-extra">Delete</button>'

    row.querySelector('.btn-edit-extra').onclick = async () => {
      const edited = await formDialog({ title: 'Edit ' + field.label, fields: [{ label: field.label, secret: true, value: field.value }], okLabel: 'Save' })
      if (!edited) return
      const newValue = edited[0]
      const updated = fields.map((f, i2) => i2 === idx ? { label: f.label, value: newValue } : f)
      const result = await passwords.updateCredential(credential.id, { extraFields: updated }, masterKey)
      if (result.success) { showMsg(msgManage, 'Updated', 'success'); loadAllCredentials() }
      else { showMsg(msgManage, 'Update failed: ' + result.error, 'error') }
    }

    row.querySelector('.btn-delete-extra').onclick = async () => {
      if (!(await confirmDialog({ title: 'Delete field', text: 'Delete "' + field.label + '" from this login?', okLabel: 'Delete', danger: true }))) return
      const updated = fields.filter((f, i2) => i2 !== idx)
      const result = await passwords.updateCredential(credential.id, { extraFields: updated }, masterKey)
      if (result.success) { showMsg(msgManage, 'Deleted', 'success'); loadAllCredentials() }
      else { showMsg(msgManage, 'Delete failed: ' + result.error, 'error') }
    }

    container.appendChild(row)
  })

  const addBtn = document.createElement('button')
  addBtn.className = 'small secondary extra-add'
  addBtn.textContent = 'Add Field'
  addBtn.onclick = async () => {
    const added = await formDialog({
      title: 'Add field',
      fields: [{ label: 'Field name', placeholder: 'Account Number' }, { label: 'Value', secret: true }],
      okLabel: 'Add',
      validate: (v) => (v[0].trim() ? { value: v } : { error: 'Enter a field name.', focus: 0 })
    })
    if (!added) return
    const label = added[0]
    const value = added[1]
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
    webCredsListEl.innerHTML = gateHtml('btn-unlock-webcreds', 'Unlock to view misc credentials')
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
    webCredsListEl.innerHTML = '<div class="empty-note">No misc credentials saved</div>'
    return
  }

  const categories = catResult.categories.sort()
  webCredsListEl.innerHTML = ''

  for (const category of categories) {
    const vaultData = await store.getWebCredsVault()
    const catCreds = (vaultData?.credentials?.[category] || []).filter(c => !c.deleted)

    const catItem = document.createElement('div')
    catItem.className = 'group'

    const catHeader = document.createElement('div')
    catHeader.className = 'credential-item'
    catHeader.innerHTML =
      CHEVRON_ICON +
      '<div class="credential-domain">' + escapeHtml(category) + '</div>' +
      '<div class="group-count">' + catCreds.length + ' item' + (catCreds.length !== 1 ? 's' : '') + '</div>'

    const catContent = document.createElement('div')
    catContent.className = 'group-body'

    catHeader.onclick = () => { catItem.classList.toggle('open') }

    for (const cred of catCreds) {
      const row = document.createElement('div')
      row.className = 'cred-row cred-main'
      row.innerHTML =
        '<div class="credential-username">Item</div>' +
        '<div class="credential-password">' + HIDDEN_SECRET + '</div>' +
        '<div class="credential-actions">' +
        '<button class="small secondary btn-show">Show</button>' +
        '<button class="small secondary btn-edit">Edit</button>' +
        '<button class="small danger btn-delete">Delete</button>' +
        '</div>'

      const nameEl = row.querySelector('.credential-username')
      const valueEl = row.querySelector('.credential-password')
      nameEl.textContent = 'Item'

      row.querySelector('.btn-show').onclick = async (e) => {
        e.stopPropagation()
        const showBtn = row.querySelector('.btn-show')
        if (valueEl.textContent !== HIDDEN_SECRET) {
          valueEl.textContent = HIDDEN_SECRET
          nameEl.textContent = 'Item'
          showBtn.textContent = 'Show'
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
          if (item) { nameEl.textContent = item.name; valueEl.textContent = item.value; showBtn.textContent = 'Hide' }
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
        const newValue = await askSecret('Edit value', 'New value', 'The name stays the same. A different name is a separate item.')
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
        if (await confirmDialog({ title: 'Delete item', text: 'Delete "' + label + '" from ' + category + '?', okLabel: 'Delete', danger: true })) {
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
    const entered = await formDialog({
      title: 'Add misc credential',
      fields: [{ label: 'Category', placeholder: 'Wi-Fi' }, { label: 'Name', placeholder: 'Home Router' }, { label: 'Value', secret: true }],
      okLabel: 'Save',
      validate: (v) => {
        if (!v[0].trim()) return { error: 'Enter a category.', focus: 0 }
        if (!v[1].trim()) return { error: 'Enter a name.', focus: 1 }
        if (!v[2]) return { error: 'Enter a value.', focus: 2 }
        return { value: v }
      }
    })
    if (!entered) return
    const category = entered[0]
    const name = entered[1]
    const value = entered[2]
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
    personalInfoContent.innerHTML = gateHtml('btn-unlock-personalinfo', 'Unlock to view Personal Info')
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
  if (!result.success) { personalInfoContent.innerHTML = '<div class="gate gate-error">' + escapeHtml(result.error) + '</div>'; return }
  const p = result.profile

  var html = '<div class="pi-section"><div class="pi-heading">Name and Phone</div>'
  html += fieldRow('First Name', p.firstName, 'firstName')
  html += fieldRow('Last Name', p.lastName, 'lastName')
  html += fieldRow('Phone', p.phone, 'phone')
  html += '</div>'

  html += '<div class="pi-section"><div class="pi-heading">Emails</div>'
  if (!p.emails || p.emails.length === 0) {
    html += '<div class="pi-empty">No emails saved.</div>'
  } else {
    const sorted = p.emails.slice().sort((a, b) => a.position - b.position)
    sorted.forEach(function (e, i) {
      html += '<div class="pi-row">'
      html += '<span class="pi-value">' + escapeHtml(e.value) + (i === 0 ? ' <span class="pi-badge">Primary</span>' : '') + '</span>'
      html += '<span class="pi-actions">'
      html += '<button class="small secondary icon-only" title="Move up" aria-label="Move up" data-email-up="' + e.id + '"' + (i === 0 ? ' disabled' : '') + '>' + ARROW_UP_ICON + '</button>'
      html += '<button class="small secondary icon-only" title="Move down" aria-label="Move down" data-email-down="' + e.id + '"' + (i === sorted.length - 1 ? ' disabled' : '') + '>' + ARROW_DOWN_ICON + '</button>'
      html += '<button class="small danger" data-email-del="' + e.id + '">Delete</button>'
      html += '</span></div>'
    })
  }
  html += '<div class="pi-foot"><button class="small" id="btn-add-email">Add Email</button></div></div>'

  html += '<div class="pi-section"><div class="pi-heading">Address</div>'
  html += fieldRow('Street', p.address && p.address.street, 'address.street')
  html += fieldRow('City', p.address && p.address.city, 'address.city')
  html += fieldRow('State', p.address && p.address.state, 'address.state')
  html += fieldRow('ZIP', p.address && p.address.zip, 'address.zip')
  html += fieldRow('Country', p.address && p.address.country, 'address.country')
  html += '</div>'

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

const PERSONAL_INFO_LABELS = { firstName: 'First Name', lastName: 'Last Name', phone: 'Phone', 'address.street': 'Street', 'address.city': 'City', 'address.state': 'State', 'address.zip': 'ZIP', 'address.country': 'Country' }

function fieldRow(label, value, fieldKey) {
  return '<div class="pi-row">' +
    '<span class="pi-label">' + label + '</span>' +
    (value ? '<span class="pi-value">' + escapeHtml(value) + '</span>' : '<span class="pi-value pi-unset">Not set</span>') +
    '<span class="pi-actions"><button class="small secondary" data-edit-field="' + fieldKey + '">Edit</button></span>' +
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
  const edited = await formDialog({ title: 'Edit ' + (PERSONAL_INFO_LABELS[fieldKey] || 'field'), fields: [{ label: PERSONAL_INFO_LABELS[fieldKey] || 'New value', value: currentValue }], okLabel: 'Save' })
  if (!edited) return
  const newValue = edited[0]

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

  const entered = await formDialog({ title: 'Add email', fields: [{ label: 'Email address', placeholder: 'you@example.com' }], okLabel: 'Add' })
  if (!entered || !entered[0].trim()) return
  const email = entered[0].trim()

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

  if (!(await confirmDialog({ title: 'Delete email', text: 'Delete this email from Personal Info?', okLabel: 'Delete', danger: true }))) return

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

async function requirePasswordFirstAuth() {
  const status = await auth.initAuth()
  if (!status.hasPassword) return requireFreshAuth()
  const pw = await askSecret('Unlock', 'Master password', 'Enter your master password to change fingerprint unlock.')
  if (!pw) return null
  const result = await auth.authenticatePassword(pw)
  if (!result.success) return null
  session.setMasterKey(result.masterKey)
  return result.masterKey
}

async function requireTransferAuth() {
  const status = await auth.initAuth()
  if (status.isNew) return true
  if (await requireFreshAuth()) return true
  syncMsg('Authentication required', 'error')
  return false
}

btnEditFp.onclick = async () => {
  const mk = await requirePasswordFirstAuth()
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
  if (!(await requirePasswordFirstAuth())) { showMsg(msgManage, 'Authentication required', 'error'); return }
  if (await confirmDialog({ title: 'Delete fingerprint unlock', text: 'Turn off fingerprint and device PIN unlock on this browser?', okLabel: 'Delete', danger: true })) {
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
  if (await confirmDialog({ title: 'Delete password unlock', text: 'Turn off master password unlock on this browser?', okLabel: 'Delete', danger: true })) {
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
  const confirm1 = await confirmDialog({
    title: 'Clear Vault',
    text: 'Delete all vault data permanently?\n\nRecommendation: Back up to another device first.\n\nThis cannot be undone.',
    okLabel: 'Delete everything',
    danger: true
  })

  if (!confirm1) return

  const confirm2 = await confirmDialog({ title: 'Final confirmation', text: 'This will delete everything. Continue?', okLabel: 'Clear Vault', danger: true })

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
const SCAN_READOUT_MS = 1000
const SHARE_QR_MIN_PX = 320
const SHARE_QR_VIEW_MARGIN_PX = 110
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
      if (msgEl) { msgEl.textContent = 'Key and vault renamed. Files you export from now on use the new name.'; msgEl.style.color = 'var(--green)' }
    } catch (e) {
      if (msgEl) { msgEl.textContent = 'Rename failed'; msgEl.style.color = 'var(--danger)' }
      return
    }
    const vaultMoved = await offerLinkedRename(name, msgEl)
    await offerExportAfterRename(name, msgEl, vaultMoved)
  }

  attachActivityListeners()
}



const msgSync = document.getElementById('msg-sync')

function syncMsg(t, kind) { showMsg(msgSync, t, kind || 'success') }


async function getQrTimeoutSeconds() {
  try { const a = await store.getAuth() || {}; if (a.qrStreamTimeout) return a.qrStreamTimeout } catch (e) {}
  return 30
}


let shareFountainTimer = null, shareCountdownTimer = null, shareShutoffTimer = null, shareToken = null
function stopShareFountain() {
  shareToken = null
  if (shareFountainTimer) { clearInterval(shareFountainTimer); shareFountainTimer = null }
  if (shareCountdownTimer) { clearInterval(shareCountdownTimer); shareCountdownTimer = null }
  if (shareShutoffTimer) { clearTimeout(shareShutoffTimer); shareShutoffTimer = null }
  const c = document.getElementById('share-qr'); if (c) c.innerHTML = ''
}
function sizeShareQr() {
  const wrap = document.getElementById('share-qr-wrap')
  if (!wrap || wrap.classList.contains('hidden') || !wrap.parentElement) return
  const fit = Math.min(wrap.parentElement.clientWidth, window.innerHeight - SHARE_QR_VIEW_MARGIN_PX)
  wrap.style.maxWidth = Math.max(SHARE_QR_MIN_PX, fit) + 'px'
}

async function streamShare(payload, label) {
  stopShareFountain()
  const token = {}
  shareToken = token
  const wrap = document.getElementById('share-qr-wrap')
  const container = document.getElementById('share-qr')
  const labelEl = document.getElementById('share-qr-label')
  const timerEl = document.getElementById('share-qr-timer')
  if (!container) return
  const encoder = await createEncoder(payload)
  const seconds = await getQrTimeoutSeconds()
  if (shareToken !== token) return
  if (labelEl) labelEl.textContent = label
  if (wrap) wrap.classList.remove('hidden')
  sizeShareQr()
  window.addEventListener('resize', sizeShareQr)
  function renderNext() {
    container.innerHTML = qrSvg(encoder.nextFrame())
  }
  renderNext()
  if (wrap) wrap.scrollIntoView({ block: 'center' })
  shareFountainTimer = setInterval(renderNext, QR_FRAME_MS)
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
  window.removeEventListener('resize', sizeShareQr)
  const wrap = document.getElementById('share-qr-wrap')
  if (wrap) wrap.classList.add('hidden')
}

const _btnShareVault = document.getElementById('btn-share-vault'); if (_btnShareVault) _btnShareVault.onclick = async function () {
  if (!session.getMasterKey()) { syncMsg('Unlock your vault first', 'error'); return }
  if (!(await requireTransferAuth())) return
  const payload = vaultFile.payloadFromBundle(await vaultFile.buildBundle())
  if (!payload.vault && !payload.webcreds && !payload.personalInfo && !payload.bookmarks) { syncMsg('Nothing to sync yet', 'error'); return }
  streamShare(JSON.stringify(payload), 'Scan this with your other device to receive your logins, misc credentials, personal info, and bookmarks')
}
const _btnShareKey = document.getElementById('btn-share-key'); if (_btnShareKey) _btnShareKey.onclick = async function () {
  if (!session.getMasterKey()) { syncMsg('Unlock your vault first', 'error'); return }
  if (!(await requireTransferAuth())) return
  const mk = session.getMasterKey()
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

async function offerLinkedRename(name, msgEl) {
  if (!uniVault.uniVaultSupported()) return false
  const linked = await uniVault.getLink()
  const wanted = backupFileName(name)
  if (!linked || linked.name === wanted) return false
  const choice = await formDialog({
    title: 'Rename your Uni-Vault file too?',
    text: 'This browser is linked to ' + linked.name + '. Save the vault as ' + wanted + ' and link to it instead? Browsers cannot rename a file in place, so the old file stays where it is. Once your other browsers are linked to the new file, delete the old one.',
    okLabel: 'Save under the new name',
    cancelLabel: 'Keep the old file'
  })
  if (!choice) return false
  const mk = session.getMasterKey()
  if (!mk) { if (msgEl) { msgEl.textContent = 'Unlock first to save the vault under the new name.'; msgEl.style.color = 'var(--danger)' } return false }
  let handle
  try { handle = await window.showSaveFilePicker({ suggestedName: wanted, startIn: linked.handle, types: VAULT_FILE_TYPES }) } catch (e) { return false }
  if (!(await requireTransferAuth())) return false
  const result = await uniVault.linkNew(handle, mk)
  if (result.state === 'ok') {
    if (msgEl) {
      msgEl.textContent = 'Uni-Vault now uses ' + handle.name + '. In your other browsers, use Import Vault in Sync, pick ' + handle.name + ', and link it. Then delete ' + linked.name + '.'
      msgEl.style.color = 'var(--green)'
    }
    return true
  }
  if (msgEl) {
    msgEl.textContent = result.message || 'Could not link the new file.'
    msgEl.style.color = 'var(--danger)'
  }
  return false
}

function keyFileName(nickname) {
  return ((nickname || 'master-key').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'master-key') + '.vaultkey'
}

function renameMsg(msgEl, text, ok) {
  if (!msgEl) return
  msgEl.textContent = text
  msgEl.style.color = ok ? 'var(--green)' : 'var(--danger)'
}

async function offerExportAfterRename(name, msgEl, vaultMoved) {
  const mk = session.getMasterKey()
  if (!mk) return
  const keyName = keyFileName(name)
  const vaultName = backupFileName(name)
  const both = !vaultMoved
  const choice = await formDialog({
    title: both ? 'Export Key and Vault now with the new name?' : 'Export Key now with the new name?',
    text: (both
      ? 'Your saved files keep their old names and still open. Export now to save ' + keyName + ' and ' + vaultName + ' to your downloads.'
      : 'Your vault file already uses the new name. Export now to save ' + keyName + ' to your downloads. Your old key file still opens.') +
      ' You confirm once with your fingerprint, device PIN, or password.',
    okLabel: both ? 'Export both' : 'Export key',
    cancelLabel: 'Not now'
  })
  if (!choice) { renameMsg(msgEl, 'Key and vault renamed. Your saved files keep their old names and still open. Export any time to get files with the new name.', true); return }
  if (!(await requireTransferAuth())) { renameMsg(msgEl, 'Export cancelled. The rename is saved, and nothing was exported.', false); return }
  renameMsg(msgEl, 'Saving ' + keyName + '...', true)
  let pkg
  try { pkg = await ensureKeyPackage(mk) } catch (e) { renameMsg(msgEl, 'Could not export the key: ' + (e && e.message ? e.message : e), false); return }
  if (!pkg) { renameMsg(msgEl, 'Key export cancelled. The rename is saved, and nothing was exported.', false); return }
  if (!downloadFile(keyName, JSON.stringify(pkg))) { renameMsg(msgEl, 'Could not save ' + keyName + '. Nothing was exported.', false); return }
  if (!both) { renameMsg(msgEl, 'Saved ' + keyName + ' to your downloads. Keep the file, passphrase, and answers safe. Delete the old key file once you no longer need it.', true); return }
  renameMsg(msgEl, 'Saved ' + keyName + '. Saving ' + vaultName + '...', true)
  const bundle = await vaultFile.buildBundle()
  if (!vaultFile.bundleHasData(bundle)) { renameMsg(msgEl, 'Saved ' + keyName + ' to your downloads. The vault is empty, so there was no vault file to save.', true); return }
  if (!downloadFile(vaultName, JSON.stringify(bundle))) { renameMsg(msgEl, 'Saved ' + keyName + ', but could not save ' + vaultName + '. Use Export Vault in Sync to try again.', false); return }
  renameMsg(msgEl, 'Saved ' + keyName + ' and ' + vaultName + ' to your downloads. Both stay encrypted. Your old files still open, so delete them once you no longer need them.', true)
}

function backupFileName(nickname) {
  const safeName = nickname ? '-' + nickname.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-') : ''
  return 'valid-vault-backup' + safeName + '.vault'
}

const VAULT_FILE_TYPES = [{ description: 'Valid Vault vault', accept: { 'application/json': ['.vault'] } }]

const _btnExportVault = document.getElementById('btn-export-vault'); if (_btnExportVault) _btnExportVault.onclick = async function () {
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock first', 'error'); return }
  const bundle = await vaultFile.buildBundle()
  if (!vaultFile.bundleHasData(bundle)) { syncMsg('Nothing to export yet', 'error'); return }
  let nickname = ''
  try { const a = await store.getAuth() || {}; nickname = (a.keyNickname || '').trim() } catch (e) {}
  const fname = backupFileName(nickname)
  if (!uniVault.uniVaultSupported()) {
    if (!(await requireTransferAuth())) return
    if (downloadFile(fname, JSON.stringify(bundle))) syncMsg('Vault exported. It stays encrypted, useless without your master key.', 'success')
    else syncMsg('Could not save the file', 'error')
    return
  }
  let handle
  try { handle = await window.showSaveFilePicker({ suggestedName: fname, types: VAULT_FILE_TYPES }) } catch (e) {
    syncMsg('Export cancelled. Nothing was saved.', 'error')
    return
  }
  if (!(await requireTransferAuth())) return
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
    const bundle = vaultFile.parseBundle(text)
    const mk = session.getMasterKey()
    if (!mk) { syncMsg('Unlock first', 'error'); return }
    const result = await vaultFile.mergeBundle(bundle, mk)
    syncMsg(vaultFile.describeMerge(result), 'success')
    if (result.changed) refreshAfterSync()
  } catch (e) { syncMsg('Import failed: ' + (e && e.message ? e.message : e), 'error') }
}

const _btnImportPasswords = document.getElementById('btn-import-passwords'); if (_btnImportPasswords) _btnImportPasswords.onclick = async function () {
  const result = await importFlow.runPasswordImport({ masterKey: session.getMasterKey(), authorize: requireTransferAuth, notify: syncMsg })
  if (result && result.changed) refreshAfterSync()
}

const _btnImportBookmarks = document.getElementById('btn-import-bookmarks'); if (_btnImportBookmarks) _btnImportBookmarks.onclick = async function () {
  await importFlow.runBookmarkImport({ masterKey: session.getMasterKey(), authorize: requireTransferAuth, notify: syncMsg })
}

const BOOKMARK_PERMISSION = { permissions: ['bookmarks'] }

async function readThisBrowserBookmarks() {
  let granted = false
  try { granted = await chrome.permissions.request(BOOKMARK_PERMISSION) } catch (e) { granted = false }
  if (!granted) return null
  try { return await chrome.bookmarks.getTree() } finally {
    try { await chrome.permissions.remove(BOOKMARK_PERMISSION) } catch (e) {}
  }
}

const _btnImportBrowserBookmarks = document.getElementById('btn-import-browser-bookmarks'); if (_btnImportBrowserBookmarks) _btnImportBrowserBookmarks.onclick = async function () {
  if (!session.getMasterKey()) { syncMsg('Unlock first', 'error'); return }
  let tree = null
  try { tree = await readThisBrowserBookmarks() } catch (e) { syncMsg('This browser\'s bookmarks could not be read.', 'error'); return }
  if (!tree) { syncMsg('Import cancelled. Valid Vault needs your permission to read this browser\'s bookmarks. Nothing changed.', 'info'); return }
  await importFlow.runBrowserBookmarkImport({ masterKey: session.getMasterKey(), authorize: requireTransferAuth, notify: syncMsg, tree })
}

const _btnImportVault = document.getElementById('btn-import-vault'); if (_btnImportVault) _btnImportVault.onclick = async function () {
  if (!uniVault.uniVaultSupported()) {
    readFileText(async function (text) {
      if (!text) { syncMsg('No file selected', 'error'); return }
      if (!(await requireTransferAuth())) return
      importVaultText(text)
    })
    return
  }
  const mk = session.getMasterKey()
  if (!mk) { syncMsg('Unlock first', 'error'); return }
  let handle
  try { [handle] = await window.showOpenFilePicker({ types: VAULT_FILE_TYPES, multiple: false }) } catch (e) {
    syncMsg('No file selected', 'error')
    return
  }
  if (!(await requireTransferAuth())) return
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
    const lost = await uniVault.getLostLinkName()
    uniVaultStatusEl.textContent = lost
      ? 'This browser lost its link to ' + lost + '. Your vault is still here. Click Import Vault and pick ' + lost + ' to link it again.'
      : 'Not linked. Export Vault or Import Vault to link a vault file.'
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
  if (!(await confirmDialog({ title: 'Unlink vault file', text: 'Unlink this browser from the vault file? This browser keeps its own copy of everything. The file is not deleted.', okLabel: 'Unlink' }))) return
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
  const newKey = !(await keypackage.isSameKey(session.getMasterKey(), importedKey))
  const adopted = await adoptImportedKey(importedKey)
  if (adopted) {
    try { await keypackage.savePackage(importedKey, pkg, newKey) } catch (e) {}
    const nickInput = document.getElementById('key-nickname-input')
    if (nickInput) nickInput.value = await keypackage.getNickname()
  }
}

const _btnExportKey = document.getElementById('btn-export-key'); if (_btnExportKey) _btnExportKey.onclick = async function () {
  if (!session.getMasterKey()) { syncMsg('Unlock first', 'error'); return }
  if (!(await requireTransferAuth())) return
  const mk = session.getMasterKey()
  try {
    const pkg = await ensureKeyPackage(mk)
    if (!pkg) return
    const fname = keyFileName(await keypackage.getNickname())
    if (downloadFile(fname, JSON.stringify(pkg))) syncMsg('Key exported. Keep the file, passphrase, and answers safe.', 'success')
    else syncMsg('Could not save the file', 'error')
  } catch (e) { syncMsg('Export failed: ' + (e && e.message ? e.message : e), 'error') }
}
const _btnImportKey = document.getElementById('btn-import-key'); if (_btnImportKey) _btnImportKey.onclick = function () {
  readFileText(async function (text) {
    if (!text) { syncMsg('No file selected', 'error'); return }
    let fileObj = null
    try { fileObj = JSON.parse(text) } catch (e) { syncMsg('Could not read the file', 'error'); return }
    const keyProblem = keypackage.keyFileProblem(fileObj)
    if (keyProblem) { syncMsg(keyProblem, 'error'); return }
    if (!(await requireTransferAuth())) return
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

function passwordMeetsRule(pw) {
  return !!pw && pw.length >= 12 && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw) && /[^a-zA-Z0-9]/.test(pw)
}

async function clearLocalVaultData() {
  await store.clearVaultData()
}

async function choosePasswordForImport(status) {
  if (status.hasPassword) {
    const current = await askSecret('Confirm key import', 'This browser\'s master password', 'Enter this browser\'s master password to unlock the imported key here. The password stays on this browser and is never put in a key file.')
    if (!current) { syncMsg('Key import cancelled. Nothing changed.', 'error'); return null }
    const check = await auth.authenticatePassword(current)
    if (!check.success) { syncMsg('Wrong password. Key import cancelled, nothing changed.', 'error'); return null }
    if (passwordMeetsRule(current)) return current
  }
  const fresh = await askSecret('Set a master password', 'New master password', 'Set a master password to unlock the imported key on this browser: 12+ characters with a letter, a number, and a symbol. It stays on this browser and is never put in a key file.')
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
    text: 'Choose how this browser unlocks the imported key. Fingerprint or device PIN is recommended: the unlock secret stays in secure hardware on this device, so nothing saved in the browser can be guessed at. A password works on any device, but anyone who copies your browser data can try guessing it offline.',
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

async function planBackupPassword(status) {
  if (!status.hasPassword) return { password: null, removePassword: false }
  const keep = await confirmDialog({
    title: 'Keep a backup password?',
    text: 'Keep a master password on this browser as a backup unlock?\n\nKeep a password: set the password for the imported key (you can reuse this browser\'s current password).\nTurn it off: password unlock is off. You can add one later in Manage.',
    okLabel: 'Keep a password',
    cancelLabel: 'Turn it off'
  })
  if (keep) {
    const pw = await askSecret('Backup password', 'Master password', 'Set a backup password to unlock the imported key on this browser: 12+ characters with a letter, a number, and a symbol. It stays on this browser and is never put in a key file.')
    if (pw && passwordMeetsRule(pw)) return { password: pw, removePassword: false }
  }
  return { password: null, removePassword: true }
}

async function planRelink(status) {
  if (!status.hasFingerprint) return false
  return confirmDialog({
    title: 'Relink fingerprint unlock?',
    text: 'Relink fingerprint unlock to the imported key? You will be asked for your fingerprint or device PIN. Turn it off leaves fingerprint unlock off until you re-enroll it in Manage.',
    okLabel: 'Relink fingerprint',
    cancelLabel: 'Turn it off'
  })
}

async function relinkFingerprint(importedKey) {
  const rewrapped = await auth.rewrapFingerprint(importedKey)
  if (rewrapped.success) return true
  try {
    auth.startFingerprintEnrollment()
    const fp = await auth.enrollFingerprint(importedKey)
    return !!fp.success
  } catch (e) {
    return false
  }
}

async function savePasswordWrap(password, importedKey) {
  auth.startPasswordCreation()
  return auth.setPassword(password, importedKey)
}

async function commitDeviceLock(importedKey, status, backup) {
  if (!(await lockWithDevice(importedKey, status))) return { locked: false }
  if (backup.password) {
    const result = await savePasswordWrap(backup.password, importedKey)
    if (result.success) return { locked: true, note: '' }
    await auth.removePassword()
    return { locked: true, note: ' The backup password could not be saved, so password unlock is off until you set one in Manage.' }
  }
  if (backup.removePassword) {
    await auth.removePassword()
    return { locked: true, note: ' Password unlock is off on this browser until you set one in Manage.' }
  }
  return { locked: true, note: '' }
}

async function commitPasswordLock(importedKey, status, password, relink) {
  const relinked = relink ? await relinkFingerprint(importedKey) : false
  const result = await savePasswordWrap(password, importedKey)
  if (!result.success) {
    if (relinked) await auth.removeFingerprint()
    return { success: false, error: result.error }
  }
  if (status.hasFingerprint && !relinked) {
    await auth.removeFingerprint()
    return { success: true, note: ' Fingerprint unlock is off until you re-enroll it in Manage.' }
  }
  return { success: true, note: '' }
}

async function adoptImportedKey(importedKey) {
  const matches = await vaultFile.localVaultOpensWith(importedKey)
  const currentKey = session.getMasterKey()
  const holdsData = !matches && (!currentKey || await vaultFile.localVaultHasLiveData(currentKey))
  if (holdsData) {
    const proceed = await confirmDialog({
      title: 'Replace this browser\'s vault?',
      text: 'This browser\'s current vault was made with a different master key.\n\n' +
        'Importing this key makes that vault unusable, so it will be cleared from this browser.\n\n' +
        'This is how you get ready to receive the vault from your other device: import the key first, then import or scan the vault.\n\n' +
        'Continue?',
      okLabel: 'Import key',
      danger: true
    })
    if (!proceed) { syncMsg('Key import cancelled. Nothing changed.', 'error'); return false }
  }

  const status = await auth.initAuth()
  let method = await chooseImportLock()
  if (!method) { syncMsg('Key import cancelled. Nothing changed.', 'error'); return false }

  let note = ''
  if (method === 'device') {
    const backup = await planBackupPassword(status)
    const device = await commitDeviceLock(importedKey, status, backup)
    if (device.locked) {
      note = device.note
    } else {
      if (!(await confirmDialog({ title: 'Use a master password?', text: 'Fingerprint or device PIN did not complete. Lock the imported key with a master password instead?', okLabel: 'Use a password' }))) {
        syncMsg('Key import cancelled. Nothing changed.', 'error')
        return false
      }
      method = 'password'
    }
  }

  if (method === 'password') {
    const password = await choosePasswordForImport(status)
    if (!password) return false
    const relink = await planRelink(status)
    const locked = await commitPasswordLock(importedKey, status, password, relink)
    if (!locked.success) { syncMsg('Could not save the imported key: ' + locked.error, 'error'); return false }
    note = locked.note
  }

  if (!matches) await clearLocalVaultData()

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
  let settled = false, stream = null, reader = null, ticker = null
  const origHtml = box.innerHTML
  box.innerHTML = ''
  const video = document.createElement('video'); video.setAttribute('playsinline', 'true'); video.muted = true
  video.style.cssText = 'width:100%;height:100%;object-fit:cover;'
  const cancel = document.createElement('button'); cancel.textContent = 'Cancel'
  cancel.className = 'small'
  cancel.style.cssText = 'position:absolute;top:8px;left:8px;z-index:3;'
  const status = document.createElement('div'); status.style.cssText = 'position:absolute;bottom:8px;left:0;right:0;text-align:center;color:#fff;font-size:12px;z-index:3;text-shadow:0 0 4px #000;'
  status.textContent = 'Point at the other device'
  box.appendChild(video); box.appendChild(cancel); box.appendChild(status)
  function cleanup() {
    settled = true
    setTimeout(function () { scanActive = false }, 400)
    if (reader) { reader.stop(); reader = null }
    if (ticker) { clearInterval(ticker); ticker = null }
    try { if (stream) { stream.getTracks().forEach(function (t) { t.stop() }); stream = null } } catch (e) {}
    try { video.pause(); video.srcObject = null } catch (e) {}
    box.innerHTML = origHtml
  }
  cancel.onclick = function (e) { if (e) { e.stopPropagation(); e.preventDefault() } cleanup(); syncMsg('Scan cancelled', 'success') }
  try {
    stream = await openCamera()
    if (settled) { stream.getTracks().forEach(function (t) { t.stop() }); stream = null; return }
    video.srcObject = stream; await video.play()
    let last = null
    reader = scanStream(video, function () { return new Worker('scanworker.js') }, function (frame) {
      if (settled) return
      const outcome = decoder.addFrame(frame)
      if (!outcome.success) return
      last = outcome
      status.textContent = scanReadout(outcome, reader)
      if (!outcome.complete) return
      cleanup()
      syncMsg('Received ' + outcome.total + ' of ' + outcome.total + ', importing...', 'success')
      decoder.assemble().then(function (assembled) {
        if (!assembled.success) { syncMsg('Import failed: ' + assembled.error, 'error'); return }
        handleImported(assembled.payload)
      })
    })
    ticker = setInterval(function () { if (!settled && last) status.textContent = scanReadout(last, reader) }, SCAN_READOUT_MS)
  } catch (e) { cleanup(); syncMsg('Camera failed: ' + (e && e.message ? e.message : e), 'error') }
}

async function handleImported(payloadText) {
  try {
    const data = JSON.parse(payloadText)
    if (data.kind === 'keyfile') {
      if (!keypackage.isKeyPackage(data.key)) { syncMsg('That key code is damaged or incomplete. Scan it again.', 'error'); return }
      if (!(await requireTransferAuth())) return
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
      if (!(await requireTransferAuth())) return
      const result = await vaultFile.mergeBundle(vaultFile.bundleFromPayload(data), session.getMasterKey())
      syncMsg(vaultFile.describeMerge(result), 'success')
      if (result.changed) refreshAfterSync()
      return
    }
    syncMsg('Unrecognized code', 'error')
  } catch (e) { syncMsg('Sync failed: ' + (e && e.message ? e.message : e), 'error') }
}

init()
