#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const dir = __dirname

function stripImportsAndExports(code) {
  let result = code
  result = result.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]\s*;?/g, '')
  result = result.replace(/import\s+\*\s+as\s+\w+\s+from\s*['"][^'"]+['"]\s*;?/g, '')
  result = result.replace(/import\s+\w+\s+from\s*['"][^'"]+['"]\s*;?/g, '')
  result = result.replace(/import\s*['"][^'"]+['"]\s*;?/g, '')
  result = result.replace(/export\s*\{[\s\S]*?\}\s*;?/g, '')
  result = result.replace(/export\s+default\s+/g, '')
  result = result.replace(/export\s+/g, '')
  return result.trim()
}

const crypto = stripImportsAndExports(fs.readFileSync(path.join(dir, 'crypto.js'), 'utf8'))
const store = stripImportsAndExports(fs.readFileSync(path.join(dir, 'store.js'), 'utf8'))
const session = stripImportsAndExports(fs.readFileSync(path.join(dir, 'session.js'), 'utf8'))
const passwords = stripImportsAndExports(fs.readFileSync(path.join(dir, 'passwords.js'), 'utf8'))
const auth = stripImportsAndExports(fs.readFileSync(path.join(dir, 'auth.js'), 'utf8'))
const pairing = stripImportsAndExports(fs.readFileSync(path.join(dir, 'pairing.js'), 'utf8'))
const fountain = stripImportsAndExports(fs.readFileSync(path.join(dir, 'fountain.js'), 'utf8'))
const qrcode = stripImportsAndExports(fs.readFileSync(path.join(dir, 'qrcode.js'), 'utf8'))
const jsqr = fs.readFileSync(path.join(dir, 'jsqr.js'), 'utf8')

const bundledJS = `
const cryptoModule = (function() {
${crypto}
return {
  PBKDF2_ITERATIONS,
  LEGACY_PBKDF2_ITERATIONS,
  generateSalt,
  generateIV,
  generateMasterKey,
  deriveKeyFromSecret,
  deriveKeyFromPrfOutput,
  masterKeyToCryptoKey,
  wrapMasterKey,
  unwrapMasterKey,
  encrypt,
  decrypt,
  createBackupSignature,
  verifyBackupSignature
}
})();

const storeModule = (function() {
${store}
return {
  openDB,
  get,
  put,
  remove,
  getAuth,
  setAuth,
  getPasswordVault,
  setPasswordVault,
  getWalletVault,
  setWalletVault,
  clearAll
}
})();

const sessionModule = (function() {
const {
  generateSalt,
  deriveKeyFromSecret,
  wrapMasterKey,
  unwrapMasterKey
} = cryptoModule
const { getAuth } = storeModule
${session}
return {
  setMasterKey,
  getMasterKey,
  hasMasterKey,
  isSoftLocked,
  unlockDomain,
  lockDomain,
  isDomainUnlocked,
  getUnlockedDomains,
  resetActivity,
  checkTimeout,
  softLock,
  lockAll,
  clearStorageSession,
  getState
}
})();

const passwordsModule = (function() {
const { encrypt, decrypt } = cryptoModule
const { getPasswordVault, setPasswordVault } = storeModule
${passwords}
return {
  ensureVault,
  saveCredential,
  getCredentials,
  getAllDomains,
  updateCredential,
  deleteCredential,
  autofill
}
})();

const authModule = (function() {
const {
  PBKDF2_ITERATIONS,
  LEGACY_PBKDF2_ITERATIONS,
  generateSalt,
  generateMasterKey,
  deriveKeyFromSecret,
  deriveKeyFromPrfOutput,
  masterKeyToCryptoKey,
  wrapMasterKey,
  unwrapMasterKey
} = cryptoModule
const { getAuth, setAuth } = storeModule
${auth}
return {
  initAuth,
  startFingerprintEnrollment,
  enrollFingerprint,
  authenticateFingerprint,
  startPasswordCreation,
  setPassword,
  authenticatePassword,
  startPINCreation,
  setPIN,
  authenticatePIN,
  removePIN,
  authenticateLegacyPIN,
  removeFingerprint,
  removePassword,
  checkRateLimit,
  checkCreationTimer
}
})();

const pairingModule = (function() {
const { getPasswordVault, setPasswordVault, getAuth, setAuth } = storeModule
const { createBackupSignature, verifyBackupSignature } = cryptoModule
${pairing}
return {
  generatePairingCode,
  generateSessionId,
  initiatePairing,
  respondToPairing,
  completePairing,
  requestPairing,
  parseQR,
  parseResponse,
  prepareTransfer,
  encryptTransfer,
  decryptTransfer,
  verifyTransfer,
  receiveTransfer,
  deriveSharedKey,
  derivePinFromSharedKey,
  isExpired
}
})();

${jsqr}

const fountainModule = (function() {
${fountain}
return { createEncoder, createDecoder, CHUNK_BYTES }
})();

const qrcodeModule = (function() {
${qrcode}
return QRCode
})();

const vault = {
  crypto: cryptoModule,
  store: storeModule,
  session: sessionModule,
  passwords: passwordsModule,
  fountain: fountainModule,
  qrcode: qrcodeModule,
  auth: authModule,
  pairing: pairingModule
}
const pairing = pairingModule
`

const testHtmlPath = path.join(dir, 'test.html')
const testHtml = fs.readFileSync(testHtmlPath, 'utf8')

const scriptMatch = testHtml.match(/<script[^>]*>/)
if (!scriptMatch) {
  console.error('Could not find script tag in test.html')
  process.exit(1)
}

const scriptStart = testHtml.indexOf(scriptMatch[0])
const scriptEnd = testHtml.lastIndexOf('</script>')

if (scriptEnd === -1 || scriptEnd <= scriptStart) {
  console.error('Could not find closing script tag')
  process.exit(1)
}

const beforeScript = testHtml.substring(0, scriptStart)
const afterScript = testHtml.substring(scriptEnd + '</script>'.length)

const bundledHtml = `${beforeScript}<script>
${bundledJS}
window.vault = vault
window.pairing = pairing

window.onerror = function(msg, url, line) {
  console.error('Error:', msg, 'at line', line)
  var log = document.getElementById('log')
  if (log) log.innerHTML = '<div class="log-entry error">JS Error: ' + msg + ' (line ' + line + ')</div>' + log.innerHTML
}

document.addEventListener('DOMContentLoaded', function() {
  startActivityTracking()
  updateStatus()
  initGlobe()
  routeView()
  startLockMonitor()
})

// ---- Global lock monitor: catches a timeout no matter which page/tab is open ----
function showMenuLockOverlay() {
  var el = document.getElementById('menu-lock-overlay')
  if (el) el.classList.remove('hidden')
}
function hideMenuLockOverlay() {
  var el = document.getElementById('menu-lock-overlay')
  if (el) el.classList.add('hidden')
  var pw = document.getElementById('menu-unlock-pw'); if (pw) pw.value = ''
  var msg = document.getElementById('menu-unlock-msg'); if (msg) msg.textContent = ''
}
function menuUnlockMsg(t) {
  var msg = document.getElementById('menu-unlock-msg'); if (msg) msg.textContent = t
}

window.menuUnlockFp = async function() {
  var bv = nativeBiometric()
  var auth = await vault.store.getAuth() || {}
  if (bv && auth.fingerprintNative) {
    try {
      var res = await bv.unlock({ wrapped: auth.fingerprintNative.wrapped, iv: auth.fingerprintNative.iv })
      var bytes = b64ToBytes(res.masterKey)
      var ck = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt','decrypt'])
      vault.session.setMasterKey(ck)
      hideMenuLockOverlay()
      await updateStatus()
      return
    } catch (e) {
      menuUnlockMsg('Fingerprint unlock failed. Use password.')
      return
    }
  }
  var result = await vault.auth.authenticateFingerprint()
  if (result.success) {
    vault.session.setMasterKey(result.masterKey)
    hideMenuLockOverlay()
    await updateStatus()
  } else { menuUnlockMsg(result.error) }
}

window.menuUnlockPw = async function() {
  var el = document.getElementById('menu-unlock-pw')
  var pw = el ? el.value : ''
  var result = await vault.auth.authenticatePassword(pw)
  if (result.success) {
    vault.session.setMasterKey(result.masterKey)
    hideMenuLockOverlay()
    await updateStatus()
  } else { menuUnlockMsg(result.error) }
}

function startLockMonitor() {
  setInterval(async function () {
    var menuPage = document.getElementById('page-menu')
    var inMenu = menuPage && menuPage.classList.contains('active')
    if (!inMenu) return
    var unlocked = vault.session.hasMasterKey()
    var soft = await vault.session.isSoftLocked()
    if (!unlocked && !soft) {
      showMenuLockOverlay()
    } else {
      hideMenuLockOverlay()
    }
  }, 5000)
}


window.togglePw = function(btn) {
  var id = btn.getAttribute('data-target')
  var input = document.getElementById(id)
  if (!input) return
  if (input.type === 'password') {
    input.type = 'text'
    btn.style.color = 'var(--green)'
  } else {
    input.type = 'password'
    btn.style.color = ''
  }
}

function openWebsite() {
  window.open('https://hiimrook.github.io/valid-vault-password-manager/', '_blank')
}

// ---- Native biometric bridge (Android Capacitor plugin) ----
function nativeBiometric() {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BiometricVault) {
      return window.Capacitor.Plugins.BiometricVault
    }
  } catch (e) {}
  return null
}
function bytesToB64(bytes) {
  var bin = ''; var arr = new Uint8Array(bytes)
  for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin)
}
function b64ToBytes(b64) {
  var bin = atob(b64); var arr = new Uint8Array(bin.length)
  for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}
async function nativeBioAvailable() {
  var bv = nativeBiometric()
  if (!bv) return false
  try { var r = await bv.isAvailable(); return !!r.available } catch (e) { return false }
}
async function masterKeyBytesFromSession() {
  var mk = vault.session.getMasterKey()
  if (!mk) return null
  if (mk instanceof CryptoKey) {
    return new Uint8Array(await crypto.subtle.exportKey('raw', mk))
  }
  return new Uint8Array(mk)
}



function initGlobe() {
  var cv = document.getElementById('globe')
  if (!cv) return
  var ctx = cv.getContext('2d')
  var CX = 90, CY = 90, R = 68
  var tilt = -0.35, ang = 0
  function rotY(p, a){ var c=Math.cos(a), s=Math.sin(a); return {x:p.x*c+p.z*s, y:p.y, z:-p.x*s+p.z*c} }
  function rotX(p, a){ var c=Math.cos(a), s=Math.sin(a); return {x:p.x, y:p.y*c-p.z*s, z:p.y*s+p.z*c} }
  var lats=[], lons=[], LAT=7, LON=12, SEG=48
  for (var i=1;i<LAT+1;i++){ var phi=-Math.PI/2+(Math.PI*i/(LAT+1)); var ring=[]; for(var j=0;j<=SEG;j++){ var th=2*Math.PI*j/SEG; ring.push({x:Math.cos(phi)*Math.cos(th),y:Math.sin(phi),z:Math.cos(phi)*Math.sin(th)}) } lats.push(ring) }
  for (var i2=0;i2<LON;i2++){ var th2=2*Math.PI*i2/LON; var mer=[]; for(var j2=0;j2<=SEG;j2++){ var phi2=-Math.PI/2+Math.PI*j2/SEG; mer.push({x:Math.cos(phi2)*Math.cos(th2),y:Math.sin(phi2),z:Math.cos(phi2)*Math.sin(th2)}) } lons.push(mer) }
  function drawWire(pts, a, side){ for(var k=0;k<pts.length-1;k++){ var A=rotX(rotY(pts[k],a),tilt); var B=rotX(rotY(pts[k+1],a),tilt); var z=(A.z+B.z)/2; if(side==='back'&&z>=0)continue; if(side==='front'&&z<0)continue; var al=0.14+0.7*((z+1)/2); ctx.strokeStyle='rgba(51,255,102,'+al.toFixed(3)+')'; ctx.lineWidth=0.5+0.8*((z+1)/2); ctx.beginPath(); ctx.moveTo(CX+A.x*R,CY-A.y*R); ctx.lineTo(CX+B.x*R,CY-B.y*R); ctx.stroke() } }
  var VT=-38, VB=44
  function vPath(){ var ht=34, thick=18; var p=new Path2D(); p.moveTo(CX-ht,CY+VT); p.lineTo(CX,CY+VB); p.lineTo(CX+ht,CY+VT); p.lineTo(CX+ht-thick,CY+VT); p.lineTo(CX,CY+VB-thick*1.15); p.lineTo(CX-ht+thick,CY+VT); p.closePath(); return p }
  function drawV(){ var path=vPath(); ctx.save(); var g=ctx.createLinearGradient(0,CY+VT,0,CY+VB); g.addColorStop(0,'rgba(51,255,102,1)'); g.addColorStop(1,'rgba(20,120,55,1)'); ctx.shadowColor='rgba(51,255,102,0.8)'; ctx.shadowBlur=8; ctx.fillStyle=g; ctx.fill(path); ctx.shadowBlur=0; ctx.save(); ctx.clip(path); ctx.strokeStyle='rgba(10,14,10,0.85)'; ctx.lineWidth=2; for(var y=CY+VT;y<=CY+VB;y+=5){ ctx.beginPath(); ctx.moveTo(CX-50,y); ctx.lineTo(CX+50,y); ctx.stroke() } ctx.restore(); ctx.lineWidth=1.2; ctx.strokeStyle='#7dffa6'; ctx.stroke(path); ctx.restore() }
  function frame(){ ctx.clearRect(0,0,cv.width,cv.height); for(var a=0;a<lats.length;a++) drawWire(lats[a],ang,'back'); for(var b2=0;b2<lons.length;b2++) drawWire(lons[b2],ang,'back'); drawV(); for(var c=0;c<lats.length;c++) drawWire(lats[c],ang,'front'); for(var d=0;d<lons.length;d++) drawWire(lons[d],ang,'front'); ctx.strokeStyle='#33ff66'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(CX,CY,R,0,2*Math.PI); ctx.stroke(); ang+=0.005; requestAnimationFrame(frame) }
  frame()
}

function log(msg, type) {
  var el = document.getElementById('log')
  if (!el) return
  var entry = document.createElement('div')
  entry.className = 'log-entry' + (type ? ' ' + type : '')
  entry.textContent = new Date().toLocaleTimeString() + ' - ' + msg
  el.insertBefore(entry, el.firstChild)
}

async function updateStatus() {
  try {
    var status = await getPhoneStatus()
    var unlocked = vault.session.hasMasterKey()
    document.getElementById('status-fingerprint').className = 'status ' + (status.hasFingerprint ? 'active' : 'inactive')
    document.getElementById('status-password').className = 'status ' + (status.hasPassword ? 'active' : 'inactive')
    document.getElementById('status-session').className = 'status ' + (unlocked ? 'active' : 'inactive')
    // hamburger only visible when unlocked
    var ham = document.querySelector('.hamburger')
    if (ham) ham.style.display = unlocked ? '' : 'none'
    var menu = document.getElementById('menu-dropdown')
    if (menu && !unlocked) menu.classList.add('hidden')
    if (unlocked) { await restartInactivityTimer() }
    else if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  } catch (e) {}
}

function showModal(html) {
  var container = document.getElementById('modal-container')
  container.innerHTML = '<div class="modal"><div class="modal-content">' + html + '</div></div>'
  container.classList.remove('hidden')
}

function hideModal() {
  document.getElementById('modal-container').classList.add('hidden')
}


window.saveAutoLock = async function() {
  var el = document.getElementById('setting-timeout')
  if (!el) return
  var v = parseInt(el.value, 10)
  if (isNaN(v) || v < 10) v = 10
  if (v > 3600) v = 3600
  el.value = v
  try { var auth = await vault.store.getAuth() || {}; auth.autoLockTimeout = v; await vault.store.setAuth(auth) } catch (e) {}
  restartInactivityTimer()
}
async function getAutoLockSeconds() {
  try { var auth = await vault.store.getAuth() || {}; if (auth.autoLockTimeout) return auth.autoLockTimeout } catch (e) {}
  return 60
}
async function loadAutoLock() {
  var el = document.getElementById('setting-timeout')
  if (!el) return
  try { el.value = await getAutoLockSeconds() } catch (e) {}
}

// ---- Inactivity auto-lock timer ----
// Design: high-frequency events (touchmove/mousemove/scroll) must NOT each
// trigger an async IndexedDB read + timer rebuild — that races and produces
// exactly the "spazzy"/ignores-activity symptom. Instead, every event just
// bumps a cheap synchronous timestamp; a single poller checks it.
var lastActivityAt = Date.now()
var cachedAutoLockMs = 60000
var pollTimer = null

function noteActivity() {
  lastActivityAt = Date.now()
}

function startActivityTracking() {
  ['touchstart','touchmove','click','input','keydown','scroll','mousemove'].forEach(function(ev){
    document.addEventListener(ev, noteActivity, { passive: true })
  })
}

async function refreshAutoLockCache() {
  var seconds = await getAutoLockSeconds()
  cachedAutoLockMs = seconds * 1000
}

function startInactivityPoll() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(function () {
    if (!vault.session.hasMasterKey()) return
    if (Date.now() - lastActivityAt >= cachedAutoLockMs) {
      window.lockAll()
    }
  }, 1000)
}

// Called once on unlock and whenever the setting changes — refreshes the
// cached timeout and resets the activity clock, but does NOT touch storage
// on every tap/scroll the way the old per-event version did.
async function restartInactivityTimer() {
  noteActivity()
  await refreshAutoLockCache()
  startInactivityPoll()
}

window.saveQrTimeout = async function() {
  var el = document.getElementById('setting-qr-timeout')
  if (!el) return
  var v = parseInt(el.value, 10)
  if (isNaN(v) || v < 5) v = 5
  if (v > 600) v = 600
  el.value = v
  try { var auth = await vault.store.getAuth() || {}; auth.qrStreamTimeout = v; await vault.store.setAuth(auth) } catch (e) {}
}
async function loadQrTimeout() {
  var el = document.getElementById('setting-qr-timeout')
  if (!el) return
  try { el.value = await getQrTimeoutSeconds() } catch (e) {}
}

window.submitRenameKey = async function() {
  var el = document.getElementById('key-nickname-input')
  var msg = document.getElementById('key-nickname-msg')
  var name = el ? el.value : ''
  var result = await window.renameKey(name)
  if (result.success) { if (msg) { msg.textContent = 'Key renamed.'; msg.style.color = 'var(--green)' } }
  else { if (msg) { msg.textContent = result.error; msg.style.color = 'var(--danger)' } }
}
async function loadKeyNickname() {
  var el = document.getElementById('key-nickname-input')
  if (!el) return
  try { el.value = await window.getKeyNickname() } catch (e) {}
}

// ---- Export/Import key modals ----
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

function questionFieldsHtml(qIdx) {
  var html = ''
  for (var i = 0; i < qIdx.length; i++) {
    html += '<div style="margin-top:10px;"><div style="font-size:12px;color:var(--text-dim);margin-bottom:4px;">' + esc(SECURITY_QUESTIONS[qIdx[i]]) + '</div>'
    html += '<input type="text" id="sq-' + i + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="one word" style="width:100%;"></div>'
  }
  return html
}

window._exportQIdx = null
function showExportKeyModal(qIdx) {
  window._exportQIdx = qIdx
  var html = '<h3>Export Master Key</h3>'
  html += '<p style="color:var(--danger);font-size:12px;line-height:1.5;">Write down your passphrase and answers and keep them safe. They are never stored. If you lose them, this file can never be opened.</p>'
  html += '<div style="margin-top:12px;"><div style="font-size:12px;color:var(--text-dim);margin-bottom:4px;">Passphrase (12+ characters, spaces allowed, capitalization matters)</div>'
  html += '<input type="password" id="exp-pass" autocomplete="off" style="width:100%;"></div>'
  html += '<div style="font-size:11px;color:var(--text-dim);margin-top:8px;">Answer all three. Capitalization matters. Use a single word for each.</div>'
  html += questionFieldsHtml(qIdx)
  html += '<div id="exp-msg" style="font-size:12px;color:var(--danger);margin-top:10px;min-height:8px;"></div>'
  html += '<div class="row" style="margin-top:14px;"><button onclick="submitExportKey()">Export</button><button onclick="hideExportKeyModal()" class="secondary">Cancel</button></div>'
  showModal(html)
}
function hideExportKeyModal() { hideModal(); window._exportQIdx = null }
function setExportMsg(t) { var e = document.getElementById('exp-msg'); if (e) e.textContent = t }
window.submitExportKey = async function() {
  var pass = document.getElementById('exp-pass').value
  var answers = []
  for (var i = 0; i < window._exportQIdx.length; i++) { answers.push(document.getElementById('sq-'+i).value) }
  await doExportKey(window._exportQIdx, pass, answers)
}

window._importFileObj = null
function showImportKeyModal(fileObj) {
  window._importFileObj = fileObj
  var html = '<h3>Import Master Key</h3>'
  html += '<p style="color:var(--text-dim);font-size:12px;">Key file: ' + esc(fileObj.nickname || 'Master Key') + '</p>'
  html += '<div style="margin-top:12px;"><div style="font-size:12px;color:var(--text-dim);margin-bottom:4px;">Passphrase (capitalization matters)</div>'
  html += '<input type="password" id="imp-pass" autocomplete="off" style="width:100%;"></div>'
  html += '<div style="font-size:11px;color:var(--text-dim);margin-top:8px;">Answer the security questions. Capitalization matters.</div>'
  html += questionFieldsHtml(fileObj.questions)
  html += '<div id="imp-msg" style="font-size:12px;color:var(--danger);margin-top:10px;min-height:8px;"></div>'
  html += '<div class="row" style="margin-top:14px;"><button onclick="submitImportKey()">Import</button><button onclick="hideImportKeyModal()" class="secondary">Cancel</button></div>'
  showModal(html)
}
function hideImportKeyModal() { hideModal(); window._importFileObj = null }
function setImportMsg(t) { var e = document.getElementById('imp-msg'); if (e) e.textContent = t }
window.submitImportKey = async function() {
  var pass = document.getElementById('imp-pass').value
  var answers = []
  for (var i = 0; i < window._importFileObj.questions.length; i++) { answers.push(document.getElementById('sq-'+i).value) }
  await doImportKey(window._importFileObj, pass, answers)
}

// ---- View routing ----
window.showPhoneView = function(name) {
  ;['view-setup','view-locked','view-softlock','view-unlocked'].forEach(function(v){
    var el = document.getElementById(v)
    if (el) el.classList.add('hidden')
  })
  var show = document.getElementById(name)
  if (show) show.classList.remove('hidden')
}



function fieldVal(setupId, manageId) {
  var s = document.getElementById(setupId)
  var m = document.getElementById(manageId)
  // prefer whichever is visible/non-empty
  if (m && m.offsetParent !== null && m.value) return { el: m, val: m.value }
  if (s && s.offsetParent !== null && s.value) return { el: s, val: s.value }
  if (m && m.value) return { el: m, val: m.value }
  if (s && s.value) return { el: s, val: s.value }
  return { el: (m || s), val: (m ? m.value : (s ? s.value : '')) }
}
function anyMsg(text) {
  var ids = ['setup-msg','manage-msg']
  for (var i=0;i<ids.length;i++){ var e=document.getElementById(ids[i]); if(e && e.offsetParent!==null){ e.textContent=text; return } }
  for (var j=0;j<ids.length;j++){ var e2=document.getElementById(ids[j]); if(e2){ e2.textContent=text } }
}

async function getPhoneStatus() {
  var status = await vault.auth.initAuth()
  try {
    var auth = await vault.store.getAuth() || {}
    if (auth.fingerprintNative) status.hasFingerprint = true
  } catch (e) {}
  return status
}

async function routeView() {
  var status = await getPhoneStatus()
  var unlocked = vault.session.hasMasterKey()
  if (unlocked) {
    window.showPhoneView('view-unlocked')
    if (window.loadCredentials) window.loadCredentials()
  } else if (await vault.session.isSoftLocked()) {
    window.showPhoneView('view-softlock')
  } else if (status.hasFingerprint || status.hasPassword) {
    window.showPhoneView('view-locked')
  } else {
    window.showPhoneView('view-setup')
    refreshSetupButtons(status)
  }
}

function setEnrollBtn(btn, enrolled) {
  if (!btn) return
  if (enrolled) { btn.textContent = 'Re-enroll'; btn.classList.remove('enroll'); btn.classList.add('reenroll') }
  else { btn.textContent = 'Enroll'; btn.classList.remove('reenroll'); btn.classList.add('enroll') }
}

function refreshSetupButtons(status) {
  setEnrollBtn(document.getElementById('setup-fp-btn'), status.hasFingerprint)
  setEnrollBtn(document.getElementById('setup-pw-btn'), status.hasPassword)
  setEnrollBtn(document.getElementById('manage-fp-btn'), status.hasFingerprint)
  setEnrollBtn(document.getElementById('manage-pw-btn'), status.hasPassword)
}

function setupMsg(m) { var el = document.getElementById('setup-msg'); if (el) el.textContent = m }

// ---- Setup enroll handlers ----
window.enrollFp = async function() {
  if (!(await requireVaultOrError())) return
  var bv = nativeBiometric()
  if (!bv || !(await nativeBioAvailable())) {
    anyMsg('Fingerprint is not available on this device. Use password or PIN.')
    return
  }
  // Need a master key to wrap. If vault is fresh and unlocked from a prior enroll, use it;
  // otherwise require another method first so there is a master key to bind.
  var mkBytes = await masterKeyBytesFromSession()
  var auth = await vault.store.getAuth() || {}
  if (!mkBytes) {
    if (auth.fingerprintNative || auth.passwordWrappedKey || auth.pinWrappedKey) {
      anyMsg('Unlock first to add fingerprint.')
    } else {
      // brand new vault: generate a master key via the crypto module by enrolling nothing else yet
      anyMsg('Set a password or PIN first, then add fingerprint.')
    }
    return
  }
  try {
    var res = await bv.enroll({ masterKey: bytesToB64(mkBytes) })
    auth = await vault.store.getAuth() || {}
    auth.fingerprintNative = { wrapped: res.wrapped, iv: res.iv }
    auth.fingerprintEnabled = true
    await vault.store.setAuth(auth)
    anyMsg('Fingerprint enrolled')
  } catch (e) {
    var msg = (e && e.message) ? e.message : String(e)
    if (/cancel/i.test(msg)) { anyMsg('Fingerprint enrollment canceled.') }
    else { anyMsg('Fingerprint is not available on this device. Use password or PIN.') }
  }
  refreshSetupButtons(await getPhoneStatus())
  updateStatus()
}


function isManageActive() {
  var p = document.getElementById('page-menu')
  return p && p.classList.contains('active')
}
async function requireVaultOrError() {
  var mk = vault.session.getMasterKey()
  if (mk) return true
  // No live master key. On the manage screen this means post-nuke/locked -> send to main.
  if (isManageActive()) {
    var auth = {}
    try { auth = await vault.store.getAuth() || {} } catch (e) {}
    var hasAny = !!(auth.fingerprintNative || auth.passwordWrappedKey || auth.pinWrappedKey || auth.fingerprintWrappedKey)
    if (!hasAny) { anyMsg('Go to the main screen to set up your vault first.'); return false }
    anyMsg('Unlock first from the main screen.'); return false
  }
  return true
}


window.enrollPw = async function() {
  if (!(await requireVaultOrError())) return
  var fp = fieldVal('setup-pw','manage-pw')
  var pw = fp.val || ''
  if (pw.length < 12) { anyMsg('Password must be 12+ characters'); return }
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^a-zA-Z0-9]/.test(pw)) { anyMsg('Password needs a letter, a number, and a symbol'); return }
  var mk = vault.session.getMasterKey()
  vault.auth.startPasswordCreation()
  var result = await vault.auth.setPassword(pw, mk)
  if (result.success) {
    vault.session.setMasterKey(result.masterKey)
    if (fp.el) fp.el.value = ''
    anyMsg('Password enrolled')
  } else { anyMsg(result.error) }
  refreshSetupButtons(await getPhoneStatus())
  updateStatus()
}

window.finishSetup = async function() {
  var status = await getPhoneStatus()
  if (!(status.hasFingerprint || status.hasPassword)) { setupMsg('Enroll fingerprint or password first'); return }
  updateStatus()
  routeView()
}

// ---- Unlock handlers (hard + soft) ----
window.unlockFp = async function() {
  var bv = nativeBiometric()
  var auth = await vault.store.getAuth() || {}
  if (bv && auth.fingerprintNative) {
    try {
      var res = await bv.unlock({ wrapped: auth.fingerprintNative.wrapped, iv: auth.fingerprintNative.iv })
      var bytes = b64ToBytes(res.masterKey)
      var ck = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt','decrypt'])
      vault.session.setMasterKey(ck)
      updateStatus(); routeView()
      return
    } catch (e) {
      log('Fingerprint unlock failed. Use password or PIN.', 'error')
      return
    }
  }
  // fallback to web path (extension parity / non-native)
  var result = await vault.auth.authenticateFingerprint()
  if (result.success) {
    vault.session.setMasterKey(result.masterKey)
    updateStatus(); routeView()
  } else { log(result.error, 'error') }
}

window.unlockPw = async function() {
  var el = document.getElementById('lock-password') || document.getElementById('soft-password')
  var pw = el ? el.value : ''
  var result = await vault.auth.authenticatePassword(pw)
  if (result.success) {
    vault.session.setMasterKey(result.masterKey)
    if (el) el.value = ''
    updateStatus(); routeView()
  } else { log(result.error, 'error') }
}


window.showSaveCredential = function() {
  if (!vault.session.hasMasterKey()) { log('Login required', 'error'); return }
  var de = document.getElementById('vault-domain'); var domain = (de && de.value) || 'example.com'
  showModal('<h3>Add Credential</h3><input type="text" id="modal-domain" value="' + domain + '" placeholder="domain"><input type="text" id="modal-login" placeholder="username"><input type="password" id="modal-password-cred" placeholder="password"><div style="margin-top:16px;"><button onclick="saveCredential()">Save</button><button onclick="hideModal()" class="secondary">Cancel</button></div>')
}

function credEsc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

window.loadCredentials = function() { return renderCredentials() }

window.renderCredentials = async function() {
  var masterKey = vault.session.getMasterKey()
  var listEl = document.getElementById('credentials-list')
  if (!listEl) return
  if (!masterKey) { listEl.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">Unlock to view credentials.</p>'; return }
  var domRes = await vault.passwords.getAllDomains()
  if (!domRes.success || !domRes.domains.length) { listEl.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">No credentials saved yet.</p>'; return }
  var domains = domRes.domains.slice().sort()
  var html = ''
  for (var i = 0; i < domains.length; i++) {
    var domain = domains[i]
    var res = await vault.passwords.getCredentials(domain, masterKey)
    if (!res.success) continue
    var dom = credEsc(domain)
    html += '<div class="credential-domain" data-domain-toggle="' + dom + '" style="border-bottom:1px solid var(--green-faint);">'
    html += '<div data-act="toggle-domain" data-domain="' + dom + '" style="display:flex;align-items:center;padding:14px 0;cursor:pointer;">'
    html += '<span class="domain-caret" data-caret="' + dom + '" style="color:var(--text-dim);margin-right:8px;">&#9654;</span>'
    html += '<span style="color:var(--green);font-size:14px;font-weight:700;flex:1;">' + dom + '</span>'
    html += '<span style="color:var(--text-dim);font-size:12px;">' + res.credentials.length + ' account' + (res.credentials.length !== 1 ? 's' : '') + '</span>'
    html += '</div>'
    html += '<div data-domain-body="' + dom + '" class="hidden">'
    for (var j = 0; j < res.credentials.length; j++) {
      var c = res.credentials[j]
      var cid = credEsc(c.id)
      html += '<div style="padding:10px 0 14px 20px;">'
      html += '<div style="color:var(--text);font-size:13px;margin-bottom:6px;word-break:break-all;">' + credEsc(c.username) + '</div>'
      html += '<div style="display:flex;align-items:center;gap:8px;">'
      html += '<span id="pw-' + cid + '" data-shown="0" style="color:var(--text-dim);font-size:13px;font-family:monospace;flex:1;word-break:break-all;">' + '&#8226;'.repeat(8) + '</span>'
      html += '<button class="small secondary" data-act="toggle-pw" data-cid="' + cid + '">Show</button>'
      html += '<button class="small danger" data-act="delete" data-cid="' + cid + '" data-dom="' + dom + '">Delete</button>'
      html += '</div></div>'
    }
    html += '</div></div>'
  }
  listEl.innerHTML = html
  if (!listEl._delegated) {
    listEl._delegated = true
    listEl.addEventListener('click', function(e) {
      var btn = e.target.closest ? e.target.closest('[data-act]') : null
      if (!btn) return
      var act = btn.getAttribute('data-act')
      if (act === 'toggle-domain') {
        var dom = btn.getAttribute('data-domain')
        var body = listEl.querySelector('[data-domain-body="' + dom + '"]')
        var caret = listEl.querySelector('[data-caret="' + dom + '"]')
        if (body) body.classList.toggle('hidden')
        if (caret) caret.innerHTML = (body && !body.classList.contains('hidden')) ? '&#9660;' : '&#9654;'
      } else if (act === 'toggle-pw') {
        window.toggleCred(btn, btn.getAttribute('data-cid'))
      } else if (act === 'delete') {
        window.deleteCred(btn.getAttribute('data-cid'), btn.getAttribute('data-dom'))
      }
    })
  }
}

var credCache = {}
async function getCredById(cid) {
  if (credCache[cid]) return credCache[cid]
  var masterKey = vault.session.getMasterKey()
  if (!masterKey) return null
  var domRes = await vault.passwords.getAllDomains()
  if (!domRes.success) return null
  for (var i = 0; i < domRes.domains.length; i++) {
    var res = await vault.passwords.getCredentials(domRes.domains[i], masterKey)
    if (!res.success) continue
    for (var j = 0; j < res.credentials.length; j++) {
      if (res.credentials[j].id === cid) { credCache[cid] = res.credentials[j]; return res.credentials[j] }
    }
  }
  return null
}

window.toggleCred = async function(btn, cid) {
  var span = document.getElementById('pw-' + cid)
  if (!span) return
  if (span.getAttribute('data-shown') === '1') {
    span.textContent = '\u2022'.repeat(8); span.setAttribute('data-shown', '0'); btn.textContent = 'Show'
  } else {
    var c = await getCredById(cid)
    if (!c) { log('Unlock required', 'error'); return }
    span.textContent = c.password; span.setAttribute('data-shown', '1'); btn.textContent = 'Hide'
  }
}

window._pendingDeleteCid = null
window.deleteCred = function(cid, domain) {
  window._pendingDeleteCid = cid
  showModal('<h3>Delete Credential</h3><p style="color:var(--text-dim);font-size:13px;">Remove this login for ' + credEsc(domain) + '? This cannot be undone.</p><div style="margin-top:16px;"><button class="danger" onclick="confirmDeleteCred()">Delete</button><button onclick="hideModal()" class="secondary">Cancel</button></div>')
}
window.confirmDeleteCred = async function() {
  var cid = window._pendingDeleteCid
  if (!cid) { hideModal(); return }
  var result = await vault.passwords.deleteCredential(cid)
  hideModal()
  if (result && result.success) { delete credCache[cid]; log('Credential deleted', 'success'); credCache = {}; renderCredentials() }
  else { log('Delete failed', 'error') }
}

window.lockAll = async function() {
  var status = await vault.auth.initAuth()
  if (status.hasFingerprint) {
    await vault.session.softLock()
  } else {
    await vault.session.lockAll()
  }
  updateStatus()
  routeView()
}

window.clearAll = function() {
  showModal('<h3>Clear All Data</h3><p style="color:#666;font-size:13px;">Deletes the vault, every credential, and all login methods on this device. This cannot be undone.</p><div style="margin-top:16px;"><button onclick="confirmClearAll()" class="danger">Nuke It</button><button onclick="hideModal()" class="secondary">Cancel</button></div>')
}

window.confirmClearAll = async function() {
  await vault.store.clearAll()
  try { var bv = nativeBiometric(); if (bv) await bv.remove() } catch (e) {}
  await vault.session.lockAll()
  hideModal()
  // return to the main screen; with no vault, routeView lands on the setup/enroll screen
  var menuPage = document.getElementById('page-menu')
  var mainPage = document.getElementById('page-main')
  if (menuPage) menuPage.classList.remove('active')
  if (mainPage) mainPage.classList.add('active')
  await updateStatus()
  await routeView()
}

window.toggleMenu = function() {
  document.getElementById('menu-dropdown').classList.toggle('hidden')
}

window.openMenu = async function() {
  document.getElementById('menu-dropdown').classList.add('hidden')
  document.getElementById('page-main').classList.remove('active')
  document.getElementById('page-menu').classList.add('active')
  window.showMenuTab('manage', document.querySelector('.menu-tab'))
  try { refreshSetupButtons(await getPhoneStatus()) } catch (e) {}
}

window.closeMenu = function() {
  document.getElementById('page-menu').classList.remove('active')
  document.getElementById('page-main').classList.add('active')
}

window.showMenuTab = function(name, el) {
  if (name === 'settings') { loadKeyNickname(); loadQrTimeout(); loadAutoLock() }
  if (name === 'manage') { credCache = {}; renderCredentials() }
  var panels = document.querySelectorAll('.menu-panel')
  for (var i = 0; i < panels.length; i++) panels[i].classList.remove('active')
  var tabs = document.querySelectorAll('.menu-tab')
  for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active')
  document.getElementById('menu-' + name).classList.add('active')
  if (el) el.classList.add('active')
}

var phoneFountainTimer = null

function stopPhoneFountain() {
  if (phoneFountainTimer) { clearInterval(phoneFountainTimer); phoneFountainTimer = null }
  if (phoneQrCountdownTimer) { clearInterval(phoneQrCountdownTimer); phoneQrCountdownTimer = null }
  if (phoneQrShutoffTimer) { clearTimeout(phoneQrShutoffTimer); phoneQrShutoffTimer = null }
  var container = document.getElementById('phone-qr')
  if (container) container.innerHTML = ''
}

var phoneQrCountdownTimer = null
var phoneQrShutoffTimer = null

async function getQrTimeoutSeconds() {
  try { var auth = await vault.store.getAuth() || {}; if (auth.qrStreamTimeout) return auth.qrStreamTimeout } catch (e) {}
  return 30
}

async function streamPhoneFountain(payload, label) {
  stopPhoneFountain()
  var wrap = document.getElementById('phone-qr-wrap')
  var container = document.getElementById('phone-qr')
  var labelEl = document.getElementById('phone-qr-label')
  var timerEl = document.getElementById('phone-qr-timer')
  if (!container) return
  if (labelEl) labelEl.textContent = label
  if (wrap) wrap.classList.remove('hidden')
  var encoder = vault.fountain.createEncoder(payload)
  function renderNext() {
    var frame = encoder.nextFrame()
    var qr = new vault.qrcode({ content: frame, width: 240, height: 240, padding: 2, color: '#000000', background: '#ffffff' })
    container.innerHTML = qr.svg()
  }
  renderNext()
  phoneFountainTimer = setInterval(renderNext, 300)

  // auto-shutoff timeout + visible countdown
  var seconds = await getQrTimeoutSeconds()
  var remaining = seconds
  if (timerEl) timerEl.textContent = 'Auto-closes in ' + remaining + 's'
  phoneQrCountdownTimer = setInterval(function() {
    remaining -= 1
    if (timerEl) timerEl.textContent = remaining > 0 ? ('Auto-closes in ' + remaining + 's') : 'Closing…'
  }, 1000)
  phoneQrShutoffTimer = setTimeout(function() { window.stopPhoneStream() }, seconds * 1000)
}

window.stopPhoneStream = function() {
  stopPhoneFountain()
  var wrap = document.getElementById('phone-qr-wrap')
  if (wrap) wrap.classList.add('hidden')
}

async function ensurePhoneUnlocked() {
  if (vault.session.hasMasterKey()) return vault.session.getMasterKey()
  log('Unlock your vault before syncing', 'error')
  return null
}

window.shareVault = async function() {
  var masterKey = await ensurePhoneUnlocked()
  if (!masterKey) return
  var vaultData = await vault.store.getPasswordVault()
  if (!vaultData) { log('Nothing to sync yet', 'error'); return }
  var payload = JSON.stringify({ kind: 'vault', vault: vaultData })
  streamPhoneFountain(payload, 'Scan this with your other device to receive your logins')
  
}

window.shareMasterKey = async function() {
  var masterKey = await ensurePhoneUnlocked()
  if (!masterKey) return
  var raw = new Uint8Array(await crypto.subtle.exportKey('raw', masterKey))
  var payload = JSON.stringify({ kind: 'key', key: Array.from(raw) })
  streamPhoneFountain(payload, 'Scan this with your new device to give it the master key')
  
}

var scanActive = false
window.importSync = async function() {
  if (scanActive) return
  var box = document.getElementById('qr-scan-box')
  if (!box) return
  scanActive = true
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    log('Camera not available on this device.', 'error')
    return
  }
  var decoder = vault.fountain.createDecoder()
  var settled = false
  var stream = null
  var raf = null

  // build the in-box camera view
  var origHtml = box.innerHTML
  box.innerHTML = ''
  box.style.padding = '0'
  box.style.overflow = 'hidden'
  box.style.position = 'relative'
  var video = document.createElement('video')
  video.setAttribute('playsinline', 'true')
  video.setAttribute('muted', 'true')
  video.style.width = '100%'
  video.style.height = '100%'
  video.style.objectFit = 'cover'
  var canvas = document.createElement('canvas')
  var ctx = canvas.getContext('2d', { willReadFrequently: true })
  var cancelBtn = document.createElement('button')
  cancelBtn.textContent = 'Cancel'
  cancelBtn.style.cssText = 'position:absolute;top:8px;left:8px;z-index:3;background:var(--danger);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-weight:700;font-family:inherit;'
  var status = document.createElement('div')
  status.style.cssText = 'position:absolute;bottom:8px;left:0;right:0;text-align:center;color:#33ff66;font-family:monospace;font-size:12px;text-shadow:0 0 6px rgba(0,0,0,0.9);z-index:3;'
  status.textContent = 'Point at the other device'
  box.appendChild(video)
  box.appendChild(cancelBtn)
  box.appendChild(status)

  function cleanup() {
    settled = true
    setTimeout(function(){ scanActive = false }, 400)
    if (raf) { cancelAnimationFrame(raf); raf = null }
    try { if (stream) { stream.getTracks().forEach(function(t){ t.stop() }); stream = null } } catch (e) {}
    try { video.pause(); video.srcObject = null } catch (e) {}
    box.style.padding = ''
    box.style.overflow = ''
    box.style.position = ''
    box.innerHTML = origHtml
  }
  cancelBtn.onclick = function(e) { if (e) { e.stopPropagation(); e.preventDefault() } cleanup(); log('Scan cancelled') }
  window.cancelPhoneScan = function() { cleanup() }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    video.srcObject = stream
    await video.play()
    function tick() {
      if (settled) return
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        var code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        if (code && code.data) {
          var outcome = decoder.addFrame(code.data)
          if (outcome.success) {
            status.textContent = 'Receiving: ' + outcome.solved + ' of ' + outcome.total
            if (outcome.complete) {
              var assembled = decoder.assemble()
              cleanup()
              handlePhoneImported(assembled.payload)
              return
            }
          }
        }
      }
      if (!settled) raf = requestAnimationFrame(tick)
    }
    if (!settled) raf = requestAnimationFrame(tick)
  } catch (error) {
    cleanup()
    log('Camera failed: ' + (error && error.message ? error.message : error), 'error')
  }
}

async function handlePhoneImported(payloadText) {
  var data = JSON.parse(payloadText)
  if (data.kind === 'key') {
    var keyBytes = new Uint8Array(data.key)
    var importedKey = await vault.crypto.masterKeyToCryptoKey(keyBytes)
    vault.session.setMasterKey(importedKey)
    log('Sync key imported. This device can now sync.', 'success')
    updateStatus()
    return
  }
  if (data.kind === 'vault') {
    if (!vault.session.hasMasterKey()) { log('QR sync not enabled. Import master key first', 'error'); return }
    var masterKey = vault.session.getMasterKey()
    var localVault = await vault.store.getPasswordVault()
    var incoming = data.vault
    if (!localVault) {
      await vault.store.setPasswordVault(incoming)
      log('Vault imported.', 'success')
      return
    }
    var merged = await vault.passwords.mergeVaults(localVault, incoming, masterKey)
    merged.meta.createdAt = Math.min(localVault.meta.createdAt, incoming.meta.createdAt)
    merged.meta.lastAccess = Date.now()
    await vault.store.setPasswordVault(merged)
    var count = Object.values(merged.credentials || {}).flat().filter(function(c) { return !c.deleted }).length
    log('Sync complete. ' + count + ' logins.', 'success')
    return
  }
  log('Unrecognized code', 'error')
}

// ============ Offline Export / Import (encrypted files, no new dependency) ============

var EXPORT_ITERATIONS = 1000000  // high, offline file guard

var SECURITY_QUESTIONS = [
  'Name of your first pet',
  'City where you were born',
  'Name of your first street',
  'Your mothers maiden name',
  'Name of your first school',
  'Your childhood best friend first name',
  'Make of your first car',
  'Name of your first employer',
  'Your favorite childhood teacher last name',
  'The street you grew up on'
]

function pickThreeQuestions() {
  var idx = []
  var pool = SECURITY_QUESTIONS.slice()
  for (var i = 0; i < 3; i++) {
    var r = Math.floor(Math.random() * pool.length)
    idx.push(SECURITY_QUESTIONS.indexOf(pool[r]))
    pool.splice(r, 1)
  }
  return idx  // array of 3 indices into SECURITY_QUESTIONS
}

// combine passphrase + the three answers into one secret (order fixed by question index).
// capitalization + spaces preserved (no normalization) so they matter, as designed.
function combineSecret(passphrase, questionIdx, answers) {
  var parts = [passphrase]
  for (var i = 0; i < questionIdx.length; i++) {
    parts.push(String(questionIdx[i]) + ':' + answers[i])
  }
  return parts.join('\u0000')  // null-join, unlikely to collide
}

function downloadFile(filename, text) {
  try {
    var blob = new Blob([text], { type: 'application/json' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    document.body.removeChild(a)
    setTimeout(function(){ URL.revokeObjectURL(url) }, 1000)
    return true
  } catch (e) { return false }
}

function readFileText(cb) {
  var input = document.createElement('input')
  input.type = 'file'
  input.accept = '.vaultkey,.vault,application/json'
  input.onchange = function() {
    var f = input.files && input.files[0]
    if (!f) { cb(null); return }
    var reader = new FileReader()
    reader.onload = function() { cb(reader.result) }
    reader.onerror = function() { cb(null) }
    reader.readAsText(f)
  }
  input.click()
}

// ---- Export Key ----
window.exportKey = async function() {
  var masterKey = await ensurePhoneUnlocked()
  if (!masterKey) return
  var qIdx = pickThreeQuestions()
  showExportKeyModal(qIdx)
}

async function doExportKey(qIdx, passphrase, answers) {
  var masterKey = vault.session.getMasterKey()
  if (!masterKey) { log('Unlock first', 'error'); return }
  if (passphrase.length < 12) { setExportMsg('Passphrase must be at least 12 characters'); return }
  for (var i = 0; i < answers.length; i++) { if (!answers[i]) { setExportMsg('Answer all three questions'); return } }
  try {
    var secret = combineSecret(passphrase, qIdx, answers)
    var salt = await vault.crypto.generateSalt()
    var wrapKey = await vault.crypto.deriveKeyFromSecret(secret, salt, EXPORT_ITERATIONS)
    var rawMaster = new Uint8Array(await crypto.subtle.exportKey('raw', masterKey))
    var wrapped = await vault.crypto.wrapMasterKey(rawMaster, wrapKey)
    var auth = await vault.store.getAuth() || {}
    var nickname = auth.keyNickname || 'My Master Key'
    var fileObj = {
      format: 'valid-vault-key',
      version: 1,
      nickname: nickname,
      questions: qIdx,
      salt: Array.from(salt),
      iterations: EXPORT_ITERATIONS,
      wrapped: wrapped
    }
    var fname = nickname.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.vaultkey'
    if (downloadFile(fname, JSON.stringify(fileObj))) {
      hideExportKeyModal()
      log('Key exported. Store the file, passphrase, and answers safely.', 'success')
    } else { setExportMsg('Could not save the file') }
  } catch (e) { setExportMsg('Export failed: ' + (e && e.message ? e.message : e)) }
}

// ---- Import Key ----
window.importKey = function() {
  readFileText(function(text) {
    if (!text) { log('No file selected', 'error'); return }
    try {
      var fileObj = JSON.parse(text)
      if (fileObj.format !== 'valid-vault-key') { log('Not a Valid Vault key file', 'error'); return }
      showImportKeyModal(fileObj)
    } catch (e) { log('Could not read the file', 'error') }
  })
}

async function doImportKey(fileObj, passphrase, answers) {
  try {
    var secret = combineSecret(passphrase, fileObj.questions, answers)
    var salt = new Uint8Array(fileObj.salt)
    var wrapKey = await vault.crypto.deriveKeyFromSecret(secret, salt, fileObj.iterations || EXPORT_ITERATIONS)
    var rawMaster = await vault.crypto.unwrapMasterKey(fileObj.wrapped, wrapKey)
    var importedKey = await vault.crypto.masterKeyToCryptoKey(rawMaster)
    vault.session.setMasterKey(importedKey)
    hideImportKeyModal()
    log('Master key imported. This device can now sync and decrypt vaults.', 'success')
    updateStatus()
  } catch (e) {
    setImportMsg('Wrong passphrase or answers.')
  }
}

// ---- Export Vault (already-encrypted vault to a file) ----
window.exportVault = async function() {
  var masterKey = await ensurePhoneUnlocked()
  if (!masterKey) return
  var vaultData = await vault.store.getPasswordVault()
  if (!vaultData) { log('Nothing to export yet', 'error'); return }
  var fileObj = { format: 'valid-vault-vault', version: 1, vault: vaultData }
  if (downloadFile('valid-vault-backup.vault', JSON.stringify(fileObj))) {
    log('Vault exported. It stays encrypted, useless without your master key.', 'success')
  } else { log('Could not save the file', 'error') }
}

// ---- Import Vault (restore/merge from a file) ----
window.importVault = function() {
  readFileText(async function(text) {
    if (!text) { log('No file selected', 'error'); return }
    try {
      var fileObj = JSON.parse(text)
      if (fileObj.format !== 'valid-vault-vault') { log('Not a Valid Vault backup file', 'error'); return }
      var masterKey = await ensurePhoneUnlocked()
      if (!masterKey) return
      var localVault = await vault.store.getPasswordVault()
      var incoming = fileObj.vault
      if (!localVault) {
        await vault.store.setPasswordVault(incoming)
        log('Vault restored.', 'success')
        return
      }
      var merged = await vault.passwords.mergeVaults(localVault, incoming, masterKey)
      merged.meta.createdAt = Math.min(localVault.meta.createdAt, incoming.meta.createdAt)
      merged.meta.lastAccess = Date.now()
      await vault.store.setPasswordVault(merged)
      var count = Object.values(merged.credentials || {}).flat().filter(function(c){ return !c.deleted }).length
      log('Vault merged. ' + count + ' logins.', 'success')
    } catch (e) { log('Import failed: ' + (e && e.message ? e.message : e), 'error') }
  })
}

// ---- Key nickname ----
window.getKeyNickname = async function() {
  var auth = await vault.store.getAuth() || {}
  return auth.keyNickname || 'My Master Key'
}
window.renameKey = async function(newName) {
  if (!newName || !newName.trim()) return { success: false, error: 'Name cannot be empty' }
  var mk = vault.session.getMasterKey()
  if (!mk) return { success: false, error: 'Unlock first' }
  var auth = await vault.store.getAuth() || {}
  auth.keyNickname = newName.trim()
  await vault.store.setAuth(auth)
  return { success: true }
}
</script>${afterScript}`

fs.writeFileSync(testHtmlPath, bundledHtml)
fs.writeFileSync(path.join(dir, 'www', 'index.html'), bundledHtml)
console.log('Build complete:', new Date().toISOString())
