(() => {
  if (window.localVaultInjected) return
  window.localVaultInjected = true

  let lastActivityPingAt = 0
  function pingActivity() {
    const now = Date.now()
    if (now - lastActivityPingAt < 3000) return
    lastActivityPingAt = now
    try { chrome.runtime.sendMessage({ action: 'activity' }) } catch (e) {}
  }

  const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'input', 'wheel', 'scroll', 'touchstart', 'touchmove']
  for (const type of ACTIVITY_EVENTS) {
    window.addEventListener(type, (e) => {
      if (e.isTrusted) pingActivity()
    }, { capture: true, passive: true })
  }

  const OWN_SHADOW_HOSTS = new WeakSet()
  const FORM_OBSERVER_OPTIONS = { childList: true, subtree: true, attributes: true, attributeFilter: ['name', 'id', 'autocomplete', 'aria-label', 'placeholder', 'type'] }
  const observedShadowRoots = new WeakSet()
  let shadowRootCache = null

  function shadowRootOf(el) {
    if (OWN_SHADOW_HOSTS.has(el)) return null
    if (el.shadowRoot) return el.shadowRoot
    try {
      if (chrome.dom && chrome.dom.openOrClosedShadowRoot) return chrome.dom.openOrClosedShadowRoot(el) || null
    } catch (e) {}
    return null
  }

  function collectShadowRoots(root, out) {
    for (const el of root.querySelectorAll('*')) {
      const sr = shadowRootOf(el)
      if (!sr || out.indexOf(sr) !== -1) continue
      out.push(sr)
      if (!observedShadowRoots.has(sr)) {
        observedShadowRoots.add(sr)
        try { formObserver.observe(sr, FORM_OBSERVER_OPTIONS) } catch (e) {}
      }
      collectShadowRoots(sr, out)
    }
    return out
  }

  function searchRoots() {
    if (!shadowRootCache) shadowRootCache = collectShadowRoots(document, [])
    return [document].concat(shadowRootCache)
  }

  function resetSearchRoots() {
    shadowRootCache = null
  }

  function composedParent(node) {
    if (node.parentNode) return node.parentNode
    return node.host || null
  }

  function composedContains(ancestor, node) {
    for (let n = node; n; n = composedParent(n)) if (n === ancestor) return true
    return false
  }

  function deepQueryAll(selector, scope) {
    const found = []
    for (const root of searchRoots()) {
      for (const el of root.querySelectorAll(selector)) {
        if (!scope || scope === document || composedContains(scope, el)) found.push(el)
      }
    }
    return found
  }

  function composedForm(el) {
    for (let node = el; node; ) {
      const form = node.closest ? node.closest('form') : null
      if (form) return form
      const root = node.getRootNode ? node.getRootNode() : null
      node = root && root.host ? root.host : null
    }
    return null
  }

  function eventOrigin(e) {
    const path = e.composedPath ? e.composedPath() : null
    return path && path.length ? path[0] : e.target
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT'
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value)
    } else {
      el.value = value
    }
  }

  function setSelectValue(el, value) {
    if (value === undefined || value === null) return false
    const normTarget = normalizeLabel(String(value))
    let matchOption = null
    for (const opt of el.options) {
      if (opt.value === value) { matchOption = opt; break }
    }
    if (!matchOption) {
      for (const opt of el.options) {
        if (normalizeLabel(opt.value) === normTarget || normalizeLabel(opt.textContent) === normTarget) {
          matchOption = opt
          break
        }
      }
    }
    if (!matchOption) return false
    setNativeValue(el, matchOption.value)
    return true
  }

  let currentDomain = window.location.hostname

  const wiredForms = []
  const trackedFields = new Set()

  function fieldMatchesSelectors(el, selectors) {
    for (let i = 0; i < selectors.length; i++) {
      if (el.matches(selectors[i])) return true
    }
    return false
  }

  const USERNAME_SELECTORS = [
    'input[autocomplete="username"]',
    'input[autocomplete="email"]',
    'input[type="email"]',
    'input[name*="user" i]',
    'input[id*="user" i]',
    'input[name*="email" i]',
    'input[id*="email" i]',
    'input[name="login"]',
    'input[id="login"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
    'input[placeholder*="login" i]'
  ]

  function classifyLoginType(el) {
    if (!el) return 'username'
    const type = (el.type || '').toLowerCase()
    if (type === 'email') return 'email'
    if (type === 'tel') return 'phone'
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase()
    if (autocomplete === 'email') return 'email'
    if (autocomplete === 'tel' || autocomplete.indexOf('tel-') === 0) return 'phone'
    const hay = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '')).toLowerCase()
    if (/email/.test(hay)) return 'email'
    if (/phone|mobile/.test(hay) || /\btel\b/.test(hay)) return 'phone'
    return 'username'
  }

  const LOGIN_TYPE_ICON = { email: '📧', phone: '📱', username: '👤' }

  const GEN_MIN_CHOICES = [16, 20]
  const GEN_MAX_CHOICES = [24, 32, 48, 64]
  const generatorPrefs = { min: 16, max: 24 }

  function applyGeneratorPrefs(stored) {
    if (GEN_MIN_CHOICES.includes(stored.genMinLength)) generatorPrefs.min = stored.genMinLength
    if (GEN_MAX_CHOICES.includes(stored.genMaxLength)) generatorPrefs.max = stored.genMaxLength
  }

  try {
    chrome.storage.local.get(['genMinLength', 'genMaxLength']).then(applyGeneratorPrefs).catch(() => {})
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      if (changes.genMinLength) applyGeneratorPrefs({ genMinLength: changes.genMinLength.newValue })
      if (changes.genMaxLength) applyGeneratorPrefs({ genMaxLength: changes.genMaxLength.newValue })
    })
  } catch (e) {}
  const GEN_MAX_PATTERN_TRIES = 200
  const GEN_CLASSES = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digit: '0123456789',
    special: '!@#$%^&*'
  }
  const CONFIRM_SIGNAL = /confirm|repeat|re-?type|re-?enter|again|verif/
  const CURRENT_SIGNAL = /current|existing|(^|[^a-z])old/
  const NEW_SIGNAL = /new|create|choose|set.?password|sign.?up|register/

  function randomInt(limit) {
    const range = 0x100000000
    const cap = range - (range % limit)
    const buf = new Uint32Array(1)
    while (true) {
      crypto.getRandomValues(buf)
      if (buf[0] < cap) return buf[0] % limit
    }
  }

  function shuffleChars(chars) {
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1)
      const t = chars[i]
      chars[i] = chars[j]
      chars[j] = t
    }
    return chars
  }

  function parsePasswordRules(text) {
    const rules = { classes: null, minlength: 0, maxlength: Infinity }
    if (!text) return rules
    const wanted = []
    for (const part of text.split(';')) {
      const idx = part.indexOf(':')
      if (idx === -1) continue
      const name = part.slice(0, idx).trim().toLowerCase()
      const value = part.slice(idx + 1).trim()
      if (name === 'minlength' && Number(value) > 0) rules.minlength = Number(value)
      if (name === 'maxlength' && Number(value) > 0) rules.maxlength = Number(value)
      if (name === 'required' || name === 'allowed') {
        for (const item of value.split(',')) {
          const token = item.trim()
          const custom = token.match(/^\[(.*)\]$/)
          if (custom) wanted.push({ required: name === 'required', chars: custom[1].replace(/\]/g, ']') })
          else if (token === 'ascii-printable') wanted.push({ required: name === 'required', chars: GEN_CLASSES.upper + GEN_CLASSES.lower + GEN_CLASSES.digit + GEN_CLASSES.special })
          else if (GEN_CLASSES[token]) wanted.push({ required: name === 'required', chars: GEN_CLASSES[token] })
        }
      }
    }
    if (wanted.length) rules.classes = wanted
    return rules
  }

  function generationPlan(fields, style) {
    let minLen = 0
    let maxLen = Infinity
    let classes = null
    let pattern = null
    for (const el of fields) {
      if (!el) continue
      const rules = parsePasswordRules(el.getAttribute('passwordrules'))
      if (el.minLength > 0) minLen = Math.max(minLen, el.minLength)
      if (el.maxLength > 0) maxLen = Math.min(maxLen, el.maxLength)
      minLen = Math.max(minLen, rules.minlength)
      maxLen = Math.min(maxLen, rules.maxlength)
      if (rules.classes && !classes) classes = rules.classes
      if (el.pattern && !pattern) {
        try { pattern = new RegExp('^(?:' + el.pattern + ')$', 'v') } catch (e) {
          try { pattern = new RegExp('^(?:' + el.pattern + ')$', 'u') } catch (e2) { pattern = null }
        }
      }
    }
    const tierIndex = GEN_MAX_CHOICES.indexOf(generatorPrefs.max)
    const tierFloor = tierIndex > 0 ? GEN_MAX_CHOICES[tierIndex - 1] + 1 : generatorPrefs.min
    const span = Math.max(4, generatorPrefs.max - tierFloor)
    let lo = Math.max(tierFloor, minLen)
    let hi = Math.max(generatorPrefs.max, lo + span)
    if (maxLen < lo) { lo = maxLen; hi = maxLen }
    else if (maxLen < hi) hi = maxLen
    if (!classes) classes = ['upper', 'lower', 'digit', 'special'].map((k) => ({ required: true, chars: GEN_CLASSES[k] }))
    if (style === 'plain') {
      classes = classes.map((c) => ({ required: c.required, chars: c.chars.replace(/[^A-Za-z0-9]/g, '') })).filter((c) => c.chars.length)
      if (!classes.length) classes = ['upper', 'lower', 'digit'].map((k) => ({ required: true, chars: GEN_CLASSES[k] }))
    }
    return { lo, hi, classes, pattern }
  }

  function generateOnce(plan) {
    const length = plan.lo + randomInt(plan.hi - plan.lo + 1)
    const pool = Array.from(new Set(plan.classes.map((c) => c.chars).join('').split(''))).join('')
    const chars = []
    for (const c of plan.classes) {
      if (c.required && chars.length < length) chars.push(c.chars[randomInt(c.chars.length)])
    }
    while (chars.length < length) chars.push(pool[randomInt(pool.length)])
    return shuffleChars(chars).join('')
  }

  function generatePassword(fields, style) {
    const plan = generationPlan(fields, style)
    let candidate = generateOnce(plan)
    if (!plan.pattern) return candidate
    for (let i = 0; i < GEN_MAX_PATTERN_TRIES && !plan.pattern.test(candidate); i++) candidate = generateOnce(plan)
    return candidate
  }

  function passwordSignalText(el) {
    const parts = [el.getAttribute('autocomplete'), el.name, el.id, el.placeholder, el.getAttribute('aria-label')]
    if (el.labels) for (const l of el.labels) parts.push(l.textContent)
    return parts.filter(Boolean).join(' ').toLowerCase()
  }

  function passwordRole(el) {
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase()
    const signals = passwordSignalText(el)
    if (CONFIRM_SIGNAL.test(signals)) return 'confirm'
    if (autocomplete.indexOf('current-password') !== -1 || CURRENT_SIGNAL.test(signals)) return 'current'
    if (autocomplete.indexOf('new-password') !== -1 || NEW_SIGNAL.test(signals)) return 'new'
    return null
  }

  function planPasswordGroup(fields) {
    const roles = fields.map(passwordRole)
    const byRole = (role) => fields[roles.indexOf(role)] || null
    if (fields.length === 1) return roles[0] === 'new' ? { current: null, fresh: fields[0], confirm: null } : null
    if (fields.length === 2) {
      if (roles.indexOf('current') !== -1 && roles[0] !== roles[1]) {
        const current = byRole('current')
        return { current, fresh: fields.find((f) => f !== current), confirm: null }
      }
      if (roles.indexOf('confirm') !== -1 && roles[0] !== roles[1]) {
        const confirm = byRole('confirm')
        return { current: null, fresh: fields.find((f) => f !== confirm), confirm }
      }
      if (roles.indexOf('new') !== -1) return { current: null, fresh: fields[0], confirm: fields[1] }
      return null
    }
    if (fields.length === 3) {
      if (!roles.some(Boolean)) return null
      const current = byRole('current') || fields[0]
      const confirmIdx = roles.lastIndexOf('confirm')
      const confirm = confirmIdx !== -1 && fields[confirmIdx] !== current ? fields[confirmIdx] : fields[2]
      const fresh = fields.find((f) => f !== current && f !== confirm)
      if (!fresh) return null
      return { current, fresh, confirm }
    }
    return null
  }

  function detectLoginForm(skipPasswordFields) {
    const pwFields = deepQueryAll('input[type="password"]')
    if (pwFields.length === 0) return null

    for (const pwField of pwFields) {
      if (skipPasswordFields && skipPasswordFields.has(pwField)) continue
      const form = composedForm(pwField) || document
      const candidates = deepQueryAll('input[type="text"], input[type="email"], input[type="tel"]', form)
        .filter((input) => input.offsetParent !== null)
      if (candidates.length === 0) continue

      const best = candidates.find((input) => fieldMatchesSelectors(input, USERNAME_SELECTORS)) || candidates[0]
      return { username: best, password: pwField }
    }
    return null
  }

  function fillCredentials(cred, formFields) {
    pingActivity()
    const username = formFields && formFields.username
    const password = formFields && formFields.password
    if (username) {
      setNativeValue(username, cred.username)
      username.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      username.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    }
    if (password) {
      setNativeValue(password, cred.password)
      password.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      password.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
      if (!cred.isPrevious) noteCredentialUse(cred.username)
    }
    if (cred.extraFields && cred.extraFields.length) {
      const form = (password && composedForm(password)) || document
      const candidates = deepQueryAll('input, textarea, select', form)
      for (const el of candidates) {
        if (isTrackedField(el)) continue
        if (el.tagName === 'INPUT' && (el.type === 'password' || el.type === 'hidden')) continue
        if (el.value) continue
        const match = cred.extraFields.find((f) => normalizeLabel(f.label) === normalizeLabel(getFieldLabel(el)))
        if (match) {
          const filled = el.tagName === 'SELECT' ? setSelectValue(el, match.value) : (setNativeValue(el, match.value), true)
          if (filled) {
            el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
            el.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
          }
        }
      }
    }
    hideFieldPicker()
  }

  function isTrackedField(el) {
    return trackedFields.has(el)
  }

  function normalizeLabel(label) {
    return (label || '')
      .toLowerCase()
      .replace(/[:*]+$/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  }

  function getFieldLabel(el) {
    if (el.labels && el.labels.length && el.labels[0].textContent) {
      return el.labels[0].textContent.trim().replace(/\s+/g, ' ')
    }
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim()
    if (el.placeholder) return el.placeholder.trim()
    if (el.name) return el.name.trim()
    if (el.id) return el.id.trim()
    return 'Field'
  }

  function collectExtraFields(passwordField) {
    if (!passwordField) return []
    const form = passwordField.closest('form') || document
    const fields = form.querySelectorAll('input, textarea, select')
    const extras = []
    for (const el of fields) {
      if (el.tagName === 'INPUT' && ['password', 'hidden', 'submit', 'button', 'checkbox', 'radio'].indexOf(el.type) !== -1) continue
      if (isTrackedField(el)) continue
      if (matchSignupFieldType(el)) continue
      if (el.offsetParent === null) continue
      if (!el.value) continue
      extras.push({ label: getFieldLabel(el), value: el.value })
    }
    return extras
  }

  function sameExtraFields(existingExtras, newExtras) {
    const a = existingExtras || []
    const b = newExtras || []
    if (a.length !== b.length) return false
    const byLabel = new Map(a.map((f) => [normalizeLabel(f.label), f.value]))
    for (const f of b) {
      if (byLabel.get(normalizeLabel(f.label)) !== f.value) return false
    }
    return true
  }

  function escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  let savePrompt = null

  function createSavePrompt() {
    const host = document.createElement('div')
    host.id = 'local-vault-save-host'
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:none;'
    OWN_SHADOW_HOSTS.add(host)
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'closed' })
    shadow.innerHTML = `
      <style>
        .backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; }
        .card { background:#0d130d; border:1px solid #1f9e40; border-radius:10px; padding:20px; width:300px; max-width:90vw;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; box-shadow:0 8px 30px rgba(0,0,0,0.6); }
        .title { color:#33ff66; font-size:15px; font-weight:700; margin-bottom:6px; }
        .sub { color:#6fae7f; font-size:12px; margin-bottom:4px; word-break:break-all; }
        .user { color:#b8f0c4; font-size:13px; margin:4px 0 8px; word-break:break-all; }
        .extra-note { color:#6fae7f; font-size:11px; margin-bottom:12px; }
        .row { display:flex; gap:10px; }
        button { flex:1; padding:11px; border-radius:6px; border:none; font-size:13px; font-weight:700; cursor:pointer; }
        .save { background:#33ff66; color:#05140a; }
        .cancel { background:transparent; color:#33ff66; border:1px solid #1f9e40; font-weight:400; }
      </style>
      <div class="backdrop" id="backdrop">
        <div class="card">
          <div class="title" id="sp-title">Save to Valid Vault?</div>
          <div class="sub" id="sp-domain"></div>
          <div class="user" id="sp-user"></div>
          <div class="extra-note" id="sp-extra"></div>
          <div class="sub" id="sp-msg" style="color:#ff8866;min-height:14px;"></div>
          <div class="row">
            <button class="save" id="sp-save">Save</button>
            <button class="cancel" id="sp-cancel">Not now</button>
          </div>
        </div>
      </div>
    `
    return { host, shadow }
  }

  function showSavePrompt(domain, username, password, isUpdate, extraFields, pendingId, loginType, locked) {
    if (!savePrompt) savePrompt = createSavePrompt()
    const shadow = savePrompt.shadow
    const saveBtn = shadow.getElementById('sp-save')
    const msgEl = shadow.getElementById('sp-msg')
    shadow.getElementById('sp-title').textContent = isUpdate ? 'Update saved password?' : 'Save to Valid Vault?'
    shadow.getElementById('sp-domain').textContent = domain
    shadow.getElementById('sp-user').textContent = username || '(no username)'
    const extraEl = shadow.getElementById('sp-extra')
    if (extraEl) {
      extraEl.textContent = extraFields && extraFields.length
        ? '+ ' + extraFields.length + ' additional field' + (extraFields.length !== 1 ? 's' : '') + ' on this form will be saved too'
        : ''
    }
    let lockedMode = false
    function showLocked(text) {
      lockedMode = true
      saveBtn.textContent = 'Unlock and Save'
      msgEl.textContent = text || 'Vault is locked. Unlock in the Valid Vault window to save.'
    }
    function showUnlocked() {
      lockedMode = false
      saveBtn.textContent = 'Save'
      msgEl.textContent = ''
    }
    if (locked) showLocked()
    else showUnlocked()
    savePrompt.host.style.display = 'block'
    let busy = false
    const close = () => {
      savePrompt.host.style.display = 'none'
      showUnlocked()
      if (pendingId) { try { chrome.runtime.sendMessage({ action: 'resolvePendingSave', id: pendingId }) } catch (e) {} }
    }
    const doSave = async () => {
      if (busy) return
      busy = true
      try {
        pingActivity()
        if (lockedMode) {
          msgEl.textContent = 'Waiting for unlock in the Valid Vault window...'
          const unlocked = await unlockInline()
          if (!unlocked) { showLocked('Vault is still locked. Click Unlock and Save to try again.'); return }
          showUnlocked()
          const check = await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain })
          const existing = check && check.success ? check.credentials.find(c => c.username === username) : null
          if (existing && existing.password === password && sameExtraFields(existing.extraFields, extraFields)) {
            close()
            return
          }
        }
        const result = await chrome.runtime.sendMessage({ action: 'saveCredential', domain, username, password, extraFields, loginType })
        if (result && result.locked) { showLocked(); return }
        if (!result || !result.success) { msgEl.textContent = 'Could not save. Please try again.'; return }
        close()
      } finally {
        busy = false
      }
    }
    shadow.getElementById('sp-cancel').onclick = close
    saveBtn.onclick = doSave
    shadow.getElementById('backdrop').onclick = null
  }

  async function maybePromptSave(domain, u, p, extras, pendingId, loginType) {
    let existing = null
    let locked = false
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain })
      if (result && result.success) existing = result.credentials.find(c => c.username === u)
      else if (result && result.locked) locked = true
    } catch (e) {}
    if (existing && existing.password === p && sameExtraFields(existing.extraFields, extras)) {
      if (pendingId) { try { chrome.runtime.sendMessage({ action: 'resolvePendingSave', id: pendingId }) } catch (e) {} }
      return
    }
    showSavePrompt(domain, u, p, !!existing, extras, pendingId, loginType, locked)
  }

  const captureInFlight = new WeakSet()

  function noteCredentialUse(username) {
    try { chrome.runtime.sendMessage({ action: 'noteCredentialUse', domain: currentDomain, username }).catch(() => {}) } catch (e) {}
  }

  function resolveChangeUsername(record, fallback) {
    if (record.accountUsername) return record.accountUsername
    const creds = record.cachedCreds || []
    const currentValue = record.plan.current ? record.plan.current.value : ''
    if (currentValue) {
      const match = creds.find((c) => c.password === currentValue || c.previousPassword === currentValue)
      if (match) return match.username
    }
    if (fallback) return fallback
    if (creds.length === 1) return creds[0].username
    return ''
  }

  async function captureAndPrompt(formFields) {
    const username = formFields && formFields.username
    const password = formFields && formFields.password
    if (!username && !password) return
    if (password && captureInFlight.has(password)) return
    if (password) captureInFlight.add(password)
    try {
      const change = formFields.credentialChange
      let u = username ? username.value : ''
      if (change && change.plan.current) u = resolveChangeUsername(change, u)
      const p = password ? password.value : ''
      if (!p) return
      const extras = change ? [] : collectExtraFields(password)
      const loginType = classifyLoginType(username)

      const pendingId = 'ps_' + Date.now() + '_' + Math.random().toString(36).slice(2)

      try {
        chrome.runtime.sendMessage({ action: 'stagePendingSave', id: pendingId, domain: currentDomain, username: u, password: p, extraFields: extras, loginType })
      } catch (e) {}

      await maybePromptSave(currentDomain, u, p, extras, pendingId, loginType)
    } finally {
      if (password) captureInFlight.delete(password)
    }
  }

  async function checkPendingSave() {
    let pending
    try {
      pending = await chrome.runtime.sendMessage({ action: 'takePendingSave' })
    } catch (e) { return }
    if (!pending || !pending.found) return
    pingActivity()
    await maybePromptSave(pending.domain, pending.username, pending.password, pending.extraFields, pending.id, pending.loginType)
  }

  function findFormlessContainer(field) {
    let el = composedParent(field)
    let depth = 0
    while (el && el !== document.body && el !== document && depth < 8) {
      if (el.querySelector && el.querySelector('button, input[type="submit"], input[type="button"]')) return el
      el = composedParent(el)
      depth++
    }
    return null
  }

  function wireSubmitCapture(formFields) {
    const password = formFields.password
    const form = composedForm(password)
    const container = form || findFormlessContainer(password)

    const submitHandler = function () { captureAndPrompt(formFields) }
    if (form) form.addEventListener('submit', submitHandler, true)

    const keydownHandler = function (e) {
      if (e.key === 'Enter') setTimeout(() => captureAndPrompt(formFields), 0)
    }
    password.addEventListener('keydown', keydownHandler)

    const clickHandler = function (e) {
      const path = e.composedPath ? e.composedPath() : [e.target]
      const t = path.find((n) => n && (n.tagName === 'BUTTON' || (n.tagName === 'INPUT' && (n.type === 'submit' || n.type === 'button'))))
      if (!t) return
      const belongsToThisForm = container ? composedContains(container, t) : true
      if (belongsToThisForm && password.value) {
        setTimeout(() => captureAndPrompt(formFields), 50)
      }
    }
    document.addEventListener('click', clickHandler, true)

    return function teardown() {
      if (form) form.removeEventListener('submit', submitHandler, true)
      password.removeEventListener('keydown', keydownHandler)
      document.removeEventListener('click', clickHandler, true)
    }
  }

  const wiredPasswordFields = new WeakSet()

  function wireLoginForm(fields) {
    const { username, password } = fields
    wiredPasswordFields.add(password)
    trackedFields.add(username)
    trackedFields.add(password)

    username.setAttribute('autocomplete', 'off')
    password.setAttribute('autocomplete', 'off')

    loginFieldsByEl.set(username, fields)
    loginFieldsByEl.set(password, fields)
    attachVaultTag(username, 'login')
    attachVaultTag(password, 'login')
    const teardownSubmitCapture = wireSubmitCapture(fields)

    wiredForms.push({
      fields,
      cleanup: function () {
        loginFieldsByEl.delete(username)
        loginFieldsByEl.delete(password)
        teardownSubmitCapture()
        trackedFields.delete(username)
        trackedFields.delete(password)
      }
    })
  }

  const credentialForms = new Map()
  const credentialFormByEl = new WeakMap()

  function passwordScope(el) {
    return composedForm(el) || document.body
  }

  async function refreshCachedCreds(record) {
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain: currentDomain })
      if (result && result.success) record.cachedCreds = result.credentials
    } catch (e) {}
  }

  function findScopeUsername(scope, exclude) {
    const candidates = deepQueryAll('input[type="text"], input[type="email"], input[type="tel"], input:not([type])', scope)
      .filter((input) => input.offsetParent !== null && !exclude.has(input))
    return candidates.find((input) => fieldMatchesSelectors(input, USERNAME_SELECTORS)) || null
  }

  function wireCredentialForm(scope, plan) {
    let record = credentialForms.get(scope)
    const claimed = [plan.current, plan.fresh, plan.confirm].filter(Boolean)
    if (!record) {
      record = { scope, plan, cachedCreds: [], accountUsername: '', formFields: null, teardown: null }
      credentialForms.set(scope, record)
      refreshCachedCreds(record)
    }
    record.plan = plan
    for (const el of claimed) {
      wiredPasswordFields.add(el)
      trackedFields.add(el)
      credentialFormByEl.set(el, record)
      el.setAttribute('autocomplete', 'off')
    }
    if (plan.current) attachVaultTag(plan.current, 'current')
    attachVaultTag(plan.fresh, 'generate')
    if (plan.confirm && fieldTags.has(plan.confirm)) {
      const tag = fieldTags.get(plan.confirm)
      tag.style.setProperty('display', 'none', 'important')
      tagTypeByEl.set(plan.confirm, 'confirm')
    }
    const username = plan.current ? null : findScopeUsername(scope, new Set(claimed))
    if (!record.formFields || record.formFields.password !== plan.fresh) {
      if (record.teardown) record.teardown()
      record.formFields = { username, password: plan.fresh, credentialChange: record }
      record.teardown = wireSubmitCapture(record.formFields)
      wiredForms.push({
        fields: record.formFields,
        cleanup: function () {
          if (record.teardown) record.teardown()
          record.teardown = null
          credentialForms.delete(scope)
          for (const el of claimed) trackedFields.delete(el)
        }
      })
    } else {
      record.formFields.username = username
    }
  }

  const loneConfirmFields = new WeakSet()
  const loginSkipFields = { has: (el) => wiredPasswordFields.has(el) || loneConfirmFields.has(el) }

  function wireCredentialForms() {
    const groups = new Map()
    for (const el of deepQueryAll('input[type="password"]')) {
      if (el.offsetParent === null) continue
      const scope = passwordScope(el)
      if (!groups.has(scope)) groups.set(scope, [])
      groups.get(scope).push(el)
    }
    for (const [scope, fields] of groups) {
      if (fields.length === 1 && passwordRole(fields[0]) === 'confirm') {
        loneConfirmFields.add(fields[0])
        continue
      }
      for (const el of fields) loneConfirmFields.delete(el)
      const plan = planPasswordGroup(fields)
      if (plan) wireCredentialForm(scope, plan)
    }
  }

  function init() {
    resetSearchRoots()
    wireCredentialForms()
    let fields = detectLoginForm(loginSkipFields)
    while (fields) {
      wireLoginForm(fields)
      fields = detectLoginForm(loginSkipFields)
    }
  }

  let rescanScheduled = false
  function scheduleRescan() {
    if (rescanScheduled) return
    rescanScheduled = true
    setTimeout(() => {
      rescanScheduled = false
      cleanupDetachedState()
      init()
      scanPersonalInfoFields()
    }, 250)
  }

  function cleanupDetachedState() {
    for (let i = wiredForms.length - 1; i >= 0; i--) {
      const entry = wiredForms[i]
      if (!entry.fields.password.isConnected) {
        entry.cleanup()
        wiredForms.splice(i, 1)
      }
    }
    for (let i = taggedFieldRecords.length - 1; i >= 0; i--) {
      const rec = taggedFieldRecords[i]
      if (!rec.el.isConnected) {
        if (rec.tag && rec.tag.parentNode) rec.tag.parentNode.removeChild(rec.tag)
        window.removeEventListener('scroll', rec.scrollHandler, true)
        window.removeEventListener('resize', rec.resizeHandler)
        fieldTags.delete(rec.el)
        taggedFieldRecords.splice(i, 1)
      }
    }
  }

  const DISCOVERABLE_FIELDS_SELECTOR = 'input, textarea, select'

  const formObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const el = mutation.target
        if (el && el.nodeType === 1 && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) { scheduleRescan(); return }
        continue
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue
        if (node.matches && node.matches(DISCOVERABLE_FIELDS_SELECTOR)) { scheduleRescan(); return }
        if (node.querySelector && node.querySelector(DISCOVERABLE_FIELDS_SELECTOR)) { scheduleRescan(); return }
      }
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== 1) continue
        if (node.matches && node.matches(DISCOVERABLE_FIELDS_SELECTOR)) { scheduleRescan(); return }
        if (node.querySelector && node.querySelector(DISCOVERABLE_FIELDS_SELECTOR)) { scheduleRescan(); return }
      }
    }
  })
  formObserver.observe(document.documentElement, FORM_OBSERVER_OPTIONS)

  let routeChangeScheduled = false
  function scheduleRouteChange() {
    if (routeChangeScheduled) return
    routeChangeScheduled = true
    setTimeout(() => {
      routeChangeScheduled = false
      init()
      scanPersonalInfoFields()
      checkPendingSave()
    }, 250)
  }
  try {
    const origPushState = history.pushState
    const origReplaceState = history.replaceState
    history.pushState = function () {
      const ret = origPushState.apply(this, arguments)
      scheduleRouteChange()
      return ret
    }
    history.replaceState = function () {
      const ret = origReplaceState.apply(this, arguments)
      scheduleRouteChange()
      return ret
    }
    window.addEventListener('popstate', scheduleRouteChange)
  } catch (e) {}

  const SIGNUP_FIELD_MAP = {
    firstName: ['input[name="first_name"]', 'input[name="firstName"]', 'input[id="firstName"]', 'input[id="first_name"]', 'input[autocomplete="given-name"]', 'input[placeholder*="First" i]'],
    lastName: ['input[name="last_name"]', 'input[name="lastName"]', 'input[id="lastName"]', 'input[id="last_name"]', 'input[autocomplete="family-name"]', 'input[placeholder*="Last" i]'],
    email: ['input[type="email"]', 'input[name="email"]', 'input[id="email"]', 'input[autocomplete="email"]', 'input[placeholder*="Email" i]'],
    phone: ['input[type="tel"]', 'input[name="phone"]', 'input[id="phone"]', 'input[autocomplete="tel"]', 'input[placeholder*="Phone" i]'],
    'address.street': ['input[name="address"]', 'input[name="street"]', 'input[id="address"]', 'input[id="street"]', 'input[autocomplete="street-address"]', 'input[placeholder*="Address" i]', 'input[placeholder*="Street" i]'],
    'address.city': ['input[name="city"]', 'input[id="city"]', 'input[autocomplete="address-level2"]', 'input[placeholder*="City" i]'],
    'address.state': ['input[name="state"]', 'input[id="state"]', 'input[autocomplete="address-level1"]', 'input[placeholder*="State" i]'],
    'address.zip': ['input[name="zip"]', 'input[name="zipcode"]', 'input[id="zip"]', 'input[autocomplete="postal-code"]', 'input[placeholder*="ZIP" i]', 'input[placeholder*="Postal" i]'],
    'address.country': ['input[name="country"]', 'input[id="country"]', 'input[autocomplete="country-name"]', 'input[placeholder*="Country" i]']
  }

  const SIGNUP_FIELD_KEYWORDS = {
    firstName: ['first name', 'given name', 'firstname', 'fname'],
    lastName: ['last name', 'family name', 'surname', 'lastname', 'lname'],
    email: ['email', 'e mail', 'email address'],
    phone: ['phone', 'phone number', 'mobile', 'mobile number', 'cell phone', 'telephone'],
    'address.street': ['street address', 'address line 1', 'address line1', 'mailing address'],
    'address.zip': ['zip code', 'postal code', 'postcode']
  }

  const SIGNUP_FIELD_KEYWORDS_STRUCTURED_ONLY = {
    'address.street': ['street'],
    'address.city': ['city', 'town'],
    'address.state': ['state', 'province'],
    'address.zip': ['zip'],
    'address.country': ['country']
  }

  function normalizedIncludesPhrase(normalized, phrase) {
    return (' ' + normalized + ' ').indexOf(' ' + phrase + ' ') !== -1
  }

  function fieldStructuredSignalStrings(el) {
    const out = []
    if (el.name) out.push(el.name)
    if (el.id) out.push(el.id)
    const autocomplete = el.getAttribute('autocomplete')
    if (autocomplete) out.push(autocomplete)
    return out
  }

  function fieldFreeTextSignalStrings(el) {
    const out = []
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel) out.push(ariaLabel)
    if (el.placeholder) out.push(el.placeholder)
    if (el.labels && el.labels.length) {
      for (const l of el.labels) if (l.textContent) out.push(l.textContent)
    }
    return out
  }

  function matchSignupFieldTypeByKeywords(el) {
    const structured = fieldStructuredSignalStrings(el).map(normalizeLabel)
    const freeText = fieldFreeTextSignalStrings(el).map(normalizeLabel)
    const allSignals = structured.concat(freeText)

    for (const fieldType in SIGNUP_FIELD_KEYWORDS) {
      for (const signal of allSignals) {
        for (const keyword of SIGNUP_FIELD_KEYWORDS[fieldType]) {
          if (normalizedIncludesPhrase(signal, keyword)) return fieldType
        }
      }
    }
    for (const fieldType in SIGNUP_FIELD_KEYWORDS_STRUCTURED_ONLY) {
      for (const signal of structured) {
        for (const keyword of SIGNUP_FIELD_KEYWORDS_STRUCTURED_ONLY[fieldType]) {
          if (normalizedIncludesPhrase(signal, keyword)) return fieldType
        }
      }
    }
    return null
  }


  const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'submit', 'button', 'reset', 'hidden', 'file', 'image', 'range', 'color'])

  function matchSignupFieldType(el) {
    if (isTrackedField(el)) return null
    if (el.tagName === 'INPUT' && NON_TEXT_INPUT_TYPES.has((el.type || '').toLowerCase())) return null
    for (const fieldType in SIGNUP_FIELD_MAP) {
      if (fieldMatchesSelectors(el, SIGNUP_FIELD_MAP[fieldType])) return fieldType
    }
    return matchSignupFieldTypeByKeywords(el)
  }

  async function unlockInline() {
    let result = null
    try { result = await chrome.runtime.sendMessage({ action: 'requestUnlock' }) } catch (e) {}
    if (result && result.success) pingActivity()
    return !!(result && result.success)
  }

  function fillFieldValue(el, value) {
    pingActivity()
    el.setAttribute('autocomplete', 'off')
    const filled = el.tagName === 'SELECT' ? setSelectValue(el, value) : (setNativeValue(el, value), true)
    if (!filled) return false
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    return true
  }

  function applyTagVariant(tag, variant) {
    const generate = variant === 'generate'
    tag.title = generate ? 'Generate a strong password with Valid Vault' : 'Fill with Valid Vault'
    tag.style.setProperty('background', generate ? '#05140a' : '#33ff66', 'important')
    tag.style.setProperty('color', generate ? '#33ff66' : '#05140a', 'important')
    tag.style.setProperty('box-shadow', generate ? '0 0 0 2px #33ff66,0 1px 6px rgba(0,0,0,0.5)' : '0 0 0 2px #05140a,0 1px 6px rgba(0,0,0,0.5)', 'important')
    tag.dataset.variant = generate ? 'generate' : 'fill'
  }

  function createVaultTag(variant) {
    const tag = document.createElement('div')
    tag.textContent = 'V'
    tag.title = 'Fill with Valid Vault'
    tag.style.cssText = [
      'position:absolute',
      'z-index:2147483646',
      'width:22px',
      'height:22px',
      'border-radius:50%',
      'background:#33ff66',
      'color:#05140a',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font:800 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
      'cursor:pointer',
      'user-select:none',
      'box-shadow:0 0 0 2px #05140a,0 1px 6px rgba(0,0,0,0.5)',
      'opacity:1',
      'visibility:visible',
      'pointer-events:auto'
    ].map((rule) => rule + ' !important').join(';')
    applyTagVariant(tag, variant)
    document.body.appendChild(tag)
    return tag
  }

  function deepElementAt(x, y, tag) {
    let hit = document.elementsFromPoint(x, y).filter((n) => n !== tag && !tag.contains(n))[0] || null
    for (let depth = 0; hit && depth < 8; depth++) {
      const sr = shadowRootOf(hit)
      if (!sr || !sr.elementsFromPoint) break
      const inner = sr.elementsFromPoint(x, y).filter((n) => n !== hit && n.getRootNode() === sr)[0]
      if (!inner) break
      hit = inner
    }
    return hit
  }

  function fieldIsShowing(el, rect) {
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true })) return false
    for (let n = composedParent(el); n && n !== document; n = composedParent(n)) {
      if (n.nodeType !== 1 || n === document.documentElement || n === document.body) continue
      const style = getComputedStyle(n)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      const clip = n.getBoundingClientRect()
      if (rect.right <= clip.left + 1 || rect.left >= clip.right - 1 || rect.bottom <= clip.top + 1 || rect.top >= clip.bottom - 1) return false
    }
    return true
  }

  function positionVaultTag(tag, el) {
    const rect = el.getBoundingClientRect()
    const hidden = el.offsetParent === null || rect.width === 0 || rect.height === 0 || tagTypeByEl.get(el) === 'confirm' || !fieldIsShowing(el, rect)
    tag.style.setProperty('display', hidden ? 'none' : 'flex', 'important')
    if (hidden) return
    const size = 22
    const top = rect.top + window.scrollY + (rect.height - size) / 2
    let left = rect.right + window.scrollX - size - 6
    const probeY = rect.top + rect.height / 2
    for (let i = 0; i < 4; i++) {
      const x0 = left - window.scrollX
      if (x0 < rect.left) break
      let blocker = null
      for (const probeX of [x0 + 1, x0 + size / 2, x0 + size - 1]) {
        const hit = deepElementAt(probeX, probeY, tag)
        if (hit && hit !== el && !composedContains(hit, el)) { blocker = hit; break }
      }
      if (!blocker) break
      left = Math.min(left - size - 8, blocker.getBoundingClientRect().left + window.scrollX - size - 4)
    }
    tag.style.setProperty('top', top + 'px', 'important')
    tag.style.setProperty('left', left + 'px', 'important')
  }

  document.addEventListener('input', (e) => {
    const t = eventOrigin(e)
    if (t && fieldTags.has(t)) positionVaultTag(fieldTags.get(t), t)
  }, true)

  function repositionAllTags() {
    for (const rec of taggedFieldRecords) positionVaultTag(rec.tag, rec.el)
  }

  let repositionQueued = false
  function queueReposition() {
    if (repositionQueued) return
    repositionQueued = true
    requestAnimationFrame(() => {
      repositionQueued = false
      repositionAllTags()
    })
  }

  document.addEventListener('transitionend', queueReposition, true)
  document.addEventListener('animationend', queueReposition, true)
  document.addEventListener('click', () => {
    setTimeout(queueReposition, 300)
    setTimeout(queueReposition, 900)
  }, true)

  const fieldTags = new WeakMap()
  const loginFieldsByEl = new WeakMap()
  const tagTypeByEl = new WeakMap()
  const taggedFieldRecords = []

  const PASSWORD_TAG_TYPES = new Set(['generate', 'current'])

  function attachVaultTag(el, fieldType) {
    if (fieldTags.has(el)) {
      const existingType = tagTypeByEl.get(el)
      if (PASSWORD_TAG_TYPES.has(fieldType) || fieldType === 'login' || (existingType !== 'login' && !PASSWORD_TAG_TYPES.has(existingType))) tagTypeByEl.set(el, fieldType)
      applyTagVariant(fieldTags.get(el), tagTypeByEl.get(el) === 'generate' ? 'generate' : 'fill')
      positionVaultTag(fieldTags.get(el), el)
      return
    }
    if (!el.isConnected) return
    tagTypeByEl.set(el, fieldType)
    const tag = createVaultTag(fieldType === 'generate' ? 'generate' : 'fill')
    positionVaultTag(tag, el)
    tag.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      pingActivity()
      const currentType = tagTypeByEl.get(el)
      if (currentType === 'generate' && credentialFormByEl.has(el)) showGeneratePicker(el, credentialFormByEl.get(el))
      else if (currentType === 'current' && credentialFormByEl.has(el)) showCurrentPicker(el, credentialFormByEl.get(el))
      else if (currentType === 'login' && loginFieldsByEl.has(el)) showLoginPicker(el, loginFieldsByEl.get(el))
      else showFieldPicker(el, currentType === 'login' ? 'email' : currentType)
    }
    const scrollHandler = () => positionVaultTag(tag, el)
    const resizeHandler = () => positionVaultTag(tag, el)
    window.addEventListener('scroll', scrollHandler, true)
    window.addEventListener('resize', resizeHandler)
    fieldTags.set(el, tag)
    taggedFieldRecords.push({ el, tag, scrollHandler, resizeHandler })
  }

  let fieldPicker = null

  const FIELD_PICKER_TITLES = {
    email: 'Choose an email',
    firstName: 'First name',
    lastName: 'Last name',
    phone: 'Phone',
    'address.street': 'Street address',
    'address.city': 'City',
    'address.state': 'State',
    'address.zip': 'ZIP',
    'address.country': 'Country'
  }

  function createFieldPicker() {
    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;z-index:2147483647;display:none;'
    OWN_SHADOW_HOSTS.add(host)
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'closed' })
    shadow.innerHTML = `
      <style>
        .dropdown { position:absolute; background:#1a1a1a; border:1px solid #333; border-radius:8px;
          box-shadow:0 4px 12px rgba(0,0,0,0.5); min-width:220px; max-width:340px; overflow:hidden;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
        .header { padding:10px 14px; background:#0a0a0a; color:#33ff66; font-size:12px; font-weight:500; border-bottom:1px solid #333; }
        .item { padding:10px 14px; cursor:pointer; border-bottom:1px solid #2a2a2a; color:#e0e0e0; font-size:13px; word-break:break-all; }
        .item:hover { background:#2a2a2a; }
        .item:last-child { border-bottom:none; }
        .empty { padding:10px 14px; color:#888; font-size:12px; }
        .section { padding:6px 14px; background:#111; color:#6fae7f; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #2a2a2a; }
      </style>
      <div class="dropdown">
        <div class="header" id="header"></div>
        <div id="items"></div>
      </div>
    `
    return { host, shadow }
  }

  async function fetchPickerValues(fieldType) {
    if (fieldType === 'email') {
      const r = await chrome.runtime.sendMessage({ action: 'getPersonalInfoAllEmails' })
      return { locked: !!(r && r.locked), values: (r && r.emails) || [] }
    }
    const r = await chrome.runtime.sendMessage({ action: 'getPersonalInfoField', fieldType })
    return { locked: !!(r && r.locked), values: r && r.value ? [r.value] : [] }
  }

  const GENERATE_NOTE_MS = 5000
  let pickerAutoHideTimer = null

  function hideFieldPicker() {
    if (pickerAutoHideTimer) { clearTimeout(pickerAutoHideTimer); pickerAutoHideTimer = null }
    if (fieldPicker) fieldPicker.host.style.display = 'none'
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fieldPicker && fieldPicker.host.style.display !== 'none') hideFieldPicker()
  }, true)

  function openPicker(field, title) {
    if (pickerAutoHideTimer) { clearTimeout(pickerAutoHideTimer); pickerAutoHideTimer = null }
    if (!fieldPicker) fieldPicker = createFieldPicker()
    const rect = field.getBoundingClientRect()
    fieldPicker.host.style.left = rect.left + window.scrollX + 'px'
    fieldPicker.host.style.top = rect.bottom + window.scrollY + 2 + 'px'
    fieldPicker.shadow.getElementById('header').textContent = title
    const itemsContainer = fieldPicker.shadow.getElementById('items')
    itemsContainer.innerHTML = ''
    fieldPicker.host.style.display = 'block'
    return itemsContainer
  }

  function addPickerSection(container, title) {
    const section = document.createElement('div')
    section.className = 'section'
    section.textContent = title
    container.appendChild(section)
  }

  function addPickerItem(container, text, onPick) {
    const item = document.createElement('div')
    item.className = 'item'
    item.textContent = text
    item.onclick = () => { onPick(); hideFieldPicker() }
    container.appendChild(item)
  }

  function addPickerEmpty(container, text) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = text
    container.appendChild(empty)
  }

  async function showFieldPicker(field, fieldType) {
    const itemsContainer = openPicker(field, 'Valid Vault: ' + (FIELD_PICKER_TITLES[fieldType] || 'Fill'))
    let result = await fetchPickerValues(fieldType)
    if (result.locked) {
      const unlocked = await unlockInline()
      if (unlocked) result = await fetchPickerValues(fieldType)
    }
    itemsContainer.innerHTML = ''
    if (result.values.length > 0) {
      result.values.forEach((value) => addPickerItem(itemsContainer, value, () => fillFieldValue(field, value)))
    } else {
      addPickerEmpty(itemsContainer, result.locked ? 'Vault is locked' : 'Nothing saved for this field. Add it in Personal Info.')
    }
  }

  async function fetchLoginPickerData(field) {
    const creds = await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain: currentDomain })
    let emails = { success: true, emails: [] }
    if (classifyLoginType(field) === 'email') emails = await chrome.runtime.sendMessage({ action: 'getPersonalInfoAllEmails' })
    return {
      locked: !!((creds && creds.locked) || (emails && emails.locked)),
      credentials: (creds && creds.success && creds.credentials) || [],
      emails: (emails && emails.emails) || []
    }
  }

  async function showLoginPicker(field, formFields) {
    const itemsContainer = openPicker(field, 'Valid Vault')
    let data = await fetchLoginPickerData(field)
    if (data.locked) {
      const unlocked = await unlockInline()
      if (unlocked) data = await fetchLoginPickerData(field)
    }
    itemsContainer.innerHTML = ''
    const targetType = classifyLoginType(field)
    const ranked = data.credentials
      .map((cred, i) => ({ cred, i }))
      .sort((a, b) => {
        const aMatch = (a.cred.loginType || 'username') === targetType ? 0 : 1
        const bMatch = (b.cred.loginType || 'username') === targetType ? 0 : 1
        return aMatch - bMatch || a.i - b.i
      })
      .map((x) => x.cred)
    if (ranked.length > 0) {
      addPickerSection(itemsContainer, 'Saved logins for this site')
      for (const cred of ranked) {
        const icon = LOGIN_TYPE_ICON[cred.loginType || 'username'] || LOGIN_TYPE_ICON.username
        addPickerItem(itemsContainer, icon + ' ' + cred.username, () => fillCredentials(cred, formFields))
      }
    }
    const withPrevious = ranked.filter((cred) => cred.previousPassword)
    if (withPrevious.length > 0) {
      addPickerSection(itemsContainer, 'Previous passwords')
      for (const cred of withPrevious) {
        addPickerItem(itemsContainer, '↩ ' + cred.username + ' (replaced ' + shortDate(cred.previousSetAt) + ')', () => {
          fillCredentials({ username: cred.username, password: cred.previousPassword, extraFields: [], isPrevious: true }, formFields)
          setTimeout(() => offerRestore(field, cred), 0)
        })
      }
    }
    if (data.emails.length > 0) {
      addPickerSection(itemsContainer, 'Your emails')
      for (const email of data.emails) addPickerItem(itemsContainer, email, () => fillFieldValue(field, email))
    }
    if (ranked.length === 0 && data.emails.length === 0) {
      addPickerEmpty(itemsContainer, data.locked ? 'Vault is locked' : 'No saved logins for this site yet. Log in or sign up and Valid Vault will offer to save it.')
    }
  }

  function shortDate(ts) {
    try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch (e) { return 'recently' }
  }

  function offerRestore(field, cred) {
    const itemsContainer = openPicker(field, 'Valid Vault: Previous password filled')
    addPickerEmpty(itemsContainer, 'Use this if the newer password for ' + cred.username + ' did not work, for example if a password change failed.')
    addPickerItem(itemsContainer, 'Make this the current password again', async () => {
      try { await chrome.runtime.sendMessage({ action: 'restorePreviousPassword', domain: currentDomain, username: cred.username }) } catch (e) {}
    })
    addPickerItem(itemsContainer, 'Keep the newer saved password', () => {})
  }

  async function showCurrentPicker(field, record) {
    const itemsContainer = openPicker(field, 'Valid Vault: Current password')
    let result = null
    try { result = await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain: currentDomain }) } catch (e) {}
    if (result && result.locked) {
      const unlocked = await unlockInline()
      if (unlocked) { try { result = await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain: currentDomain }) } catch (e) {} }
    }
    itemsContainer.innerHTML = ''
    const creds = (result && result.success && result.credentials) || []
    record.cachedCreds = creds
    if (creds.length === 0) {
      addPickerEmpty(itemsContainer, result && result.locked ? 'Vault is locked' : 'No saved login for this site yet.')
      return
    }
    addPickerSection(itemsContainer, 'Fill your current password')
    for (const cred of creds) {
      const icon = LOGIN_TYPE_ICON[cred.loginType || 'username'] || LOGIN_TYPE_ICON.username
      addPickerItem(itemsContainer, icon + ' ' + cred.username, () => {
        record.accountUsername = cred.username
        fillFieldValue(field, cred.password)
        noteCredentialUse(cred.username)
      })
    }
    const withPrevious = creds.filter((cred) => cred.previousPassword)
    if (withPrevious.length > 0) {
      addPickerSection(itemsContainer, 'Previous passwords')
      for (const cred of withPrevious) {
        addPickerItem(itemsContainer, '↩ ' + cred.username + ' (replaced ' + shortDate(cred.previousSetAt) + ')', () => {
          record.accountUsername = cred.username
          fillFieldValue(field, cred.previousPassword)
          setTimeout(() => offerRestore(field, cred), 0)
        })
      }
    }
  }

  const GEN_STYLE_CHOICES = { full: 'With special characters (Aa1!)', plain: 'Letters and numbers only (Aa1)' }
  const GEN_STYLE_SWITCH = { full: 'Use special characters instead', plain: 'Use letters and numbers only instead' }

  function showGeneratePicker(field, record) {
    const itemsContainer = openPicker(field, 'Valid Vault: New password')
    addPickerEmpty(itemsContainer, 'Pick a style. Some sites do not accept special characters.')
    addPickerItem(itemsContainer, GEN_STYLE_CHOICES.full, () => setTimeout(() => fillGeneratedPassword(field, record, 'full'), 0))
    addPickerItem(itemsContainer, GEN_STYLE_CHOICES.plain, () => setTimeout(() => fillGeneratedPassword(field, record, 'plain'), 0))
  }

  function fillGeneratedPassword(field, record, style) {
    const confirm = record.plan.confirm
    const password = generatePassword([field, confirm], style)
    fillFieldValue(field, password)
    if (confirm) fillFieldValue(confirm, password)
    const itemsContainer = openPicker(field, 'Valid Vault: New password')
    addPickerEmpty(itemsContainer, 'A strong ' + password.length + '-character password' + (style === 'plain' ? ' with letters and numbers only' : '') + ' is filled in' + (confirm ? ' both boxes.' : '.') + ' Valid Vault offers to save it when you submit.')
    addPickerItem(itemsContainer, 'Generate a different one', () => setTimeout(() => fillGeneratedPassword(field, record, style), 0))
    const other = style === 'plain' ? 'full' : 'plain'
    addPickerItem(itemsContainer, GEN_STYLE_SWITCH[other], () => setTimeout(() => fillGeneratedPassword(field, record, other), 0))
    pickerAutoHideTimer = setTimeout(hideFieldPicker, GENERATE_NOTE_MS)
  }

  document.addEventListener('click', (e) => {
    if (fieldPicker && fieldPicker.host.style.display !== 'none') {
      if (!fieldPicker.host.contains(e.target)) fieldPicker.host.style.display = 'none'
    }
  })

  function trySignupTag(el) {
    if (el.type === 'password') return
    const fieldType = matchSignupFieldType(el)
    if (!fieldType) return
    attachVaultTag(el, fieldType)
  }

  document.addEventListener('focus', (e) => {
    const t = eventOrigin(e)
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) trySignupTag(t)
  }, true)

  function scanPersonalInfoFields() {
    const fields = deepQueryAll('input, textarea, select')
    for (let i = 0; i < fields.length; i++) {
      const el = fields[i]
      if (el.tagName === 'INPUT' && (el.type === 'password' || el.type === 'hidden')) continue
      if (el.offsetParent === null) continue
      const fieldType = matchSignupFieldType(el)
      if (!fieldType) continue
      attachVaultTag(el, fieldType)
    }
    repositionAllTags()
  }

  function bootstrap() {
    init()
    scanPersonalInfoFields()
    checkPendingSave()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap)
  } else {
    bootstrap()
  }
})()