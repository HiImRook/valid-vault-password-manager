import * as auth from './auth.js'
import * as uniVault from './linkedvault.js'

const btnFingerprint = document.getElementById('btn-fingerprint')
const btnPassword = document.getElementById('btn-password')
const btnEye = document.getElementById('btn-eye')
const btnCancel = document.getElementById('btn-cancel')
const inputPassword = document.getElementById('input-password')
const msg = document.getElementById('msg')
const siteEl = document.getElementById('site')
const unlockBox = document.getElementById('unlock-box')
const reconnectBox = document.getElementById('reconnect-box')
const btnReconnect = document.getElementById('btn-reconnect')
const btnReconnectSkip = document.getElementById('btn-reconnect-skip')

let busy = false

function showMsg(text, isError) {
  msg.textContent = text
  msg.className = 'msg' + (isError ? ' error' : '')
}

function showSite() {
  const site = new URLSearchParams(location.search).get('site') || ''
  siteEl.textContent = ''
  if (!site) { siteEl.textContent = 'Unlock to continue'; return }
  siteEl.append('Unlock requested by ')
  const b = document.createElement('b')
  b.textContent = site
  siteEl.append(b)
}

async function finish(masterKey) {
  const bytes = new Uint8Array(await crypto.subtle.exportKey('raw', masterKey))
  const result = await chrome.runtime.sendMessage({ action: 'persistSessionKey', masterKeyBytes: Array.from(bytes) })
  if (!result || !result.success) { showMsg('Unlocked, but the session could not be started. Try again.', true); return }
  let link = null
  try { link = await uniVault.reconnectAfterUnlock(masterKey) } catch (e) {}
  if (link && link.state === 'needs-permission') { offerReconnect(masterKey); return }
  showMsg('Unlocked')
  window.close()
}

function offerReconnect(masterKey) {
  unlockBox.classList.add('hidden')
  btnCancel.classList.add('hidden')
  reconnectBox.classList.remove('hidden')
  showMsg('')
  btnReconnect.onclick = async () => {
    let result = null
    try { result = await uniVault.reconnect(masterKey) } catch (e) {}
    if (result && result.state === 'ok') { showMsg('Vault file reconnected.'); window.close(); return }
    showMsg(result && result.message ? result.message : 'Could not reconnect the vault file. Try again from Sync in Manage.', true)
  }
  btnReconnectSkip.onclick = () => window.close()
}

async function unlockFingerprint() {
  if (busy) return
  busy = true
  showMsg('Waiting for fingerprint or device PIN...')
  try {
    const result = await auth.authenticateFingerprint()
    if (result.success) { await finish(result.masterKey); return }
    showMsg('Fingerprint did not unlock. Use your master password.', true)
    inputPassword.focus()
  } finally {
    busy = false
  }
}

async function unlockPassword() {
  if (busy) return
  const pw = inputPassword.value
  if (!pw) { showMsg('Enter your master password.', true); inputPassword.focus(); return }
  busy = true
  showMsg('Unlocking...')
  try {
    const result = await auth.authenticatePassword(pw)
    if (result.success) { await finish(result.masterKey); return }
    inputPassword.value = ''
    showMsg(result.error === 'Invalid password' ? 'Wrong password. Try again.' : result.error, true)
    inputPassword.focus()
  } finally {
    busy = false
  }
}

btnFingerprint.onclick = unlockFingerprint
btnPassword.onclick = unlockPassword
inputPassword.onkeydown = (e) => { if (e.key === 'Enter') unlockPassword() }
btnEye.onclick = () => {
  const show = inputPassword.type === 'password'
  inputPassword.type = show ? 'text' : 'password'
  btnEye.style.color = show ? 'var(--green)' : ''
  inputPassword.focus()
}
btnCancel.onclick = () => window.close()

async function init() {
  showSite()
  const status = await auth.initAuth()
  if (!status.hasFingerprint && !status.hasPassword) {
    showMsg('Set up Valid Vault from the extension icon first.', true)
    return
  }
  if (status.hasFingerprint) {
    btnFingerprint.classList.remove('hidden')
    unlockFingerprint()
  } else {
    inputPassword.focus()
  }
}

init()
