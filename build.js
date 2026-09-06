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

const vault = {
  crypto: cryptoModule,
  store: storeModule,
  session: sessionModule,
  passwords: passwordsModule,
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
  updateStatus()
  initGlobe()
  routeView()
})


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
  if (pw.length < 8) { anyMsg('Password must be 8+ characters'); return }
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

window.saveCredential = async function() {
  var masterKey = vault.session.getMasterKey()
  if (!masterKey) { log('Not authenticated', 'error'); hideModal(); return }
  var domain = document.getElementById('modal-domain').value
  var login = document.getElementById('modal-login').value
  var password = document.getElementById('modal-password-cred').value
  var result = await vault.passwords.saveCredential(domain, login, password, masterKey)
  if (result.success) {
    log('Credential saved for ' + domain, 'success')
    loadCredentials()
  } else {
    log('Save failed: ' + result.error, 'error')
  }
  hideModal()
}

window.loadCredentials = async function() {
  var masterKey = vault.session.getMasterKey()
  var de2 = document.getElementById('vault-domain'); var domain = de2 ? de2.value : ''
  var listEl = document.getElementById('credentials-list')
  if (!masterKey) { listEl.innerHTML = '<p style="color:#666;">Login required</p>'; return }
  if (!domain) { listEl.innerHTML = '<p style="color:#666;">Enter domain</p>'; return }
  var result = await vault.passwords.getCredentials(domain, masterKey)
  if (!result.success) { listEl.innerHTML = '<p style="color:#e74c3c;">' + result.error + '</p>'; return }
  if (result.credentials.length === 0) { listEl.innerHTML = '<p style="color:#666;">No credentials</p>'; return }
  listEl.innerHTML = result.credentials.map(function(c) {
    return '<div class="credential-row"><span class="credential-login">' + c.username + '</span><span class="credential-pass">••••••••</span></div>'
  }).join('')
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
  var panels = document.querySelectorAll('.menu-panel')
  for (var i = 0; i < panels.length; i++) panels[i].classList.remove('active')
  var tabs = document.querySelectorAll('.menu-tab')
  for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active')
  document.getElementById('menu-' + name).classList.add('active')
  if (el) el.classList.add('active')
}

window.syncVault = function() { log('Sync Vault coming in the next build', 'error') }
window.getSyncKey = function() { log('Get Sync Key coming in the next build', 'error') }
window.importSync = function() { log('Import coming in the next build', 'error') }
</script>${afterScript}`

fs.writeFileSync(testHtmlPath, bundledHtml)
fs.writeFileSync(path.join(dir, 'www', 'index.html'), bundledHtml)
console.log('Build complete:', new Date().toISOString())
