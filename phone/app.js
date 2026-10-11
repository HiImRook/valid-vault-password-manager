import * as auth from '../extension/auth.js'
import * as passwords from '../extension/passwords.js'
import * as webcreds from '../extension/webcreds.js'
import * as personalinfo from '../extension/personalinfo.js'
import * as bookmarks from '../extension/bookmarks.js'
import * as walletsTab from '../extension/wallets-tab.js'
import * as session from '../extension/session.js'
import * as store from '../extension/store.js'
import * as keypackage from '../extension/keypackage.js'
import * as vaultFile from '../extension/vaultfile.js'
import * as generator from '../extension/generator.js'
import { createEncoder, createDecoder, QR_FRAME_MS } from '../extension/fountain.js'
import { qrSvg, openCamera, readCode } from '../extension/qrtools.js'
import { generateMasterKey, masterKeyToCryptoKey } from '../extension/crypto.js'
import { formDialog, confirmDialog, askSecret, closeAllDialogs } from '../extension/dialogs.js'
import * as platform from './platform.js'

const APP_VERSION = typeof VALID_VAULT_VERSION === 'string' ? VALID_VAULT_VERSION : ''
const LEGACY_BIOMETRIC_ALIAS = 'valid_vault_biometric_key'
const AUTOLOCK_MIN_SEC = 10
const AUTOLOCK_MAX_SEC = 7200
const AUTOLOCK_DEFAULT_SEC = 60
const QR_TIMEOUT_MIN_SEC = 5
const QR_TIMEOUT_MAX_SEC = 600
const QR_TIMEOUT_DEFAULT_SEC = 30
const MSG_SHOW_MS = 6000
const ACTIVITY_EVENTS = ['touchstart', 'click', 'input', 'keydown', 'scroll']
const MASK = '••••••••'
const DEFAULT_NICKNAME = 'My Master Key'
const GLOBE_SPIN_PER_MS = 0.0003
const GLOBE_EARLY_MARGIN = '240px 0px 240px 0px'
const DEAD_FINGERPRINT_CODES = ['missing', 'invalidated']
const FINGERPRINT_RESET_TEXT = 'Android reset fingerprint unlock on this phone, so the old fingerprint setting was removed. Tap Enroll under Fingerprint to set it up again.'
const PASSWORD_RULE_TEXT = '12+ characters with a letter, a number, and a symbol.'
const PASSPHRASE_TIP = 'Use four or more random words plus a number and a symbol, like copper-lantern-mosaic-drift7!. Capitalization matters.'
const ANSWER_TIP = 'One word. Capitalization matters.'
const LOGIN_TYPES = [
  { value: 'username', label: '👤 Username' },
  { value: 'email', label: '📧 Email' },
  { value: 'phone', label: '📱 Phone' }
]
const TABS = ['manage', 'personal', 'webcreds', 'wallets', 'bookmarks', 'sync', 'settings', 'guide', 'about']

const state = {
  settings: { autoLock: AUTOLOCK_DEFAULT_SEC, qrTimeout: QR_TIMEOUT_DEFAULT_SEC, genMin: generator.GEN_DEFAULT_MIN, genMax: generator.GEN_DEFAULT_MAX },
  unlocked: { logins: false, webcreds: false, personal: false },
  openGroups: { logins: new Set(), webcreds: new Set() },
  setup: { masterKey: null, hasFp: false, hasPw: false },
  scan: null,
  share: null,
  shareToken: null,
  tab: 'manage',
  deadFingerprint: null,
  bookmarkFilter: '',
  msgTimers: new Map()
}

const GLOBES = { visible: new Set(), raf: null, start: performance.now() }

function $(id) {
  return document.getElementById(id)
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function btn(label, className, handler) {
  const b = el('button', className, label)
  b.type = 'button'
  b.onclick = (e) => {
    e.stopPropagation()
    handler(e)
  }
  return b
}

function showMsg(id, text, kind) {
  const box = $(id)
  if (!box) return
  box.textContent = text
  box.className = 'msg ' + (kind || 'success')
  const old = state.msgTimers.get(id)
  if (old) clearTimeout(old)
  state.msgTimers.set(id, setTimeout(() => box.classList.add('hidden'), kind === 'error' ? MSG_SHOW_MS * 2 : MSG_SHOW_MS))
}

function errText(e) {
  return e && e.message ? e.message : String(e)
}

function key() {
  return session.getMasterKey()
}

function passwordMeetsRule(pw) {
  return !!pw && pw.length >= 12 && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw) && /[^a-zA-Z0-9]/.test(pw)
}

function passwordProblem(pw) {
  if (!pw || pw.length < 12) return 'Password must be at least 12 characters.'
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^a-zA-Z0-9]/.test(pw)) return 'Password needs a letter, a number, and a symbol.'
  return null
}

function formatDuration(totalSeconds, showHours) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const hours = Math.floor(s / 3600)
  const minutes = showHours ? Math.floor((s % 3600) / 60) : Math.floor(s / 60)
  const seconds = s % 60
  const tail = String(minutes).padStart(2, '0') + 'm ' + String(seconds).padStart(2, '0') + 's'
  return showHours ? String(hours).padStart(2, '0') + 'h ' + tail : tail
}

function clamp(value, min, max, fallback) {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function generateActions() {
  const prefs = { min: state.settings.genMin, max: state.settings.genMax }
  return [
    { label: 'Aa1!', onClick: (input) => { input.value = generator.generatePassword(prefs, 'full') } },
    { label: 'Aa1', onClick: (input) => { input.value = generator.generatePassword(prefs, 'plain') } }
  ]
}

const GENERATE_HINT = 'Aa1! generates a password with special characters, Aa1 with letters and numbers only. Tap Show to see it.'

async function loadSettings() {
  try {
    const a = await store.getAuth() || {}
    state.settings.autoLock = clamp(a.autoLockTimeout, AUTOLOCK_MIN_SEC, AUTOLOCK_MAX_SEC, AUTOLOCK_DEFAULT_SEC)
    state.settings.qrTimeout = clamp(a.qrStreamTimeout, QR_TIMEOUT_MIN_SEC, QR_TIMEOUT_MAX_SEC, QR_TIMEOUT_DEFAULT_SEC)
    const prefs = generator.normalizePrefs({ min: a.genMinLength, max: a.genMaxLength })
    state.settings.genMin = prefs.min
    state.settings.genMax = prefs.max
  } catch (e) {}
}

async function saveAuthFields(fields) {
  const a = await store.getAuth() || {}
  Object.assign(a, fields)
  await store.setAuth(a)
}

async function getNativeRecord() {
  const a = await store.getAuth()
  return a && a.fingerprintNative ? a.fingerprintNative : null
}

function aliasOf(record) {
  return record && record.alias ? record.alias : LEGACY_BIOMETRIC_ALIAS
}

async function saveNativeRecord(record) {
  const a = await store.getAuth() || {}
  const old = a.fingerprintNative || null
  a.fingerprintNative = record
  await store.setAuth(a)
  if (old && aliasOf(old) !== aliasOf(record)) await platform.biometricRemove(aliasOf(old))
}

async function removeNativeFingerprint() {
  const record = await getNativeRecord()
  const result = await auth.removeFingerprint()
  if (result.success && record) await platform.biometricRemove(aliasOf(record))
  return result
}

function noteFingerprintResult(record, result) {
  if (!result.success && record && DEAD_FINGERPRINT_CODES.includes(result.code)) state.deadFingerprint = record.wrapped
}

async function clearDeadFingerprint() {
  const dead = state.deadFingerprint
  state.deadFingerprint = null
  if (!dead) return false
  const record = await getNativeRecord()
  if (!record || record.wrapped !== dead) return false
  const result = await removeNativeFingerprint()
  return !!result.success
}

function fingerprintFailureText(result) {
  if (!result) return 'Fingerprint did not complete.'
  if (result.code === 'cancelled') return 'Fingerprint was cancelled.'
  if (result.code === 'invalidated') return 'Fingerprints on this phone changed, so Android reset fingerprint unlock. Re-enroll it in Manage after you unlock.'
  if (result.code === 'missing') return 'Fingerprint unlock is no longer set up on this phone. Re-enroll it in Manage after you unlock.'
  if (result.code === 'locked-out') return 'Too many fingerprint attempts. Unlock your phone, then try again.'
  return result.error || 'Fingerprint did not complete.'
}

async function newMasterKey() {
  return masterKeyToCryptoKey(await generateMasterKey())
}

function globeAngle(now) {
  return (now - GLOBES.start) * GLOBE_SPIN_PER_MS
}

function globeTick(now) {
  const angle = globeAngle(now)
  for (const draw of GLOBES.visible) draw(angle)
  GLOBES.raf = GLOBES.visible.size ? requestAnimationFrame(globeTick) : null
}

function startGlobes() {
  const canvases = Array.from(document.querySelectorAll('canvas.globe'))
  const draws = new Map()
  for (const cv of canvases) draws.set(cv, makeGlobe(cv))
  if (typeof IntersectionObserver !== 'function') {
    for (const draw of draws.values()) GLOBES.visible.add(draw)
    GLOBES.raf = requestAnimationFrame(globeTick)
    return
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const draw = draws.get(entry.target)
      if (!draw) continue
      if (entry.isIntersecting) {
        if (!GLOBES.visible.has(draw)) draw(globeAngle(performance.now()))
        GLOBES.visible.add(draw)
      } else {
        GLOBES.visible.delete(draw)
      }
    }
    if (GLOBES.visible.size && GLOBES.raf === null) GLOBES.raf = requestAnimationFrame(globeTick)
  }, { rootMargin: GLOBE_EARLY_MARGIN })
  for (const cv of canvases) observer.observe(cv)
}

function makeGlobe(cv) {
  const ctx = cv.getContext('2d')
  const CX = 90
  const CY = 90
  const R = 68
  const TILT = -0.35
  const LAT = 7
  const LON = 12
  const SEG = 48
  const VT = -38
  const VB = 44
  const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c } }
  const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c } }
  const lats = []
  const lons = []
  for (let i = 1; i < LAT + 1; i++) {
    const phi = -Math.PI / 2 + (Math.PI * i / (LAT + 1))
    const ring = []
    for (let j = 0; j <= SEG; j++) { const th = 2 * Math.PI * j / SEG; ring.push({ x: Math.cos(phi) * Math.cos(th), y: Math.sin(phi), z: Math.cos(phi) * Math.sin(th) }) }
    lats.push(ring)
  }
  for (let i = 0; i < LON; i++) {
    const th = 2 * Math.PI * i / LON
    const mer = []
    for (let j = 0; j <= SEG; j++) { const phi = -Math.PI / 2 + Math.PI * j / SEG; mer.push({ x: Math.cos(phi) * Math.cos(th), y: Math.sin(phi), z: Math.cos(phi) * Math.sin(th) }) }
    lons.push(mer)
  }
  const drawWire = (pts, a, side) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const A = rotX(rotY(pts[k], a), TILT)
      const B = rotX(rotY(pts[k + 1], a), TILT)
      const z = (A.z + B.z) / 2
      if (side === 'back' && z >= 0) continue
      if (side === 'front' && z < 0) continue
      const al = 0.14 + 0.7 * ((z + 1) / 2)
      ctx.strokeStyle = 'rgba(51,255,102,' + al.toFixed(3) + ')'
      ctx.lineWidth = 0.5 + 0.8 * ((z + 1) / 2)
      ctx.beginPath()
      ctx.moveTo(CX + A.x * R, CY - A.y * R)
      ctx.lineTo(CX + B.x * R, CY - B.y * R)
      ctx.stroke()
    }
  }
  const vPath = () => {
    const ht = 34
    const thick = 18
    const p = new Path2D()
    p.moveTo(CX - ht, CY + VT)
    p.lineTo(CX, CY + VB)
    p.lineTo(CX + ht, CY + VT)
    p.lineTo(CX + ht - thick, CY + VT)
    p.lineTo(CX, CY + VB - thick * 1.15)
    p.lineTo(CX - ht + thick, CY + VT)
    p.closePath()
    return p
  }
  const drawV = () => {
    const path = vPath()
    ctx.save()
    const g = ctx.createLinearGradient(0, CY + VT, 0, CY + VB)
    g.addColorStop(0, 'rgba(51,255,102,1)')
    g.addColorStop(1, 'rgba(20,120,55,1)')
    ctx.shadowColor = 'rgba(51,255,102,0.8)'
    ctx.shadowBlur = 8
    ctx.fillStyle = g
    ctx.fill(path)
    ctx.shadowBlur = 0
    ctx.save()
    ctx.clip(path)
    ctx.strokeStyle = 'rgba(10,14,10,0.85)'
    ctx.lineWidth = 2
    for (let y = CY + VT; y <= CY + VB; y += 5) { ctx.beginPath(); ctx.moveTo(CX - 50, y); ctx.lineTo(CX + 50, y); ctx.stroke() }
    ctx.restore()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = '#7dffa6'
    ctx.stroke(path)
    ctx.restore()
  }
  return (ang) => {
    ctx.clearRect(0, 0, cv.width, cv.height)
    for (const ring of lats) drawWire(ring, ang, 'back')
    for (const mer of lons) drawWire(mer, ang, 'back')
    drawV()
    for (const ring of lats) drawWire(ring, ang, 'front')
    for (const mer of lons) drawWire(mer, ang, 'front')
    ctx.strokeStyle = '#33ff66'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(CX, CY, R, 0, 2 * Math.PI)
    ctx.stroke()
  }
}

function showView(name) {
  for (const v of ['loading', 'setup', 'locked', 'app']) $('view-' + v).classList.toggle('hidden', v !== name)
  $('btn-lock').classList.toggle('hidden', name !== 'app')
}

async function routeView() {
  const status = await auth.initAuth()
  if (key()) {
    showView('app')
    return
  }
  if (status.isNew) {
    state.setup = { masterKey: null, hasFp: false, hasPw: false }
    showView('setup')
    updateSetupStatus()
    await applySetupFpAvailability()
    return
  }
  $('btn-unlock-fp').classList.toggle('hidden', !status.hasFingerprint)
  const pwRow = $('input-unlock-password').parentElement
  pwRow.classList.toggle('hidden', !status.hasPassword)
  showView('locked')
}

async function promptAuth() {
  const status = await auth.initAuth()
  let note = 'Enter your master password.'
  if (status.hasFingerprint) {
    const record = await getNativeRecord()
    const r = await platform.biometricUnlock(record)
    if (r.success) return { success: true, masterKey: r.masterKey }
    noteFingerprintResult(record, r)
    note = fingerprintFailureText(r) + ' Enter your master password instead.'
  }
  if (!status.hasPassword) return { success: false }
  const pw = await askSecret('Unlock', 'Master password', note)
  if (!pw) return { success: false }
  const result = await auth.authenticatePassword(pw)
  if (result.success) {
    if (await clearDeadFingerprint()) {
      if (key()) loadAuthStatus()
      showMsg('msg-manage', FINGERPRINT_RESET_TEXT, 'info')
    }
    return { success: true, masterKey: result.masterKey }
  }
  return { success: false, error: result.error }
}

async function requireFreshAuth() {
  const r = await promptAuth()
  if (!r.success) return null
  session.setMasterKey(r.masterKey)
  return r.masterKey
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

async function requireTransferAuth(msgId) {
  const status = await auth.initAuth()
  if (status.isNew) return true
  if (await requireFreshAuth()) return true
  showMsg(msgId, 'Authentication required', 'error')
  return false
}

async function enterApp(masterKey) {
  session.setMasterKey(masterKey)
  let migrationError = null
  try { await passwords.ensureVault(masterKey) } catch (e) { migrationError = e }
  resetSectionLocks()
  showView('app')
  await loadAuthStatus()
  loadSettingsIntoForm()
  showTab(state.tab)
  if (migrationError) showMsg('msg-manage', 'Your saved logins could not be upgraded: ' + errText(migrationError) + '. Nothing was lost; the old copy was kept.', 'error')
}

function resetSectionLocks() {
  state.unlocked.logins = false
  state.unlocked.webcreds = false
  state.unlocked.personal = false
  state.openGroups.logins.clear()
  state.openGroups.webcreds.clear()
}

function closeDialogs() {
  closeAllDialogs()
  for (const overlay of document.querySelectorAll('.wv-dialog-overlay')) overlay.remove()
}

async function handleLocked() {
  stopShare()
  stopScanner()
  closeDialogs()
  resetSectionLocks()
  walletsTab.lock()
  for (const id of ['credentials-list', 'webcreds-list', 'personalinfo-content', 'bookmarks-list']) {
    const node = $(id)
    if (node) node.textContent = ''
  }
  $('input-unlock-password').value = ''
  await routeView()
}

function updateSetupStatus() {
  $('setup-state-fp').textContent = state.setup.hasFp ? 'Enrolled' : ''
  setEnrollButton($('btn-setup-fp'), state.setup.hasFp)
  setEnrollButton($('btn-setup-pw'), state.setup.hasPw)
  $('btn-setup-done').disabled = !(state.setup.hasFp || state.setup.hasPw)
}

function setEnrollButton(button, enrolled) {
  button.textContent = enrolled ? 'Re-enroll' : 'Enroll'
  button.classList.toggle('reenroll', enrolled)
  button.classList.toggle('enroll', !enrolled)
}

async function applySetupFpAvailability() {
  const available = state.setup.hasFp || await platform.biometricAvailable()
  $('btn-setup-fp').classList.toggle('hidden', !available)
  $('setup-fp-note').classList.toggle('hidden', available)
}

async function setupEnrollFingerprint() {
  if (!(await platform.biometricAvailable())) {
    await applySetupFpAvailability()
    showMsg('msg-setup', 'Fingerprint / PIN is not available on this device. Use a master password instead: type one above and tap Enroll.', 'error')
    $('setup-password').focus()
    return
  }
  const mk = state.setup.masterKey || await newMasterKey()
  const r = await platform.biometricEnroll(mk, await getNativeRecord())
  if (!r.success) {
    showMsg('msg-setup', fingerprintFailureText(r) + ' Try again, or enroll a master password instead.', 'error')
    return
  }
  await saveNativeRecord(r.record)
  state.setup.masterKey = mk
  state.setup.hasFp = true
  updateSetupStatus()
  showMsg('msg-setup', 'Fingerprint enrolled', 'success')
}

async function setupEnrollPassword() {
  const pw = $('setup-password').value
  const problem = passwordProblem(pw)
  if (problem) { showMsg('msg-setup', problem, 'error'); return }
  auth.startPasswordCreation()
  const result = await auth.setPassword(pw, state.setup.masterKey)
  if (!result.success) { showMsg('msg-setup', result.error, 'error'); return }
  state.setup.masterKey = result.masterKey
  state.setup.hasPw = true
  $('setup-password').value = ''
  updateSetupStatus()
  showMsg('msg-setup', 'Password enrolled', 'success')
}

async function setupFinish() {
  if (!state.setup.masterKey) return
  const mk = state.setup.masterKey
  state.setup = { masterKey: null, hasFp: false, hasPw: false }
  await enterApp(mk)
  showMsg('msg-manage', 'Vault ready. To bring logins from another device, import its master key first in Sync.', 'success')
}

async function resetUnlockMethods() {
  const record = await getNativeRecord()
  const a = await store.getAuth() || {}
  for (const name of Object.keys(a)) {
    if (/^(password|fingerprint|pin)/.test(name)) delete a[name]
  }
  await store.setAuth(a)
  if (record) await platform.biometricRemove(aliasOf(record))
}

async function newPasswordDialog(title, text) {
  const values = await formDialog({
    title,
    text,
    fields: [
      { label: 'New master password', secret: true, hint: PASSWORD_RULE_TEXT },
      { label: 'Confirm password', secret: true }
    ],
    okLabel: 'Save',
    validate: (v) => {
      const problem = passwordProblem(v[0])
      if (problem) return { error: problem, focus: 0 }
      if (v[0] !== v[1]) return { error: 'The passwords do not match.', focus: 1 }
      return { value: v[0] }
    }
  })
  return values || null
}

async function chooseImportLock(forSetup) {
  if (!(await platform.biometricAvailable())) return 'password'
  const values = await formDialog({
    title: 'Lock the imported key',
    text: (forSetup ? 'Choose how this phone unlocks your vault. ' : 'Choose how this phone unlocks the imported key. ') + 'Fingerprint or device PIN is recommended: the unlock secret stays in secure hardware on this phone. A password works too, and you can add the other method later in Manage.',
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
  return values ? values[0] : null
}

async function optionalPasswordDialog(title, text, okLabel, cancelLabel) {
  const pw = await formDialog({
    title,
    text,
    fields: [
      { label: 'Master password', secret: true, hint: PASSWORD_RULE_TEXT },
      { label: 'Confirm password', secret: true }
    ],
    okLabel,
    cancelLabel,
    validate: (v) => {
      const problem = passwordProblem(v[0])
      if (problem) return { error: problem, focus: 0 }
      if (v[0] !== v[1]) return { error: 'The passwords do not match.', focus: 1 }
      return { value: v[0] }
    }
  })
  return pw || null
}

async function planFreshUnlock(importedKey, msgId) {
  let method = await chooseImportLock(true)
  if (!method) return null
  const plan = { record: null, password: null, removePassword: false, removeFingerprint: false, note: '' }
  if (method === 'device') {
    const r = await platform.biometricEnroll(importedKey, await getNativeRecord())
    if (r.success) {
      plan.record = r.record
      plan.password = await optionalPasswordDialog('Backup password', 'Add a master password as a backup way to unlock? You can also add one later in Manage.', 'Add password', 'Skip')
      if (!plan.password) plan.note = ' Add a backup password in Manage any time.'
    } else {
      showMsg(msgId, fingerprintFailureText(r) + ' Set a master password instead.', 'error')
      method = 'password'
    }
  }
  if (method === 'password') {
    plan.password = await newPasswordDialog('Set a master password', 'This phone unlocks your imported key with this password.')
    if (!plan.password) return null
  }
  return plan
}

async function commitUnlockPlan(plan, importedKey) {
  if (plan.record) await saveNativeRecord(plan.record)
  if (plan.password) {
    auth.startPasswordCreation()
    const result = await auth.setPassword(plan.password, importedKey)
    if (!result.success) {
      if (plan.record) await auth.removePassword()
      return { success: false, error: result.error }
    }
  }
  if (plan.removePassword) await auth.removePassword()
  if (plan.removeFingerprint) await removeNativeFingerprint()
  return { success: true }
}

async function setupFromPackage(pkg, sourceLabel, msgId, recovering) {
  const importedKey = await unlockKeyPackage(pkg, sourceLabel)
  if (!importedKey) { showMsg(msgId, 'Key import cancelled. Nothing changed.', 'error'); return }
  const matches = await vaultFile.localVaultOpensWith(importedKey)
  if (recovering && !matches) {
    const proceed = await confirmDialog({
      title: 'This key does not open this vault',
      text: 'The vault saved on this phone was made with a different master key. Using this key clears that vault from this phone, then you can import or scan the vault that goes with this key.',
      okLabel: 'Use this key',
      danger: true
    })
    if (!proceed) { showMsg(msgId, 'Key import cancelled. Nothing changed.', 'error'); return }
  }
  const plan = await planFreshUnlock(importedKey, msgId)
  if (!plan) { showMsg(msgId, 'Key import cancelled. Nothing changed.', 'error'); return }
  await resetUnlockMethods()
  const committed = await commitUnlockPlan(plan, importedKey)
  if (!committed.success) {
    await resetUnlockMethods()
    showMsg(msgId, 'Could not save the key: ' + committed.error + ' Nothing changed.', 'error')
    return
  }
  if (!matches) await store.clearVaultData()
  try { await keypackage.savePackage(importedKey, pkg) } catch (e) {}
  state.setup = { masterKey: null, hasFp: false, hasPw: false }
  if (recovering && matches) {
    state.tab = 'manage'
    await enterApp(importedKey)
    showMsg('msg-manage', 'Unlock restored with your key file.' + plan.note, 'success')
    return
  }
  state.tab = 'sync'
  await enterApp(importedKey)
  showMsg('msg-sync', 'Master key saved on this phone.' + plan.note + ' Now bring your vault: scan Share Vault from your other device below, or use Import Vault for a vault file.', 'success')
  await offerVaultImport()
}

async function offerVaultImport() {
  const values = await formDialog({
    title: 'Bring your vault',
    text: 'Your key is ready. Import your vault now so this phone has your logins.',
    fields: [{
      label: 'How',
      options: [
        { value: 'scan', label: 'Scan Share Vault from my other device' },
        { value: 'file', label: 'Open a vault file' }
      ],
      value: 'scan'
    }],
    okLabel: 'Continue',
    cancelLabel: 'Later'
  })
  if (!values) return
  if (values[0] === 'scan') startScanner($('qr-scan-box'), handleImported, 'msg-sync')
  else importVaultFile(true)
}

function parseKeyPayload(text) {
  let data = null
  try { data = JSON.parse(text) } catch (e) { return { error: 'That is not a Valid Vault key.' } }
  if (data && data.kind === 'keyfile') {
    if (!keypackage.isKeyPackage(data.key)) return { error: 'That key code is damaged or incomplete. Scan it again.' }
    return { pkg: data.key }
  }
  if (data && data.kind === 'key') return { error: 'Refused: this code carries an unprotected master key from an older version. Update the other device, or move the key with Export Key and Import Key.' }
  if (data && data.kind === 'vault') return { error: 'That is a vault code. Bring your master key first, then the vault.' }
  if (keypackage.isKeyPackage(data)) return { pkg: data }
  return { error: 'That is not a Valid Vault key.' }
}

function scanKeyInto(boxId, msgId, recovering) {
  startScanner($(boxId), async (payload) => {
    const parsed = parseKeyPayload(payload)
    if (parsed.error) { showMsg(msgId, parsed.error, 'error'); return }
    await setupFromPackage(parsed.pkg, 'Scanned key', msgId, recovering)
  }, msgId)
}

async function openKeyFileInto(msgId, recovering) {
  const text = await platform.pickTextFile()
  if (!text) { showMsg(msgId, 'No file selected', 'error'); return }
  const parsed = parseKeyPayload(text)
  if (parsed.error) { showMsg(msgId, parsed.error === 'That is not a Valid Vault key.' ? 'Not a key file' : parsed.error, 'error'); return }
  await setupFromPackage(parsed.pkg, 'Key file', msgId, recovering)
}

async function unlockWithFingerprint() {
  const record = await getNativeRecord()
  const r = await platform.biometricUnlock(record)
  if (!r.success) {
    noteFingerprintResult(record, r)
    const status = await auth.initAuth()
    if (status.hasPassword) {
      showMsg('msg-locked', fingerprintFailureText(r) + ' Unlock with your password.', 'error')
      $('input-unlock-password').focus()
    } else if (r.code === 'cancelled' || r.code === 'locked-out') {
      showMsg('msg-locked', fingerprintFailureText(r) + ' Try again.', 'error')
    } else {
      showMsg('msg-locked', fingerprintFailureText(r) + ' This phone has no password set, so restore access with your key file under Can\'t unlock? below.', 'error')
      document.querySelector('details.recover').open = true
    }
    return
  }
  await enterApp(r.masterKey)
}

async function unlockWithPassword() {
  const input = $('input-unlock-password')
  const pw = input.value
  if (!pw) { showMsg('msg-locked', 'Enter your password', 'error'); return }
  const result = await auth.authenticatePassword(pw)
  if (!result.success) { showMsg('msg-locked', result.error || 'Invalid password', 'error'); return }
  input.value = ''
  const reset = await clearDeadFingerprint()
  if (reset) state.tab = 'manage'
  await enterApp(result.masterKey)
  if (reset) showMsg('msg-manage', FINGERPRINT_RESET_TEXT, 'info')
}

function showTab(name) {
  if (!TABS.includes(name)) name = 'manage'
  if (state.tab === 'wallets' && name !== 'wallets') walletsTab.onTabHidden()
  state.tab = name
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === name)
  for (const tabName of TABS) $('tab-' + tabName).classList.toggle('active', tabName === name)
  const active = document.querySelector('.tab.active')
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' })
  window.scrollTo(0, 0)
  if (name === 'manage') { loadAuthStatus(); loadCredentials() }
  if (name === 'personal') loadPersonalInfo()
  if (name === 'webcreds') loadWebCredentials()
  if (name === 'wallets') walletsTab.onTabShown()
  if (name === 'bookmarks') loadBookmarks()
}

async function loadAuthStatus() {
  const status = await auth.initAuth()
  const available = await platform.biometricAvailable()
  $('card-fp').classList.toggle('active', status.hasFingerprint)
  $('status-fp').textContent = status.hasFingerprint ? 'Enrolled' : (available ? 'Not enrolled' : 'Not available on this device')
  setEnrollButton($('btn-edit-fp'), status.hasFingerprint)
  $('btn-edit-fp').classList.toggle('hidden', !status.hasFingerprint && !available)
  $('btn-del-fp').classList.toggle('hidden', !status.hasFingerprint)
  $('card-pw').classList.toggle('active', status.hasPassword)
  $('status-pw').textContent = status.hasPassword ? 'Enrolled' : 'Not enrolled'
  setEnrollButton($('btn-edit-pw'), status.hasPassword)
  $('btn-del-pw').classList.toggle('hidden', !status.hasPassword)
}

async function editFingerprint() {
  const mk = await requirePasswordFirstAuth()
  if (!mk) { showMsg('msg-manage', 'Authentication required', 'error'); return }
  if (!(await platform.biometricAvailable())) { showMsg('msg-manage', 'Fingerprint / PIN is not available on this device.', 'error'); return }
  const r = await platform.biometricEnroll(mk, await getNativeRecord())
  if (!r.success) { showMsg('msg-manage', fingerprintFailureText(r) + ' Your existing unlock methods still work.', 'error'); return }
  await saveNativeRecord(r.record)
  showMsg('msg-manage', 'Fingerprint enrolled', 'success')
  loadAuthStatus()
}

async function deleteFingerprint() {
  if (!(await requirePasswordFirstAuth())) { showMsg('msg-manage', 'Authentication required', 'error'); return }
  if (!(await confirmDialog({ title: 'Delete fingerprint unlock?', text: 'Your master password keeps working. You can re-enroll fingerprint later.', okLabel: 'Delete', danger: true }))) return
  const result = await removeNativeFingerprint()
  if (result.success) showMsg('msg-manage', 'Fingerprint removed', 'success')
  else showMsg('msg-manage', result.error, 'error')
  loadAuthStatus()
}

async function editPassword() {
  const mk = await requireFreshAuth()
  if (!mk) { showMsg('msg-manage', 'Authentication required', 'error'); return }
  const pw = await newPasswordDialog('Set master password', PASSWORD_RULE_TEXT)
  if (!pw) return
  auth.startPasswordCreation()
  const result = await auth.setPassword(pw, mk)
  if (result.success) showMsg('msg-manage', 'Password enrolled', 'success')
  else showMsg('msg-manage', result.error, 'error')
  loadAuthStatus()
}

async function deletePassword() {
  if (!(await requireFreshAuth())) { showMsg('msg-manage', 'Authentication required', 'error'); return }
  if (!(await confirmDialog({ title: 'Delete password unlock?', text: 'Fingerprint or device PIN becomes the only way to unlock this phone. Keep a key file backup.', okLabel: 'Delete', danger: true }))) return
  const result = await auth.removePassword()
  if (result.success) showMsg('msg-manage', 'Password removed', 'success')
  else showMsg('msg-manage', result.error, 'error')
  loadAuthStatus()
}

function renderGate(container, label, msgId, section, reload) {
  container.textContent = ''
  const gate = el('div', 'gate')
  gate.appendChild(btn('🔐 ' + label, '', async () => {
    const r = await promptAuth()
    if (!r.success) { showMsg(msgId, 'Authentication required', 'error'); return }
    session.setMasterKey(r.masterKey)
    state.unlocked[section] = true
    reload()
  }))
  container.appendChild(gate)
}

function siteKey(input) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return null
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : 'https://' + raw)
    const host = url.hostname.replace(/\.$/, '')
    if (!host || (!host.includes('.') && host !== 'localhost')) return null
    return host
  } catch (e) {
    return null
  }
}

function renderGroup(container, name, count, unit, section, fill) {
  const group = el('div', 'group')
  const head = el('div', 'group-head')
  const arrow = el('span', 'group-arrow', '▶')
  head.appendChild(arrow)
  head.appendChild(el('div', 'group-name', name))
  head.appendChild(el('div', 'group-count', count + ' ' + unit + (count !== 1 ? 's' : '')))
  const body = el('div', 'group-body')
  const open = state.openGroups[section].has(name)
  body.classList.toggle('hidden', !open)
  group.classList.toggle('open', open)
  arrow.textContent = open ? '▼' : '▶'
  head.onclick = () => {
    const nowOpen = body.classList.contains('hidden')
    body.classList.toggle('hidden', !nowOpen)
    group.classList.toggle('open', nowOpen)
    arrow.textContent = nowOpen ? '▼' : '▶'
    if (nowOpen) state.openGroups[section].add(name)
    else state.openGroups[section].delete(name)
  }
  fill(body)
  group.appendChild(head)
  group.appendChild(body)
  container.appendChild(group)
}

async function loadCredentials() {
  const list = $('credentials-list')
  if (!key()) return
  if (!state.unlocked.logins) {
    renderGate(list, 'Unlock to view credentials', 'msg-manage', 'logins', loadCredentials)
    return
  }
  let tree
  try {
    tree = await passwords.readVaultTree(key())
  } catch (e) {
    list.innerHTML = ''
    list.appendChild(el('div', 'empty wv-error', 'Could not open saved credentials with the current master key'))
    return
  }
  const domains = Object.keys(tree.credentials).filter((d) => tree.credentials[d].some((c) => !c.deleted)).sort()
  list.textContent = ''
  if (domains.length === 0) {
    list.appendChild(el('div', 'empty', 'No saved credentials yet. Tap Add Login, or import a vault in Sync.'))
    return
  }
  for (const domain of domains) {
    const creds = tree.credentials[domain].filter((c) => !c.deleted)
    renderGroup(list, domain, creds.length, 'account', 'logins', (body) => {
      creds.forEach((cred, i) => body.appendChild(renderLogin(domain, cred, i)))
    })
  }
}

function renderLogin(domain, cred, index) {
  const row = el('div', 'item')
  const top = el('div', 'item-top')
  const typeSelect = el('select', 'logintype')
  for (const t of LOGIN_TYPES) {
    const opt = el('option', '', t.label)
    opt.value = t.value
    typeSelect.appendChild(opt)
  }
  typeSelect.value = cred.loginType || 'username'
  typeSelect.onclick = (e) => e.stopPropagation()
  typeSelect.onchange = async () => {
    const result = await passwords.updateCredential(cred.id, { loginType: typeSelect.value }, key())
    if (result.success) { cred.loginType = typeSelect.value; showMsg('msg-manage', 'Account type updated', 'success') }
    else { typeSelect.value = cred.loginType || 'username'; showMsg('msg-manage', 'Update failed: ' + result.error, 'error') }
  }
  const label = el('div', 'item-label', 'Account ' + (index + 1))
  const actions = el('div', 'item-actions')
  const secret = el('div', 'item-secret', MASK)
  const extra = el('div', 'item-extra hidden')
  let shown = false
  const showButton = btn('Show', 'small secondary', async () => {
    if (shown) {
      shown = false
      showButton.textContent = 'Show'
      label.textContent = 'Account ' + (index + 1)
      secret.textContent = MASK
      extra.classList.add('hidden')
      extra.textContent = ''
      return
    }
    const result = await passwords.getCredentials(domain, key())
    const full = result.success ? result.credentials.find((c) => c.id === cred.id) : null
    if (!full) { showMsg('msg-manage', 'Could not read this login', 'error'); return }
    shown = true
    showButton.textContent = 'Hide'
    label.textContent = full.username
    secret.textContent = full.password
    renderLoginExtras(extra, domain, full)
  })
  actions.appendChild(showButton)
  actions.appendChild(btn('Edit', 'small secondary', async () => {
    const values = await formDialog({
      title: 'Edit password',
      text: 'The username stays the same. A different username is a separate login. The old password is kept as a previous password you can restore.',
      fields: [{ label: 'New password', secret: true, actions: generateActions(), hint: GENERATE_HINT }],
      okLabel: 'Save',
      validate: (v) => (v[0] ? { value: v[0] } : { error: 'Enter a password.', focus: 0 })
    })
    if (!values) return
    const result = await passwords.updateCredential(cred.id, { password: values }, key())
    if (result.success) { showMsg('msg-manage', 'Password updated', 'success'); loadCredentials() }
    else showMsg('msg-manage', 'Update failed: ' + result.error, 'error')
  }))
  actions.appendChild(btn('Delete', 'small danger', async () => {
    const result = await passwords.getCredentials(domain, key())
    const full = result.success ? result.credentials.find((c) => c.id === cred.id) : null
    const who = full ? full.username : 'this login'
    if (!(await confirmDialog({ title: 'Delete login?', text: 'Delete ' + who + ' on ' + domain + '? The delete carries to your other devices when you sync.', okLabel: 'Delete', danger: true }))) return
    const del = await passwords.deleteCredential(cred.id, key())
    if (del.success) { showMsg('msg-manage', 'Credential deleted', 'success'); loadCredentials() }
    else showMsg('msg-manage', 'Delete failed: ' + del.error, 'error')
  }))
  top.appendChild(typeSelect)
  top.appendChild(label)
  top.appendChild(actions)
  row.appendChild(top)
  row.appendChild(secret)
  row.appendChild(extra)
  return row
}

function renderLoginExtras(container, domain, credential) {
  container.classList.remove('hidden')
  container.textContent = ''
  if (credential.previousPassword) {
    const prev = el('div', 'extra-row')
    prev.appendChild(el('span', 'extra-label', 'Previous password' + (credential.previousSetAt ? ', changed ' + new Date(credential.previousSetAt).toLocaleDateString() : '')))
    const value = el('span', 'extra-value', MASK)
    let visible = false
    prev.appendChild(value)
    prev.appendChild(btn('Show', 'small secondary', (e) => {
      visible = !visible
      value.textContent = visible ? credential.previousPassword : MASK
      e.target.textContent = visible ? 'Hide' : 'Show'
    }))
    prev.appendChild(btn('Restore', 'small secondary', async () => {
      if (!(await confirmDialog({ title: 'Restore previous password?', text: 'The current password becomes the previous one, so you can switch back.', okLabel: 'Restore' }))) return
      const r = await passwords.restorePreviousPassword(domain, credential.username, key())
      if (r.success) { showMsg('msg-manage', 'Previous password restored', 'success'); loadCredentials() }
      else showMsg('msg-manage', r.error, 'error')
    }))
    container.appendChild(prev)
  }
  const fields = credential.extraFields || []
  if (fields.length === 0) container.appendChild(el('div', 'note', 'No additional fields saved'))
  fields.forEach((field, idx) => {
    const row = el('div', 'extra-row')
    row.appendChild(el('span', 'extra-label', field.label))
    row.appendChild(el('span', 'extra-value', field.value))
    row.appendChild(btn('Edit', 'small secondary', async () => {
      const value = await formDialog({
        title: 'Edit ' + field.label,
        fields: [{ label: field.label, secret: true, value: field.value }],
        okLabel: 'Save',
        validate: (v) => ({ value: v[0] })
      })
      if (value === null) return
      const updated = fields.map((f, i) => (i === idx ? { label: f.label, value } : f))
      const r = await passwords.updateCredential(credential.id, { extraFields: updated }, key())
      if (r.success) { showMsg('msg-manage', 'Updated', 'success'); loadCredentials() }
      else showMsg('msg-manage', 'Update failed: ' + r.error, 'error')
    }))
    row.appendChild(btn('Delete', 'small danger', async () => {
      if (!(await confirmDialog({ title: 'Delete field?', text: 'Delete "' + field.label + '"?', okLabel: 'Delete', danger: true }))) return
      const updated = fields.filter((f, i) => i !== idx)
      const r = await passwords.updateCredential(credential.id, { extraFields: updated }, key())
      if (r.success) { showMsg('msg-manage', 'Deleted', 'success'); loadCredentials() }
      else showMsg('msg-manage', 'Delete failed: ' + r.error, 'error')
    }))
    container.appendChild(row)
  })
  container.appendChild(btn('+ Add Field', 'small secondary', async () => {
    const values = await formDialog({
      title: 'Add field',
      text: 'Extra details for this login, like an account number or PIN.',
      fields: [{ label: 'Field name', placeholder: 'Account Number' }, { label: 'Value', secret: true }],
      okLabel: 'Add',
      validate: (v) => {
        if (!v[0].trim()) return { error: 'Enter a field name.', focus: 0 }
        if (!v[1]) return { error: 'Enter a value.', focus: 1 }
        return { value: { label: v[0].trim(), value: v[1] } }
      }
    })
    if (!values) return
    const r = await passwords.updateCredential(credential.id, { extraFields: fields.concat([values]) }, key())
    if (r.success) { showMsg('msg-manage', 'Added', 'success'); loadCredentials() }
    else showMsg('msg-manage', 'Add failed: ' + r.error, 'error')
  }))
}

async function addLogin() {
  if (!state.unlocked.logins) {
    const r = await promptAuth()
    if (!r.success) { showMsg('msg-manage', 'Authentication required', 'error'); return }
    session.setMasterKey(r.masterKey)
    state.unlocked.logins = true
  }
  const values = await formDialog({
    title: 'Add login',
    fields: [
      { label: 'Website', placeholder: 'accounts.example.com', hint: 'Use the address as it shows in your browser, so autofill can match it later.' },
      { label: 'Signs in with', options: [{ value: '', label: 'Detect automatically' }].concat(LOGIN_TYPES), value: '' },
      { label: 'Username, email, or phone' },
      { label: 'Password', secret: true, actions: generateActions(), hint: GENERATE_HINT }
    ],
    okLabel: 'Save',
    validate: (v) => {
      const site = siteKey(v[0])
      if (!site) return { error: 'Enter a website address, like example.com.', focus: 0 }
      if (!v[2].trim()) return { error: 'Enter the username, email, or phone.', focus: 2 }
      if (!v[3]) return { error: 'Enter or generate a password.', focus: 3 }
      return { value: { site, loginType: v[1] || null, username: v[2].trim(), password: v[3] } }
    }
  })
  if (!values) return
  const tree = await passwords.readVaultTree(key())
  const existed = (tree.credentials[values.site] || []).some((c) => !c.deleted && c.username === values.username)
  await passwords.saveCredential(values.site, values.username, values.password, key(), [], values.loginType)
  state.openGroups.logins.add(values.site)
  showMsg('msg-manage', existed ? 'That login already existed, so its password was updated. The old one is kept as the previous password.' : 'Login saved', 'success')
  loadCredentials()
}

async function loadWebCredentials() {
  const list = $('webcreds-list')
  if (!key()) return
  if (!state.unlocked.webcreds) {
    renderGate(list, 'Unlock to view misc credentials', 'msg-webcreds', 'webcreds', loadWebCredentials)
    return
  }
  const vault = await store.getWebCredsVault()
  const categories = Object.keys((vault && vault.credentials) || {}).filter((c) => vault.credentials[c].some((x) => !x.deleted)).sort()
  list.textContent = ''
  if (categories.length === 0) {
    list.appendChild(el('div', 'empty', 'No misc credentials saved'))
    return
  }
  for (const category of categories) {
    const items = vault.credentials[category].filter((c) => !c.deleted)
    renderGroup(list, category, items.length, 'item', 'webcreds', (body) => {
      for (const item of items) body.appendChild(renderWebCred(category, item))
    })
  }
}

function renderWebCred(category, cred) {
  const row = el('div', 'item')
  const top = el('div', 'item-top')
  const label = el('div', 'item-label', 'Item')
  const secret = el('div', 'item-secret', MASK)
  const actions = el('div', 'item-actions')
  let shown = false
  const showButton = btn('Show', 'small secondary', async () => {
    if (shown) {
      shown = false
      showButton.textContent = 'Show'
      label.textContent = 'Item'
      secret.textContent = MASK
      return
    }
    const r = await webcreds.getWebCredentials(category, key())
    const item = r.success ? r.credentials.find((c) => c.id === cred.id) : null
    if (!item) { showMsg('msg-webcreds', 'Could not read this item', 'error'); return }
    shown = true
    showButton.textContent = 'Hide'
    label.textContent = item.name
    secret.textContent = item.value
  })
  actions.appendChild(showButton)
  actions.appendChild(btn('Edit', 'small secondary', async () => {
    const value = await formDialog({
      title: 'Edit value',
      text: 'The name stays the same. A different name is a separate item.',
      fields: [{ label: 'New value', secret: true }],
      okLabel: 'Save',
      validate: (v) => (v[0] ? { value: v[0] } : { error: 'Enter a value.', focus: 0 })
    })
    if (!value) return
    const r = await webcreds.updateWebCredential(cred.id, { value }, key())
    if (r.success) { showMsg('msg-webcreds', 'Updated', 'success'); loadWebCredentials() }
    else showMsg('msg-webcreds', 'Update failed: ' + r.error, 'error')
  }))
  actions.appendChild(btn('Delete', 'small danger', async () => {
    const r = await webcreds.getWebCredentials(category, key())
    const item = r.success ? r.credentials.find((c) => c.id === cred.id) : null
    const name = item ? item.name : 'this item'
    if (!(await confirmDialog({ title: 'Delete item?', text: 'Delete "' + name + '" from ' + category + '?', okLabel: 'Delete', danger: true }))) return
    const del = await webcreds.deleteWebCredential(cred.id)
    if (del.success) { showMsg('msg-webcreds', 'Deleted', 'success'); loadWebCredentials() }
    else showMsg('msg-webcreds', 'Delete failed: ' + del.error, 'error')
  }))
  top.appendChild(label)
  top.appendChild(actions)
  row.appendChild(top)
  row.appendChild(secret)
  return row
}

async function addWebCredential() {
  if (!state.unlocked.webcreds) {
    const r = await promptAuth()
    if (!r.success) { showMsg('msg-webcreds', 'Authentication required', 'error'); return }
    session.setMasterKey(r.masterKey)
    state.unlocked.webcreds = true
  }
  const values = await formDialog({
    title: 'Add misc credential',
    fields: [
      { label: 'Category', placeholder: 'Wi-Fi' },
      { label: 'Name', placeholder: 'Home Router' },
      { label: 'Value', secret: true, actions: generateActions(), hint: GENERATE_HINT }
    ],
    okLabel: 'Save',
    validate: (v) => {
      if (!v[0].trim()) return { error: 'Enter a category.', focus: 0 }
      if (!v[1].trim()) return { error: 'Enter a name.', focus: 1 }
      if (!v[2]) return { error: 'Enter a value.', focus: 2 }
      return { value: { category: v[0].trim(), name: v[1].trim(), value: v[2] } }
    }
  })
  if (!values) return
  const r = await webcreds.saveWebCredential(values.category, values.name, values.value, key())
  if (r.success) {
    state.openGroups.webcreds.add(values.category)
    showMsg('msg-webcreds', 'Saved', 'success')
    loadWebCredentials()
  } else showMsg('msg-webcreds', 'Save failed', 'error')
}

async function loadPersonalInfo() {
  const content = $('personalinfo-content')
  if (!key()) return
  if (!state.unlocked.personal) {
    renderGate(content, 'Unlock to view Personal Info', 'msg-personalinfo', 'personal', loadPersonalInfo)
    return
  }
  const result = await personalinfo.getProfile(key())
  content.textContent = ''
  if (!result.success) { content.appendChild(el('div', 'empty wv-error', result.error)); return }
  const p = result.profile
  const card = el('div', 'card')
  const fieldRow = (labelText, value, fieldKey) => {
    const row = el('div', 'field-row')
    row.appendChild(el('span', 'field-label', labelText))
    row.appendChild(el('span', 'field-value', value || '(not set)'))
    row.appendChild(btn('Edit', 'small secondary', () => editPersonalField(fieldKey, labelText)))
    card.appendChild(row)
  }
  fieldRow('First Name', p.firstName, 'firstName')
  fieldRow('Last Name', p.lastName, 'lastName')
  fieldRow('Phone', p.phone, 'phone')
  card.appendChild(el('h3', '', 'Emails'))
  const emails = (p.emails || []).slice().sort((a, b) => a.position - b.position)
  if (emails.length === 0) card.appendChild(el('div', 'note', 'No emails saved.'))
  emails.forEach((e, i) => {
    const row = el('div', 'field-row')
    row.appendChild(el('span', 'field-value', e.value + (i === 0 ? ' (Primary)' : '')))
    const up = btn('↑', 'small secondary', () => moveEmail(e.id, -1))
    const down = btn('↓', 'small secondary', () => moveEmail(e.id, 1))
    up.disabled = i === 0
    down.disabled = i === emails.length - 1
    row.appendChild(up)
    row.appendChild(down)
    row.appendChild(btn('Delete', 'small danger', () => deleteEmail(e.id)))
    card.appendChild(row)
  })
  card.appendChild(btn('+ Add Email', 'small', addEmail))
  card.appendChild(el('h3', '', 'Address'))
  const address = p.address || {}
  fieldRow('Street', address.street, 'address.street')
  fieldRow('City', address.city, 'address.city')
  fieldRow('State', address.state, 'address.state')
  fieldRow('ZIP', address.zip, 'address.zip')
  fieldRow('Country', address.country, 'address.country')
  content.appendChild(card)
}

async function freshProfile() {
  const r = await promptAuth()
  if (!r.success) { showMsg('msg-personalinfo', 'Authentication required', 'error'); return null }
  session.setMasterKey(r.masterKey)
  const current = await personalinfo.getProfile(r.masterKey)
  if (!current.success) { showMsg('msg-personalinfo', current.error, 'error'); return null }
  return current.profile
}

async function saveProfileAndReload(profile, okText) {
  const r = await personalinfo.saveProfile(profile, key())
  if (r.success) { if (okText) showMsg('msg-personalinfo', okText, 'success'); loadPersonalInfo() }
  else showMsg('msg-personalinfo', 'Save failed', 'error')
}

async function editPersonalField(fieldKey, labelText) {
  const profile = await freshProfile()
  if (!profile) return
  const isAddress = fieldKey.indexOf('address.') === 0
  const sub = isAddress ? fieldKey.split('.')[1] : null
  const current = isAddress ? ((profile.address && profile.address[sub]) || '') : (profile[fieldKey] || '')
  const values = await formDialog({ title: 'Edit ' + labelText, fields: [{ label: labelText, value: current }], okLabel: 'Save' })
  if (!values) return
  if (isAddress) {
    if (!profile.address) profile.address = { street: '', city: '', state: '', zip: '', country: '' }
    profile.address[sub] = values[0].trim()
  } else {
    profile[fieldKey] = values[0].trim()
  }
  await saveProfileAndReload(profile, 'Saved')
}

async function addEmail() {
  const profile = await freshProfile()
  if (!profile) return
  const values = await formDialog({
    title: 'Add email',
    fields: [{ label: 'Email address', placeholder: 'you@example.com' }],
    okLabel: 'Add',
    validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v[0].trim()) ? { value: v[0].trim() } : { error: 'Enter an email address.', focus: 0 })
  })
  if (!values) return
  if (!profile.emails) profile.emails = []
  profile.emails.push({ id: personalinfo.generateId(), value: values, position: profile.emails.length })
  await saveProfileAndReload(profile, 'Email added')
}

async function moveEmail(emailId, direction) {
  const profile = await freshProfile()
  if (!profile) return
  const sorted = (profile.emails || []).slice().sort((a, b) => a.position - b.position)
  const index = sorted.findIndex((e) => e.id === emailId)
  const swap = index + direction
  if (index === -1 || swap < 0 || swap >= sorted.length) return
  const tmp = sorted[index].position
  sorted[index].position = sorted[swap].position
  sorted[swap].position = tmp
  profile.emails = sorted
  await saveProfileAndReload(profile, '')
}

async function deleteEmail(emailId) {
  const profile = await freshProfile()
  if (!profile) return
  if (!(await confirmDialog({ title: 'Delete email?', text: 'Delete this email address?', okLabel: 'Delete', danger: true }))) return
  profile.emails = (profile.emails || []).filter((e) => e.id !== emailId).sort((a, b) => a.position - b.position).map((e, i) => Object.assign({}, e, { position: i }))
  await saveProfileAndReload(profile, 'Deleted')
}

function normalizeBookmarkInput(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : 'https://' + raw
  if (!bookmarks.isBookmarkable(withScheme)) return null
  return bookmarks.normalizeUrl(withScheme)
}

async function loadBookmarks() {
  const list = $('bookmarks-list')
  if (!key()) return
  let items
  try {
    items = await bookmarks.listBookmarks(key())
  } catch (e) {
    list.textContent = ''
    list.appendChild(el('div', 'empty wv-error', 'Could not open bookmarks with the current master key'))
    return
  }
  const filter = state.bookmarkFilter.trim().toLowerCase()
  const shown = filter ? items.filter((b) => b.title.toLowerCase().includes(filter) || b.url.toLowerCase().includes(filter)) : items
  list.textContent = ''
  if (items.length === 0) { list.appendChild(el('div', 'empty', 'No bookmarks yet. Tap Add Bookmark, or import a vault file from your browser.')); return }
  if (shown.length === 0) { list.appendChild(el('div', 'empty', 'No bookmarks match your search.')); return }
  shown.forEach((item) => {
    const index = items.indexOf(item)
    const row = el('div', 'bm-item')
    const text = el('div', 'bm-text')
    text.appendChild(el('div', 'bm-title', item.title))
    text.appendChild(el('div', 'bm-url', item.url))
    text.onclick = () => platform.openExternal(item.url)
    row.appendChild(text)
    const actions = el('div', 'bm-actions')
    const pair = el('div', 'pair')
    const up = btn('▲', 'small secondary', async () => { await bookmarks.moveBookmark(item.id, index - 1, key()); loadBookmarks() })
    const down = btn('▼', 'small secondary', async () => { await bookmarks.moveBookmark(item.id, index + 1, key()); loadBookmarks() })
    up.disabled = !!filter || index === 0
    down.disabled = !!filter || index === items.length - 1
    pair.appendChild(up)
    pair.appendChild(down)
    actions.appendChild(pair)
    const pair2 = el('div', 'pair')
    pair2.appendChild(btn('Rename', 'small secondary', async () => {
      const values = await formDialog({ title: 'Rename bookmark', fields: [{ label: 'Title', value: item.title }], okLabel: 'Save' })
      if (!values) return
      await bookmarks.renameBookmark(item.id, values[0], key())
      loadBookmarks()
    }))
    pair2.appendChild(btn('Remove', 'small danger', async () => {
      if (!(await confirmDialog({ title: 'Remove bookmark?', text: item.title, okLabel: 'Remove', danger: true }))) return
      await bookmarks.removeBookmark(item.id, key())
      showMsg('msg-bookmarks', 'Bookmark removed', 'success')
      loadBookmarks()
    }))
    actions.appendChild(pair2)
    row.appendChild(actions)
    list.appendChild(row)
  })
}

async function addBookmark() {
  const values = await formDialog({
    title: 'Add bookmark',
    fields: [{ label: 'Address', placeholder: 'example.com/page' }, { label: 'Title (optional)' }],
    okLabel: 'Save',
    validate: (v) => {
      const url = normalizeBookmarkInput(v[0])
      if (!url) return { error: 'Enter a web address that starts with http or https, or just the site, like example.com.', focus: 0 }
      return { value: { url, title: v[1].trim() } }
    }
  })
  if (!values) return
  const existing = await bookmarks.findByUrl(values.url, key())
  await bookmarks.saveBookmark(values.url, values.title || (existing ? existing.title : ''), key())
  showMsg('msg-bookmarks', existing ? 'That bookmark already existed, so it was updated' : 'Bookmark saved', 'success')
  loadBookmarks()
}

function refreshAfterSync() {
  if (state.tab === 'manage') loadCredentials()
  if (state.tab === 'webcreds') loadWebCredentials()
  if (state.tab === 'personal') loadPersonalInfo()
  if (state.tab === 'bookmarks') loadBookmarks()
}

function stopShare() {
  const s = state.share
  state.share = null
  state.shareToken = null
  if (s) {
    clearInterval(s.frameTimer)
    clearInterval(s.countdown)
    clearTimeout(s.shutoff)
  }
  $('share-qr').textContent = ''
  $('qr-overlay').classList.add('hidden')
}

async function streamShare(payload, label) {
  stopShare()
  const token = {}
  state.shareToken = token
  const encoder = await createEncoder(payload)
  if (state.shareToken !== token || !key()) return
  const container = $('share-qr')
  const timerEl = $('share-qr-timer')
  $('share-qr-label').textContent = label
  $('qr-overlay').classList.remove('hidden')
  const renderNext = () => {
    container.innerHTML = qrSvg(encoder.nextFrame())
  }
  renderNext()
  let remaining = state.settings.qrTimeout
  timerEl.textContent = 'Closes in ' + remaining + 's'
  state.share = {
    frameTimer: setInterval(renderNext, QR_FRAME_MS),
    countdown: setInterval(() => {
      remaining -= 1
      timerEl.textContent = remaining > 0 ? 'Closes in ' + remaining + 's' : 'Closing...'
      session.resetActivity()
    }, 1000),
    shutoff: setTimeout(stopShare, state.settings.qrTimeout * 1000)
  }
}

function stopScanner() {
  const s = state.scan
  if (!s) return
  state.scan = null
  s.settled = true
  if (s.raf) cancelAnimationFrame(s.raf)
  try { if (s.stream) s.stream.getTracks().forEach((t) => t.stop()) } catch (e) {}
  try { if (s.video) { s.video.pause(); s.video.srcObject = null } } catch (e) {}
  s.box.innerHTML = s.original
  if (s.wasHidden) s.box.classList.add('hidden')
}

async function startScanner(box, onPayload, msgId) {
  if (state.scan) return
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showMsg(msgId, 'Camera not available', 'error'); return }
  if (typeof window.jsQR !== 'function') { showMsg(msgId, 'Scanner failed to load', 'error'); return }
  const decoder = createDecoder()
  const scan = { box, original: box.innerHTML, wasHidden: box.classList.contains('hidden'), stream: null, raf: null, video: null, settled: false }
  state.scan = scan
  box.classList.remove('hidden')
  box.innerHTML = ''
  const video = el('video')
  video.setAttribute('playsinline', 'true')
  video.muted = true
  scan.video = video
  const canvas = el('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const cancel = btn('Cancel', 'scan-cancel', () => { stopScanner(); showMsg(msgId, 'Scan cancelled', 'info') })
  const status = el('div', 'scan-status', 'Point at the other device')
  box.appendChild(video)
  box.appendChild(cancel)
  box.appendChild(status)
  try {
    scan.stream = await openCamera()
    if (scan.settled) { scan.stream.getTracks().forEach((t) => t.stop()); return }
    video.srcObject = scan.stream
    await video.play()
    const tick = () => {
      if (scan.settled) return
      session.resetActivity()
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        let text = null
        try { text = readCode(video, canvas, ctx) } catch (e) {}
        if (text) {
          const outcome = decoder.addFrame(text)
          if (outcome.success) {
            status.textContent = 'Receiving: ' + outcome.solved + ' of ' + outcome.total
            if (outcome.complete) {
              stopScanner()
              showMsg(msgId, 'Received ' + outcome.total + ' of ' + outcome.total + ', importing...', 'info')
              decoder.assemble().then((assembled) => {
                if (!assembled.success) throw new Error(assembled.error)
                return onPayload(assembled.payload)
              }).catch((e) => showMsg(msgId, 'Import failed: ' + errText(e), 'error'))
              return
            }
          }
        }
      }
      scan.raf = requestAnimationFrame(tick)
    }
    scan.raf = requestAnimationFrame(tick)
  } catch (e) {
    stopScanner()
    showMsg(msgId, 'Camera failed: ' + errText(e) + '. Allow camera access for Valid Vault in Android settings.', 'error')
  }
}

async function handleImported(payloadText) {
  let data
  try { data = JSON.parse(payloadText) } catch (e) { showMsg('msg-sync', 'Unrecognized code', 'error'); return }
  try {
    if (data.kind === 'keyfile') {
      if (!keypackage.isKeyPackage(data.key)) { showMsg('msg-sync', 'That key code is damaged or incomplete. Scan it again.', 'error'); return }
      if (!(await requireTransferAuth('msg-sync'))) return
      await acceptKeyPackage(data.key, 'Scanned key')
      return
    }
    if (data.kind === 'key') {
      showMsg('msg-sync', 'Refused: this code carries an unprotected master key from an older version. Update the other device, or move the key with Export Key and Import Key.', 'error')
      return
    }
    if (data.kind === 'vault') {
      if (!key()) { showMsg('msg-sync', 'Unlock first', 'error'); return }
      const bundle = vaultFile.bundleFromPayload(data)
      if (!(await requireTransferAuth('msg-sync'))) return
      const result = await vaultFile.mergeBundle(bundle, key())
      showMsg('msg-sync', vaultFile.describeMerge(result), 'success')
      if (result.changed) refreshAfterSync()
      return
    }
    showMsg('msg-sync', 'Unrecognized code', 'error')
  } catch (e) {
    showMsg('msg-sync', 'Sync failed: ' + errText(e), 'error')
  }
}

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
    text: (isChange ? 'This replaces the passphrase and answers for new key shares and key files. Key files you already saved keep their old passphrase. ' : 'Your master key only leaves this phone wrapped under a passphrase and three security answers. Another device must enter all of them to accept it. You set this once; Share Master Key and Export Key reuse it. ') + 'Pick questions you will always remember the answers to. A lost passphrase or answer cannot be recovered.',
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
  if (!importedKey) { showMsg('msg-sync', 'Key import cancelled. Nothing changed.', 'error'); return }
  const adopted = await adoptImportedKey(importedKey)
  if (adopted) {
    try { await keypackage.savePackage(importedKey, pkg) } catch (e) {}
    $('key-nickname-input').value = await keypackage.getNickname()
  }
}

async function choosePasswordForImport(status) {
  if (status.hasPassword) {
    const current = await formDialog({
      title: 'Confirm key import',
      text: 'The imported key gets locked under this phone\'s master password, so it survives lock and unlock.',
      fields: [{ label: 'This phone\'s master password', secret: true }],
      okLabel: 'Continue',
      validate: async (v) => {
        if (!v[0]) return { error: 'Enter your password.', focus: 0 }
        const check = await auth.authenticatePassword(v[0])
        if (!check.success) return { error: check.error || 'Wrong password.', focus: 0 }
        return { value: v[0] }
      }
    })
    if (!current) { showMsg('msg-sync', 'Key import cancelled. Nothing changed.', 'error'); return null }
    if (passwordMeetsRule(current)) return current
  }
  const fresh = await newPasswordDialog('Set a master password', 'This phone needs a master password for the imported key.')
  if (!fresh) { showMsg('msg-sync', 'Key import cancelled. Nothing changed.', 'error'); return null }
  return fresh
}

async function planAdoptUnlock(importedKey, status) {
  let method = await chooseImportLock(false)
  if (!method) return null
  const plan = { record: null, password: null, removePassword: false, removeFingerprint: false, note: '' }
  if (method === 'device') {
    const r = await platform.biometricEnroll(importedKey, await getNativeRecord())
    if (r.success) {
      plan.record = r.record
      if (status.hasPassword) {
        plan.password = await optionalPasswordDialog('Backup password', 'Keep a master password on this phone as a backup unlock? Set it for the imported key (you can reuse your current password). Choose Turn off to unlock with fingerprint or device PIN only.', 'Keep password', 'Turn off')
        if (!plan.password) {
          plan.removePassword = true
          plan.note = ' Password unlock is off on this phone until you set one in Manage.'
        }
      }
    } else {
      const fallback = await confirmDialog({ title: 'Fingerprint did not complete', text: fingerprintFailureText(r) + ' Lock the imported key with a master password instead?', okLabel: 'Use password' })
      if (!fallback) return null
      method = 'password'
    }
  }
  if (method === 'password') {
    plan.password = await choosePasswordForImport(status)
    if (!plan.password) return null
    if (status.hasFingerprint) {
      const relink = await confirmDialog({ title: 'Relink fingerprint?', text: 'Relink fingerprint unlock to the imported key? You will be asked for your fingerprint or device PIN. Skip turns fingerprint unlock off until you re-enroll it in Manage.', okLabel: 'Relink', cancelLabel: 'Skip' })
      let relinked = false
      if (relink) {
        const r = await platform.biometricEnroll(importedKey, await getNativeRecord())
        if (r.success) { plan.record = r.record; relinked = true }
      }
      if (!relinked) {
        plan.removeFingerprint = true
        plan.note = ' Fingerprint unlock is off until you re-enroll it in Manage.'
      }
    }
  }
  return plan
}

async function adoptImportedKey(importedKey) {
  const matches = await vaultFile.localVaultOpensWith(importedKey)
  const currentKey = key()
  const holdsData = !matches && (!currentKey || await vaultFile.localVaultHasLiveData(currentKey))
  if (holdsData) {
    const proceed = await confirmDialog({
      title: 'Replace this phone\'s vault?',
      text: 'WARNING: This phone\'s current vault was made with a different master key.\n\nImporting this key makes that vault unusable, so it will be cleared from this phone.\n\nThis is how you get ready to receive the vault from your other device: import the key first, then import or scan the vault.',
      okLabel: 'Replace',
      danger: true
    })
    if (!proceed) { showMsg('msg-sync', 'Key import cancelled. Nothing changed.', 'error'); return false }
  }
  const status = await auth.initAuth()
  const plan = await planAdoptUnlock(importedKey, status)
  if (!plan || !key()) { showMsg('msg-sync', 'Key import cancelled. Nothing changed.', 'error'); return false }
  const committed = await commitUnlockPlan(plan, importedKey)
  if (!committed.success) { showMsg('msg-sync', 'Could not save the imported key: ' + committed.error, 'error'); return false }
  if (!matches) await store.clearVaultData()
  session.setMasterKey(importedKey)
  try { await passwords.ensureVault(importedKey) } catch (e) {}
  resetSectionLocks()
  walletsTab.lock()
  await loadAuthStatus()
  showMsg('msg-sync', matches
    ? 'Master key imported and saved on this phone.' + plan.note
    : 'Master key imported and saved. Now import or scan the vault from your other device.' + plan.note, 'success')
  return true
}

function backupFileName(nickname) {
  const safeName = nickname ? '-' + nickname.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-') : ''
  return 'valid-vault-backup' + safeName + '.vault'
}

function keyFileName(nickname) {
  return ((nickname || 'master-key').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'master-key') + '.vaultkey'
}

async function chooseDestination(title, text) {
  if (!platform.canShareFiles()) return 'download'
  const values = await formDialog({
    title,
    text,
    fields: [{
      label: 'Where should the file go?',
      options: [
        { value: 'download', label: 'Save to Downloads' },
        { value: 'share', label: 'Send with another app' }
      ],
      value: 'download'
    }],
    okLabel: 'Continue'
  })
  return values ? values[0] : null
}

async function deliverFile(filename, text, destination) {
  if (destination === 'share') return platform.shareFile(filename, text)
  return platform.saveToDownloads(filename, text)
}

async function shareVault() {
  if (!key()) { showMsg('msg-sync', 'Unlock your vault first', 'error'); return }
  if (!(await requireTransferAuth('msg-sync'))) return
  const payload = vaultFile.payloadFromBundle(await vaultFile.buildBundle())
  if (!payload.vault && !payload.webcreds && !payload.personalInfo) { showMsg('msg-sync', 'Nothing to sync yet', 'error'); return }
  streamShare(JSON.stringify(payload), 'Scan this with your other device to receive your logins, misc credentials, and personal info.')
}

async function shareKey() {
  if (!key()) { showMsg('msg-sync', 'Unlock your vault first', 'error'); return }
  if (!(await requireTransferAuth('msg-sync'))) return
  let pkg = null
  try { pkg = await ensureKeyPackage(key()) } catch (e) { showMsg('msg-sync', 'Could not prepare the key: ' + errText(e), 'error'); return }
  if (!pkg) return
  streamShare(JSON.stringify({ kind: 'keyfile', key: pkg }), 'Scan this with your other device. It will ask for your passphrase and answers before accepting the key.')
}

async function exportVault() {
  if (!key()) { showMsg('msg-sync', 'Unlock first', 'error'); return }
  const bundle = await vaultFile.buildBundle()
  if (!vaultFile.bundleHasData(bundle)) { showMsg('msg-sync', 'Nothing to export yet', 'error'); return }
  if (!(await requireTransferAuth('msg-sync'))) return
  const destination = await chooseDestination('Export Vault', 'The file carries everything: logins, misc credentials, personal info, bookmarks, and crypto wallets. It stays encrypted, useless without your master key.')
  if (!destination) return
  let nickname = ''
  try { const a = await store.getAuth() || {}; nickname = (a.keyNickname || '').trim() } catch (e) {}
  const fname = backupFileName(nickname)
  try {
    await deliverFile(fname, JSON.stringify(bundle), destination)
    showMsg('msg-sync', destination === 'share' ? 'Vault sent. It stays encrypted, useless without your master key.' : 'Saved to Downloads: ' + fname + '. It stays encrypted, useless without your master key.', 'success')
  } catch (e) {
    showMsg('msg-sync', 'Could not save the file: ' + errText(e), 'error')
  }
}

async function importVaultFile(skipAuth) {
  if (!key()) { showMsg('msg-sync', 'Unlock first', 'error'); return }
  const text = await platform.pickTextFile()
  if (!text) { showMsg('msg-sync', 'No file selected', 'error'); return }
  let bundle
  try { bundle = vaultFile.parseBundle(text) } catch (e) { showMsg('msg-sync', 'Import failed: ' + errText(e), 'error'); return }
  if (!skipAuth && !(await requireTransferAuth('msg-sync'))) return
  try {
    const result = await vaultFile.mergeBundle(bundle, key())
    showMsg('msg-sync', vaultFile.describeMerge(result), 'success')
    if (result.changed) refreshAfterSync()
  } catch (e) {
    showMsg('msg-sync', 'Import failed: ' + errText(e), 'error')
  }
}

async function exportKey() {
  if (!key()) { showMsg('msg-sync', 'Unlock first', 'error'); return }
  if (!(await requireTransferAuth('msg-sync'))) return
  let pkg
  try { pkg = await ensureKeyPackage(key()) } catch (e) { showMsg('msg-sync', 'Export failed: ' + errText(e), 'error'); return }
  if (!pkg) return
  const destination = await chooseDestination('Export Key', 'The key file is wrapped under your passphrase and three answers. Keep the file, passphrase, and answers safe, ideally apart from your vault file.')
  if (!destination) return
  const fname = keyFileName(await keypackage.getNickname())
  try {
    await deliverFile(fname, JSON.stringify(pkg), destination)
    showMsg('msg-sync', destination === 'share' ? 'Key sent. Keep the file, passphrase, and answers safe.' : 'Saved to Downloads: ' + fname + '. Keep the file, passphrase, and answers safe.', 'success')
  } catch (e) {
    showMsg('msg-sync', 'Could not save the file: ' + errText(e), 'error')
  }
}

async function importKey() {
  const text = await platform.pickTextFile()
  if (!text) { showMsg('msg-sync', 'No file selected', 'error'); return }
  let fileObj = null
  try { fileObj = JSON.parse(text) } catch (e) { showMsg('msg-sync', 'Could not read the file', 'error'); return }
  if (!keypackage.isKeyPackage(fileObj)) { showMsg('msg-sync', 'Not a key file', 'error'); return }
  if (!(await requireTransferAuth('msg-sync'))) return
  try { await acceptKeyPackage(fileObj, 'Key file') } catch (e) { showMsg('msg-sync', 'Key import failed: ' + errText(e), 'error') }
}

async function changeKeyProtection() {
  if (!key()) { showMsg('msg-sync', 'Unlock first', 'error'); return }
  const r = await promptAuth()
  if (!r.success) { showMsg('msg-sync', 'Authentication required', 'error'); return }
  session.setMasterKey(r.masterKey)
  try {
    const pkg = await setupKeyPackage(r.masterKey, true)
    if (pkg) showMsg('msg-sync', 'Key protection updated. New key shares and key files use it.', 'success')
  } catch (e) {
    showMsg('msg-sync', 'Could not update key protection: ' + errText(e), 'error')
  }
}

function loadSettingsIntoForm() {
  $('input-autolock-timeout').value = state.settings.autoLock
  $('input-qr-timeout').value = state.settings.qrTimeout
  $('select-gen-min').value = String(state.settings.genMin)
  $('select-gen-max').value = String(state.settings.genMax)
  updateTimeReadouts()
  store.getAuth().then((a) => { $('key-nickname-input').value = (a && a.keyNickname) || DEFAULT_NICKNAME }).catch(() => {})
}

function updateTimeReadouts() {
  $('readout-autolock-timeout').textContent = formatDuration($('input-autolock-timeout').value, true)
  $('readout-qr-timeout').textContent = formatDuration($('input-qr-timeout').value, false)
}

async function saveAutoLock() {
  const v = clamp($('input-autolock-timeout').value, AUTOLOCK_MIN_SEC, AUTOLOCK_MAX_SEC, AUTOLOCK_DEFAULT_SEC)
  $('input-autolock-timeout').value = v
  updateTimeReadouts()
  state.settings.autoLock = v
  await saveAuthFields({ autoLockTimeout: v })
  session.resetActivity()
  showMsg('msg-settings', 'Auto-lock set to ' + formatDuration(v, true), 'success')
}

async function saveQrTimeout() {
  const v = clamp($('input-qr-timeout').value, QR_TIMEOUT_MIN_SEC, QR_TIMEOUT_MAX_SEC, QR_TIMEOUT_DEFAULT_SEC)
  $('input-qr-timeout').value = v
  updateTimeReadouts()
  state.settings.qrTimeout = v
  await saveAuthFields({ qrStreamTimeout: v })
  showMsg('msg-settings', 'QR stream timeout set to ' + formatDuration(v, false), 'success')
}

async function saveGenerator() {
  const prefs = generator.normalizePrefs({ min: parseInt($('select-gen-min').value, 10), max: parseInt($('select-gen-max').value, 10) })
  state.settings.genMin = prefs.min
  state.settings.genMax = prefs.max
  await saveAuthFields({ genMinLength: prefs.min, genMaxLength: prefs.max })
  showMsg('msg-settings', 'Password generator updated', 'success')
}

async function renameKey() {
  const name = $('key-nickname-input').value.trim()
  if (!name) { showMsg('msg-settings', 'Name cannot be empty', 'error'); return }
  try {
    await saveAuthFields({ keyNickname: name })
    showMsg('msg-settings', 'Key renamed.', 'success')
  } catch (e) {
    showMsg('msg-settings', 'Rename failed', 'error')
  }
}

async function clearVault() {
  if (!(await requireFreshAuth())) { showMsg('msg-settings', 'Authentication required to clear the vault', 'error'); return }
  const first = await confirmDialog({ title: 'Delete all vault data?', text: 'Everything on this phone is deleted permanently: logins, misc credentials, personal info, crypto wallets, bookmarks, unlock methods, and settings.\n\nBack up to another device or a file first. This cannot be undone.', okLabel: 'Continue', danger: true })
  if (!first) return
  const second = await confirmDialog({ title: 'Final confirmation', text: 'This deletes everything on this phone. Continue?', okLabel: 'Delete everything', danger: true })
  if (!second) return
  await store.clearAll()
  await platform.biometricRemove()
  await loadSettings()
  state.tab = 'manage'
  await session.lockAll()
  showMsg('msg-setup', 'Vault cleared. Set up a new vault, or bring your existing key.', 'success')
}

function attachActivity() {
  const bump = () => { if (key()) session.resetActivity() }
  for (const name of ACTIVITY_EVENTS) document.addEventListener(name, bump, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && key()) session.checkTimeout()
    if (document.hidden) stopScanner()
  })
}

function wire() {
  $('btn-setup-fp').onclick = setupEnrollFingerprint
  $('btn-setup-pw').onclick = setupEnrollPassword
  $('setup-password').onkeydown = (e) => { if (e.key === 'Enter') setupEnrollPassword() }
  $('btn-setup-done').onclick = setupFinish
  $('btn-setup-scan-key').onclick = () => scanKeyInto('setup-scan-box', 'msg-setup-key', false)
  $('btn-setup-file-key').onclick = () => openKeyFileInto('msg-setup-key', false)
  $('btn-recover-scan-key').onclick = () => scanKeyInto('recover-scan-box', 'msg-recover', true)
  $('btn-recover-file-key').onclick = () => openKeyFileInto('msg-recover', true)
  $('btn-unlock-fp').onclick = unlockWithFingerprint
  $('btn-unlock-pw').onclick = unlockWithPassword
  $('input-unlock-password').onkeydown = (e) => { if (e.key === 'Enter') unlockWithPassword() }
  $('btn-lock').onclick = () => session.lockAll()
  for (const t of document.querySelectorAll('.tab')) t.onclick = () => showTab(t.dataset.tab)
  $('btn-edit-fp').onclick = editFingerprint
  $('btn-del-fp').onclick = deleteFingerprint
  $('btn-edit-pw').onclick = editPassword
  $('btn-del-pw').onclick = deletePassword
  $('btn-add-login').onclick = addLogin
  $('btn-add-webcred').onclick = addWebCredential
  $('btn-add-bookmark').onclick = addBookmark
  $('bookmark-filter').oninput = (e) => { state.bookmarkFilter = e.target.value; loadBookmarks() }
  $('btn-share-vault').onclick = shareVault
  $('btn-share-key').onclick = shareKey
  $('btn-stop-share').onclick = stopShare
  $('btn-export-vault').onclick = exportVault
  $('btn-import-vault').onclick = () => importVaultFile(false)
  $('btn-export-key').onclick = exportKey
  $('btn-import-key').onclick = importKey
  $('btn-change-key-protection').onclick = changeKeyProtection
  $('qr-scan-box').onclick = () => startScanner($('qr-scan-box'), handleImported, 'msg-sync')
  $('input-autolock-timeout').oninput = updateTimeReadouts
  $('input-qr-timeout').oninput = updateTimeReadouts
  $('input-autolock-timeout').onchange = saveAutoLock
  $('input-qr-timeout').onchange = saveQrTimeout
  $('select-gen-min').onchange = saveGenerator
  $('select-gen-max').onchange = saveGenerator
  $('btn-rename-key').onclick = renameKey
  $('btn-backup-sync').onclick = () => showTab('sync')
  $('btn-clear-vault').onclick = clearVault
  for (const b of document.querySelectorAll('[data-link]')) b.onclick = () => platform.openExternal(b.dataset.link)
  $('about-version').textContent = APP_VERSION ? 'v' + APP_VERSION : ''
}

async function init() {
  session.setAutoLockProvider(() => state.settings.autoLock)
  session.onLock(() => { handleLocked() })
  wire()
  startGlobes()
  attachActivity()
  walletsTab.init({
    getKey: () => key(),
    authenticate: async () => {
      const r = await promptAuth()
      if (!r.success) return false
      session.setMasterKey(r.masterKey)
      return true
    },
    getHideSeconds: () => state.settings.autoLock,
    touch: true
  })
  await loadSettings()
  await routeView()
}

const TAB_MSG = { manage: 'msg-manage', personal: 'msg-personalinfo', webcreds: 'msg-webcreds', wallets: 'msg-wallets', bookmarks: 'msg-bookmarks', sync: 'msg-sync', settings: 'msg-settings' }

function currentMsgId() {
  if (!$('view-app').classList.contains('hidden')) return TAB_MSG[state.tab] || 'msg-manage'
  if (!$('view-locked').classList.contains('hidden')) return 'msg-locked'
  return 'msg-setup'
}

function reportUnexpected(reason) {
  showMsg(currentMsgId(), 'Something went wrong: ' + errText(reason), 'error')
}

window.addEventListener('error', (e) => reportUnexpected(e.error || e.message))
window.addEventListener('unhandledrejection', (e) => reportUnexpected(e.reason))

init()
