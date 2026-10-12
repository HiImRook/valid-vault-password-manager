import { masterKeyToCryptoKey } from '../extension/crypto.js'

const ALIAS_A = 'valid_vault_biometric_key_a'
const ALIAS_B = 'valid_vault_biometric_key_b'
const FILE_ACCEPT = '.vaultkey,.vault,application/json,application/octet-stream,text/plain'
const CACHE_DIRECTORY = 'CACHE'

function plugin(name) {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) return window.Capacitor.Plugins[name]
  } catch (e) {}
  return null
}

function isNative() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) } catch (e) { return false }
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(text) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function errorCode(e) {
  if (!e) return 'failed'
  if (e.code) return String(e.code)
  if (e.data && e.data.code) return String(e.data.code)
  return 'failed'
}

function errorMessage(e) {
  return e && e.message ? e.message : String(e || 'Fingerprint failed')
}

async function biometricAvailable() {
  const bv = plugin('BiometricVault')
  if (!bv) return false
  try {
    const r = await bv.isAvailable()
    return !!(r && r.available)
  } catch (e) {
    return false
  }
}

function nextAlias(record) {
  return record && record.alias === ALIAS_A ? ALIAS_B : ALIAS_A
}

async function biometricEnroll(masterKey, currentRecord) {
  const bv = plugin('BiometricVault')
  if (!bv) return { success: false, code: 'unavailable', error: 'Fingerprint is not available on this device.' }
  try {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', masterKey))
    const alias = nextAlias(currentRecord)
    const r = await bv.enroll({ masterKey: bytesToBase64(raw), alias })
    raw.fill(0)
    return { success: true, record: { wrapped: r.wrapped, iv: r.iv, alias: r.alias || alias } }
  } catch (e) {
    return { success: false, code: errorCode(e), error: errorMessage(e) }
  }
}

async function biometricUnlock(record) {
  const bv = plugin('BiometricVault')
  if (!bv) return { success: false, code: 'unavailable', error: 'Fingerprint is not available on this device.' }
  if (!record || !record.wrapped || !record.iv) return { success: false, code: 'missing', error: 'No fingerprint is enrolled.' }
  try {
    const args = { wrapped: record.wrapped, iv: record.iv }
    if (record.alias) args.alias = record.alias
    const r = await bv.unlock(args)
    const raw = base64ToBytes(r.masterKey)
    const masterKey = await masterKeyToCryptoKey(raw)
    raw.fill(0)
    return { success: true, masterKey }
  } catch (e) {
    return { success: false, code: errorCode(e), error: errorMessage(e) }
  }
}

async function biometricRemove(alias) {
  const bv = plugin('BiometricVault')
  if (!bv) return
  try {
    if (alias) await bv.remove({ alias })
    else await bv.remove({})
  } catch (e) {}
}

async function saveToDownloads(filename, text) {
  const dl = plugin('NativeDownloader')
  if (dl) {
    await dl.saveToDownloads({ filename, data: text })
    return true
  }
  const blob = new Blob([text], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

function canShareFiles() {
  return !!(plugin('Filesystem') && plugin('Share'))
}

async function shareFile(filename, text) {
  const fs = plugin('Filesystem')
  const share = plugin('Share')
  if (!fs || !share) throw new Error('Sharing files is not available on this device')
  const written = await fs.writeFile({ path: filename, data: text, directory: CACHE_DIRECTORY, encoding: 'utf8' })
  try {
    await share.share({ title: filename, url: written.uri, dialogTitle: 'Send ' + filename })
  } finally {
    try { await fs.deleteFile({ path: filename, directory: CACHE_DIRECTORY }) } catch (e) {}
  }
  return true
}

function pickTextFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = FILE_ACCEPT
    input.style.display = 'none'
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(value)
    }
    input.onchange = () => {
      const f = input.files && input.files[0]
      if (!f) { done(null); return }
      const reader = new FileReader()
      reader.onload = () => done(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => done(null)
      reader.readAsText(f)
    }
    input.addEventListener('cancel', () => done(null))
    document.body.appendChild(input)
    input.click()
  })
}

async function takeShared() {
  const st = plugin('ShareTarget')
  if (!st) return null
  try {
    const r = await st.takePending()
    return r && r.found ? { text: r.text || '', subject: r.subject || '' } : null
  } catch (e) {
    return null
  }
}

function onShared(callback) {
  const st = plugin('ShareTarget')
  if (!st || typeof st.addListener !== 'function') return
  try { st.addListener('shareReceived', () => { callback() }) } catch (e) {}
}

async function returnToSender() {
  const st = plugin('ShareTarget')
  if (!st) return
  try { await st.returnToSender() } catch (e) {}
}

async function autofillRequest() {
  const ab = plugin('AutofillBridge')
  if (!ab) return null
  try {
    const r = await ab.getRequest()
    return r && (r.mode === 'fill' || r.mode === 'save') ? r : null
  } catch (e) {
    return null
  }
}

async function autofillComplete(username, password) {
  const ab = plugin('AutofillBridge')
  if (!ab) throw new Error('Autofill is not available')
  await ab.complete({ username, password })
}

async function autofillClose() {
  const ab = plugin('AutofillBridge')
  if (!ab) return
  try { await ab.close() } catch (e) {}
}

async function autofillStatus() {
  const as = plugin('AutofillSetup')
  if (!as) return { supported: false, enabled: false }
  try {
    const r = await as.status()
    return { supported: !!(r && r.supported), enabled: !!(r && r.enabled) }
  } catch (e) {
    return { supported: false, enabled: false }
  }
}

async function openAutofillSettings() {
  const as = plugin('AutofillSetup')
  if (!as) throw new Error('Autofill is not available on this device')
  await as.openSettings()
}

function openExternal(url) {
  try { window.open(url, '_blank') } catch (e) {}
}

export {
  isNative,
  biometricAvailable,
  biometricEnroll,
  biometricUnlock,
  biometricRemove,
  saveToDownloads,
  canShareFiles,
  shareFile,
  pickTextFile,
  takeShared,
  onShared,
  returnToSender,
  autofillRequest,
  autofillComplete,
  autofillClose,
  autofillStatus,
  openAutofillSettings,
  openExternal
}
