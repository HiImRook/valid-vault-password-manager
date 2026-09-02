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

function openWebsite() {
  window.open('https://hiimrook.github.io/valid-vault-password-manager/', '_blank')
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
    var status = await vault.auth.initAuth()
    var unlocked = vault.session.hasMasterKey()
    document.getElementById('status-fingerprint').className = 'status ' + (status.hasFingerprint ? 'active' : 'inactive')
    document.getElementById('status-pin').className = 'status ' + (status.hasPIN ? 'active' : 'inactive')
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

async function routeView() {
  var status = await vault.auth.initAuth()
  var unlocked = vault.session.hasMasterKey()
  if (unlocked) {
    window.showPhoneView('view-unlocked')
    if (window.loadCredentials) window.loadCredentials()
  } else if (await vault.session.isSoftLocked()) {
    window.showPhoneView('view-softlock')
  } else if (status.hasFingerprint || status.hasPIN || status.hasPassword) {
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
  setEnrollBtn(document.getElementById('setup-pin-btn'), status.hasPIN)
  setEnrollBtn(document.getElementById('setup-pw-btn'), status.hasPassword)
}

function setupMsg(m) { var el = document.getElementById('setup-msg'); if (el) el.textContent = m }

// ---- Setup enroll handlers ----
window.enrollFp = async function() {
  vault.auth.startFingerprintEnrollment()
  var mk = vault.session.getMasterKey()
  var result = await vault.auth.enrollFingerprint(mk)
  if (result.success) {
    vault.session.setMasterKey(result.masterKey)
    setupMsg('Fingerprint enrolled')
  } else { setupMsg(result.error) }
  refreshSetupButtons(await vault.auth.initAuth())
  updateStatus()
}

window.enrollPin = async function() {
  var pin = document.getElementById('setup-pin').value
  if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) { setupMsg('PIN must be 4-6 digits'); return }
  var mk = vault.session.getMasterKey()
  vault.auth.startPINCreation()
  var result = await vault.auth.setPIN(pin, mk)
  if (result.success) {
    vault.session.setMasterKey(result.masterKey)
    document.getElementById('setup-pin').value = ''
    setupMsg('PIN enrolled')
  } else { setupMsg(result.error) }
  refreshSetupButtons(await vault.auth.initAuth())
  updateStatus()
}

window.enrollPw = async function() {
  var pw = document.getElementById('setup-pw').value
  if (pw.length < 8) { setupMsg('Password must be 8+ characters'); return }
  var mk = vault.session.getMasterKey()
  vault.auth.startPasswordCreation()
  var result = await vault.auth.setPassword(pw, mk)
  if (result.success) {
    vault.session.setMasterKey(result.masterKey)
    document.getElementById('setup-pw').value = ''
    setupMsg('Password enrolled')
  } else { setupMsg(result.error) }
  refreshSetupButtons(await vault.auth.initAuth())
  updateStatus()
}

window.finishSetup = async function() {
  var status = await vault.auth.initAuth()
  if (!(status.hasFingerprint || status.hasPassword)) { setupMsg('Enroll fingerprint or password first'); return }
  updateStatus()
  routeView()
}

// ---- Unlock handlers (hard + soft) ----
window.unlockFp = async function() {
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

window.resumePin = async function() {
  var pin = document.getElementById('soft-pin').value
  var result = await vault.auth.authenticatePIN(pin)
  if (result.success) {
    vault.session.setMasterKey(result.masterKey)
    document.getElementById('soft-pin').value = ''
    updateStatus(); routeView()
  } else { log(result.error || 'Incorrect PIN', 'error') }
}

window.showSaveCredential = function() {
  if (!vault.session.hasMasterKey()) { log('Login required', 'error'); return }
  var domain = document.getElementById('domain-input').value || 'example.com'
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
  var domain = document.getElementById('domain-input').value
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
  if (status.hasPIN) {
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
  vault.session.lockAll()
  hideModal()
  log('All data cleared', 'success')
  updateStatus()
}

window.toggleMenu = function() {
  document.getElementById('menu-dropdown').classList.toggle('hidden')
}

window.openMenu = function() {
  document.getElementById('menu-dropdown').classList.add('hidden')
  document.getElementById('page-main').classList.remove('active')
  document.getElementById('page-menu').classList.add('active')
  window.showMenuTab('manage', document.querySelector('.menu-tab'))
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
