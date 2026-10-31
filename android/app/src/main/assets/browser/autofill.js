(function () {
  if (window.top !== window || window.__vvAutofill) return
  const BRIDGE = window.vvAutofill
  if (!BRIDGE || typeof BRIDGE.postMessage !== 'function') return
  Object.defineProperty(window, '__vvAutofill', { value: true })
  const POST = BRIDGE.postMessage.bind(BRIDGE)
  const RANDOM = crypto.getRandomValues.bind(crypto)
  const U32 = Uint32Array
  const STRINGIFY = JSON.stringify
  const PARSE = JSON.parse

  const TAG = 36
  const MIN_TAG = 24
  const GAP = 10
  const BLOCKER_GAP = 6
  const BLOCKER_TRIES = 4
  const MARK_RATIO = 0.41
  const SVG_NS = 'http://www.w3.org/2000/svg'
  const V_MARK_PATH = 'M5.7 8L105 8L108.8 22.4L11.8 22.4ZM237 8L336.3 8L330.2 22.4L233.2 22.4ZM17.9 36.9L112.5 36.9L116.3 51.3L24 51.3ZM229.5 36.9L324.1 36.9L318 51.3L225.7 51.3ZM30.1 65.8L120 65.8L123.8 80.2L36.2 80.2ZM222 65.8L311.9 65.8L305.8 80.2L218.2 80.2ZM42.3 94.7L127.5 94.7L131.3 109.1L48.4 109.1ZM214.5 94.7L299.7 94.7L293.6 109.1L210.7 109.1ZM54.5 123.6L135 123.6L138.8 138L60.7 138ZM207 123.6L287.5 123.6L281.3 138L203.2 138ZM66.8 152.4L142.6 152.4L146.3 166.9L72.9 166.9ZM199.4 152.4L275.2 152.4L269.1 166.9L195.7 166.9ZM79 181.3L150.1 181.3L153.8 195.8L85.1 195.8ZM191.9 181.3L263 181.3L256.9 195.8L188.2 195.8ZM91.2 210.2L157.6 210.2L161.3 224.7L97.3 224.7ZM184.4 210.2L250.8 210.2L244.7 224.7L180.7 224.7ZM103.4 239.1L165.1 239.1L168.8 253.6L109.5 253.6ZM176.9 239.1L238.6 239.1L232.5 253.6L173.2 253.6ZM115.6 268L226.4 268L220.3 282.4L121.7 282.4ZM127.8 296.9L214.2 296.9L208.1 311.3L133.9 311.3ZM140 325.8L202 325.8L195.8 340.2L146.2 340.2ZM152.3 354.7L189.7 354.7L183.6 369.1L158.4 369.1ZM164.5 383.6L177.5 383.6L171.4 398L170.6 398Z'
  const TAG_LOOKS = {
    fill: { background: 'linear-gradient(180deg,#ffffff,#ebe7df) padding-box,linear-gradient(135deg,#4a4c52,#0e0f11) border-box', mark: '#1d1e21' },
    generate: { background: 'linear-gradient(180deg,#2d3238,#1a1d21) padding-box,linear-gradient(135deg,#f4f6f8,#8a9098) border-box', mark: '#f4f6f8' }
  }
  const SCAN_MS = 350
  const SAVE_REPEAT_MS = 4000
  const REPLY_MS = 180000
  const GEN_MAX_PATTERN_TRIES = 200
  const GEN_FALLBACK_TRIES = 12
  const GEN_FALLBACK_MIN = 4
  const GEN_FALLBACK_SETS = [['upper', 'lower', 'digit'], ['lower', 'digit'], ['upper', 'digit'], ['lower'], ['digit']]
  const GEN_MAX_CHOICES = [24, 32, 48, 64]
  const GEN_MIN_CHOICES = [16, 20]
  const GEN_CLASSES = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digit: '0123456789',
    special: '!@#$%^&*'
  }
  const LOGIN_TOKEN = /^(user|username|user_name|userid|user_id|login|loginid|login_id|loginname|identifier|identifierid|signin|account|accountname|account_name|email_or_username)$/i
  const SIGNIN_LABEL = /log\s*in|sign\s*in|sign\s*on/i
  const SIGNUP_LABEL = /sign\s*up|register|create|join/i
  const CONFIRM_SIGNAL = /confirm|repeat|re-?type|re-?enter|again|verif/
  const CURRENT_SIGNAL = /current|existing|(^|[^a-z])old/
  const NEW_SIGNAL = /new|create|choose|set.?password|sign.?up|register/
  const SUBMIT_HINT = /log\s*in|sign\s*in|sign\s*on|sign\s*up|submit|continue|next|register|create|save|change|update|reset|confirm|verify|enter/i
  const SKIP_HINT = /show|hide|reveal|toggle|eye|visib|cancel|back|forgot|close/i
  const BUTTONS = 'button, input[type="submit" i], input[type="image" i], input[type="button" i], [role="button"]'
  const TEXT_TYPES = new Set(['', 'text', 'email', 'tel'])
  const NON_TEXT_TYPES = new Set(['checkbox', 'radio', 'submit', 'button', 'reset', 'hidden', 'file', 'image', 'range', 'color', 'password'])
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
  const INFO_SELECTORS = {
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
  const INFO_KEYWORDS = {
    firstName: ['first name', 'given name', 'firstname', 'fname'],
    lastName: ['last name', 'family name', 'surname', 'lastname', 'lname'],
    email: ['email', 'e mail', 'email address'],
    phone: ['phone', 'phone number', 'mobile', 'mobile number', 'cell phone', 'telephone'],
    'address.street': ['street address', 'address line 1', 'address line1', 'mailing address'],
    'address.zip': ['zip code', 'postal code', 'postcode']
  }
  const INFO_KEYWORDS_STRUCTURED = {
    'address.street': ['street'],
    'address.city': ['city', 'town'],
    'address.state': ['state', 'province'],
    'address.zip': ['zip'],
    'address.country': ['country']
  }
  const KIND_LOGIN = 'login'
  const KIND_GENERATE = 'generate'
  const KIND_INFO = 'info'

  const tags = new Map()
  const hosts = new WeakSet()
  let scanTimer = 0
  let frame = 0
  let lastSave = ''
  let lastSaveAt = 0
  let pendingInfo = null
  let pendingGenerate = null

  function typeOf(el) {
    return (el.getAttribute('type') || '').toLowerCase()
  }

  function isPassword(el) {
    return el.tagName === 'INPUT' && typeOf(el) === 'password'
  }

  function isText(el) {
    return el.tagName === 'INPUT' && TEXT_TYPES.has(typeOf(el))
  }

  function shown(el) {
    if (!el.isConnected) return false
    const r = el.getBoundingClientRect()
    if (r.width < 24 || r.height < 12) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
  }

  function usable(el) {
    return !el.disabled && !el.readOnly && shown(el)
  }

  function scopeOf(el) {
    return el.form || document
  }

  function normalizeLabel(label) {
    return String(label || '')
      .toLowerCase()
      .replace(/[:*]+$/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  }

  function hasPhrase(normalized, phrase) {
    return (' ' + normalized + ' ').indexOf(' ' + phrase + ' ') !== -1
  }

  function matchesAny(el, selectors) {
    for (const s of selectors) if (el.matches(s)) return true
    return false
  }

  function structuredSignals(el) {
    const out = []
    if (el.name) out.push(el.name)
    if (el.id) out.push(el.id)
    const auto = el.getAttribute('autocomplete')
    if (auto) out.push(auto)
    return out
  }

  function freeSignals(el) {
    const out = []
    const aria = el.getAttribute('aria-label')
    if (aria) out.push(aria)
    const placeholder = el.getAttribute('placeholder')
    if (placeholder) out.push(placeholder)
    if (el.labels) for (const l of el.labels) if (l.textContent) out.push(l.textContent)
    return out
  }

  function infoType(el) {
    if (el.tagName === 'INPUT' && NON_TEXT_TYPES.has(typeOf(el))) return null
    if (el.tagName === 'INPUT') {
      for (const type in INFO_SELECTORS) if (matchesAny(el, INFO_SELECTORS[type])) return type
    }
    const structured = structuredSignals(el).map(normalizeLabel)
    const all = structured.concat(freeSignals(el).map(normalizeLabel))
    for (const type in INFO_KEYWORDS) {
      for (const signal of all) for (const word of INFO_KEYWORDS[type]) if (hasPhrase(signal, word)) return type
    }
    for (const type in INFO_KEYWORDS_STRUCTURED) {
      for (const signal of structured) for (const word of INFO_KEYWORDS_STRUCTURED[type]) if (hasPhrase(signal, word)) return type
    }
    return null
  }

  function loginType(el) {
    const type = typeOf(el)
    if (type === 'email') return 'email'
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase()
    if (auto === 'email') return 'email'
    const hay = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase()
    if (/email/.test(hay)) return 'email'
    return 'username'
  }

  function loginOnly(el) {
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase()
    if (auto.includes('username') || auto.includes('webauthn')) return true
    return LOGIN_TOKEN.test(el.name || '') || LOGIN_TOKEN.test(el.id || '')
  }

  function buttonLabels(scope) {
    const out = []
    for (const b of scope.querySelectorAll(BUTTONS)) {
      if (!shown(b)) continue
      out.push([b.textContent, b.value, b.getAttribute('aria-label')].map((v) => v || '').join(' '))
    }
    return out.join(' ')
  }

  function signInForm(scope) {
    const labels = buttonLabels(scope)
    return SIGNIN_LABEL.test(labels) && !SIGNUP_LABEL.test(labels)
  }

  function passwordSignals(el) {
    const parts = [el.getAttribute('autocomplete'), el.name, el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label')]
    if (el.labels) for (const l of el.labels) parts.push(l.textContent)
    return parts.filter(Boolean).join(' ').toLowerCase()
  }

  function passwordRole(el) {
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase()
    const signals = passwordSignals(el)
    if (CONFIRM_SIGNAL.test(signals)) return 'confirm'
    if (auto.indexOf('current-password') !== -1 || CURRENT_SIGNAL.test(signals)) return 'current'
    if (auto.indexOf('new-password') !== -1 || NEW_SIGNAL.test(signals)) return 'new'
    return null
  }

  function planPasswords(fields) {
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
      const confirmAt = roles.lastIndexOf('confirm')
      const confirm = confirmAt !== -1 && fields[confirmAt] !== current ? fields[confirmAt] : fields[2]
      const fresh = fields.find((f) => f !== current && f !== confirm)
      if (!fresh) return null
      return { current, fresh, confirm }
    }
    return null
  }

  function asksForName(scope) {
    for (const el of scope.querySelectorAll('input')) {
      if (!isText(el) || !usable(el)) continue
      const type = infoType(el)
      if (type === 'firstName' || type === 'lastName') return true
    }
    return false
  }

  function signupPlan(scope, fields) {
    if (fields.length > 2 || fields.some((f) => passwordRole(f)) || !asksForName(scope)) return null
    return { current: null, fresh: fields[0], confirm: fields[1] || null }
  }

  function textFieldsIn(scope) {
    return Array.from(scope.querySelectorAll('input')).filter((i) => isText(i) && usable(i))
  }

  function usernameFor(password, scope) {
    const list = textFieldsIn(scope)
    const named = list.find((i) => matchesAny(i, USERNAME_SELECTORS))
    if (named) return named
    let best = null
    for (const i of list) {
      if (i.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING) best = i
    }
    return best
  }

  function classify() {
    const found = new Map()
    const scopes = new Map()
    for (const el of document.querySelectorAll('input')) {
      if (!isPassword(el) || !usable(el)) continue
      const scope = scopeOf(el)
      if (!scopes.has(scope)) scopes.set(scope, [])
      scopes.get(scope).push(el)
    }
    const loginScopes = new Set()
    for (const [scope, fields] of scopes) {
      if (fields.length === 1 && passwordRole(fields[0]) === 'confirm') continue
      const plan = fields.length === 1 && passwordRole(fields[0]) === 'new' && signInForm(scope) && !asksForName(scope)
        ? null
        : planPasswords(fields) || signupPlan(scope, fields)
      if (plan) {
        if (plan.current) found.set(plan.current, { kind: KIND_LOGIN, field: 'current' })
        found.set(plan.fresh, { kind: KIND_GENERATE, plan })
        continue
      }
      loginScopes.add(scope)
      for (const pw of fields) {
        found.set(pw, { kind: KIND_LOGIN, field: 'password' })
        const user = usernameFor(pw, scope)
        if (user && !found.has(user)) found.set(user, { kind: KIND_LOGIN, field: loginType(user) })
      }
    }
    const loginTagged = new Set()
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (found.has(el) || !usable(el) || isPassword(el)) continue
      if (el.tagName === 'INPUT' && NON_TEXT_TYPES.has(typeOf(el))) continue
      const scope = scopeOf(el)
      if (!scopes.has(scope) && !loginTagged.has(scope) && isText(el) && loginOnly(el)) {
        loginTagged.add(scope)
        found.set(el, { kind: KIND_LOGIN, field: loginType(el) })
        continue
      }
      const type = infoType(el)
      if (type) found.set(el, { kind: KIND_INFO, type })
    }
    return found
  }

  function paint(host, kind) {
    const face = host.__vvFace
    const generate = kind === KIND_GENERATE
    const look = generate ? TAG_LOOKS.generate : TAG_LOOKS.fill
    face.style.background = look.background
    host.__vvMark.style.fill = look.mark
    host.setAttribute('aria-label', generate ? 'Generate a password with Valid Vault' : 'Fill with Valid Vault')
  }

  function makeTag(field) {
    const host = document.createElement('div')
    host.setAttribute('role', 'button')
    host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483647!important;width:' + TAG + 'px!important;height:' + TAG + 'px!important;display:none!important;cursor:pointer!important;margin:0!important;padding:0!important'
    const root = host.attachShadow({ mode: 'closed' })
    const face = document.createElement('div')
    face.style.cssText = 'width:100%;height:100%;box-sizing:border-box;border-radius:50%;border:2px solid transparent;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 1px 0 rgba(255,255,255,0.45),0 1px 0 rgba(0,0,0,0.2),0 1px 3px rgba(0,0,0,0.2);user-select:none;-webkit-user-select:none'
    const mark = document.createElementNS(SVG_NS, 'svg')
    mark.setAttribute('viewBox', '0 0 342 403')
    mark.setAttribute('aria-hidden', 'true')
    mark.setAttribute('focusable', 'false')
    mark.style.cssText = 'display:block;width:14px;height:17px;margin-top:1px;pointer-events:none'
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', V_MARK_PATH)
    mark.appendChild(path)
    face.appendChild(mark)
    root.appendChild(face)
    Object.defineProperty(host, '__vvFace', { value: face })
    Object.defineProperty(host, '__vvMark', { value: mark })
    host.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation() }, true)
    host.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() }, true)
    host.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.isTrusted) tapped(field)
    }, true)
    hosts.add(host)
    document.documentElement.appendChild(host)
    return host
  }

  function infoScopeOf(el) {
    if (el.form) return el.form
    let node = el.parentElement
    for (let depth = 0; node && node !== document.body && depth < 8; depth++) {
      if (node.querySelector(BUTTONS)) return node
      node = node.parentElement
    }
    return document
  }

  function inScope(field, scope) {
    return scope === document ? !field.form : scope.contains(field)
  }

  function infoFieldsOf(scope) {
    const out = []
    for (const [field, tag] of tags) {
      if (tag.info.kind === KIND_INFO && field.isConnected && inScope(field, scope)) out.push(field)
    }
    out.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
    return out
  }

  function tapped(field) {
    const tag = tags.get(field)
    if (!tag) return
    const info = tag.info
    if (info.kind === KIND_LOGIN) {
      POST(STRINGIFY({ type: 'fill', field: info.field }))
      return
    }
    if (info.kind === KIND_GENERATE) {
      pendingGenerate = { fresh: info.plan.fresh, confirm: info.plan.confirm, at: Date.now() }
      POST(STRINGIFY({ type: 'generate' }))
      return
    }
    const scope = infoScopeOf(field)
    const types = []
    for (const f of infoFieldsOf(scope)) {
      const t = tags.get(f).info.type
      if (types.indexOf(t) === -1) types.push(t)
    }
    pendingInfo = { field, type: info.type, at: Date.now() }
    POST(STRINGIFY({ type: 'info', field: info.type, fields: types }))
  }

  function setNative(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    const d = Object.getOwnPropertyDescriptor(proto, 'value')
    if (d && d.set) d.set.call(el, value)
    else el.value = value
  }

  function setSelect(el, value) {
    const target = normalizeLabel(value)
    let match = null
    for (const opt of el.options) if (opt.value === value) { match = opt; break }
    if (!match) {
      for (const opt of el.options) {
        if (normalizeLabel(opt.value) === target || normalizeLabel(opt.textContent) === target) { match = opt; break }
      }
    }
    if (!match) return false
    setNative(el, match.value)
    return true
  }

  function fillValue(el, value) {
    const ok = el.tagName === 'SELECT' ? setSelect(el, value) : (setNative(el, value), true)
    if (!ok) return false
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }

  function hasValue(el) {
    if (el.tagName !== 'SELECT') return !!el.value
    const opt = el.options[el.selectedIndex]
    return !!opt && !!opt.value && el.selectedIndex > 0 && !opt.defaultSelected
  }

  function fillInfo(values) {
    const pending = pendingInfo
    pendingInfo = null
    if (!pending || Date.now() - pending.at > REPLY_MS || !values || typeof values !== 'object') return
    scan()
    let target = pending.field
    if (!target.isConnected) {
      target = null
      for (const [field, tag] of tags) {
        if (tag.info.kind === KIND_INFO && tag.info.type === pending.type && field.isConnected) { target = field; break }
      }
    }
    if (!target) {
      POST(STRINGIFY({ type: 'filled', count: 0 }))
      return
    }
    let filled = 0
    for (const field of infoFieldsOf(infoScopeOf(target))) {
      const type = tags.get(field).info.type
      const value = values[type]
      if (typeof value !== 'string' || !value) continue
      if (field !== target && hasValue(field)) continue
      if (fillValue(field, value)) filled++
    }
    POST(STRINGIFY({ type: 'filled', count: filled }))
  }

  function randomInt(limit) {
    if (!(limit >= 1)) return 0
    const range = 0x100000000
    const cap = range - (range % limit)
    const buf = new U32(1)
    while (true) {
      RANDOM(buf)
      if (buf[0] < cap) return buf[0] % limit
    }
  }

  function parseRules(text) {
    const rules = { classes: null, minlength: 0, maxlength: Infinity }
    if (!text) return rules
    const wanted = []
    for (const part of text.split(';')) {
      const at = part.indexOf(':')
      if (at === -1) continue
      const name = part.slice(0, at).trim().toLowerCase()
      const value = part.slice(at + 1).trim()
      if (name === 'minlength' && Number(value) > 0) rules.minlength = Number(value)
      if (name === 'maxlength' && Number(value) > 0) rules.maxlength = Number(value)
      if (name === 'required' || name === 'allowed') {
        for (const item of value.split(',')) {
          const token = item.trim()
          const custom = token.match(/^\[(.*)\]$/)
          if (custom && custom[1]) wanted.push({ required: name === 'required', chars: custom[1] })
          else if (token === 'ascii-printable') wanted.push({ required: name === 'required', chars: GEN_CLASSES.upper + GEN_CLASSES.lower + GEN_CLASSES.digit + GEN_CLASSES.special })
          else if (GEN_CLASSES[token]) wanted.push({ required: name === 'required', chars: GEN_CLASSES[token] })
        }
      }
    }
    if (wanted.length) rules.classes = wanted
    return rules
  }

  function generationPlan(fields, style, prefs) {
    let minLen = 0
    let maxLen = Infinity
    let classes = null
    let pattern = null
    for (const el of fields) {
      if (!el) continue
      const rules = parseRules(el.getAttribute('passwordrules'))
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
    const max = GEN_MAX_CHOICES.indexOf(prefs.max) !== -1 ? prefs.max : GEN_MAX_CHOICES[0]
    const min = GEN_MIN_CHOICES.indexOf(prefs.min) !== -1 ? prefs.min : GEN_MIN_CHOICES[0]
    const tier = GEN_MAX_CHOICES.indexOf(max)
    const floor = tier > 0 ? GEN_MAX_CHOICES[tier - 1] + 1 : min
    const span = Math.max(4, max - floor)
    let lo = Math.max(floor, minLen)
    let hi = Math.max(max, lo + span)
    if (maxLen < lo) { lo = maxLen; hi = maxLen } else if (maxLen < hi) hi = maxLen
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
    for (const c of plan.classes) if (c.required && chars.length < length) chars.push(c.chars[randomInt(c.chars.length)])
    while (chars.length < length) chars.push(pool[randomInt(pool.length)])
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1)
      const t = chars[i]
      chars[i] = chars[j]
      chars[j] = t
    }
    return chars.join('')
  }

  function fitPattern(plan) {
    for (const set of GEN_FALLBACK_SETS) {
      const classes = set.map((k) => ({ required: true, chars: GEN_CLASSES[k] }))
      for (let length = Math.max(plan.hi, GEN_FALLBACK_MIN); length >= GEN_FALLBACK_MIN; length--) {
        const trial = { lo: length, hi: length, classes }
        for (let i = 0; i < GEN_FALLBACK_TRIES; i++) {
          const value = generateOnce(trial)
          if (plan.pattern.test(value)) return value
        }
      }
    }
    return null
  }

  function generate(style, prefs) {
    const pending = pendingGenerate
    pendingGenerate = null
    if (!pending || Date.now() - pending.at > REPLY_MS || !pending.fresh.isConnected) return
    const fields = [pending.fresh, pending.confirm].filter((f) => f && f.isConnected)
    const plan = generationPlan(fields, style === 'plain' ? 'plain' : 'full', prefs || {})
    if (plan.hi < 1) return
    let value = generateOnce(plan)
    if (plan.pattern) for (let i = 0; i < GEN_MAX_PATTERN_TRIES && !plan.pattern.test(value); i++) value = generateOnce(plan)
    if (plan.pattern && !plan.pattern.test(value)) value = fitPattern(plan) || value
    for (const f of fields) fillValue(f, value)
    POST(STRINGIFY({ type: 'generated', length: value.length, both: fields.length > 1 }))
  }

  BRIDGE.addEventListener('message', (e) => {
    let msg
    try { msg = PARSE(e.data) } catch (x) { return }
    if (!msg || typeof msg !== 'object') return
    if (msg.cmd === 'info') fillInfo(msg.values)
    else if (msg.cmd === 'generate') generate(msg.style, { min: msg.min, max: msg.max })
  })

  function place() {
    frame = 0
    for (const [field, tag] of tags) {
      const host = tag.host
      if (!field.isConnected || field.disabled) {
        host.remove()
        tags.delete(field)
        continue
      }
      if (!host.isConnected) document.documentElement.appendChild(host)
      const r = field.getBoundingClientRect()
      const on = shown(field) && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
      host.style.setProperty('display', on ? 'block' : 'none', 'important')
      if (!on) continue
      const size = Math.max(MIN_TAG, Math.min(TAG, Math.round(r.height) - 6))
      const top = Math.round(r.top + (r.height - size) / 2)
      host.style.setProperty('width', size + 'px', 'important')
      host.style.setProperty('height', size + 'px', 'important')
      host.style.setProperty('top', top + 'px', 'important')
      host.style.setProperty('left', Math.round(clearSpot(field, r, size)) + 'px', 'important')
      const markWidth = Math.round(size * MARK_RATIO)
      host.__vvMark.style.width = markWidth + 'px'
      host.__vvMark.style.height = Math.round(markWidth * 403 / 342) + 'px'
    }
  }

  function blockerAt(field, x, y) {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null
    for (const el of document.elementsFromPoint(x, y)) {
      if (hosts.has(el)) continue
      if (el === field || el.contains(field)) return null
      return el
    }
    return null
  }

  function clearSpot(field, r, size) {
    const floor = r.left + r.width / 2
    const y = r.top + r.height / 2
    let left = r.right - size - GAP
    for (let i = 0; i < BLOCKER_TRIES && left > floor; i++) {
      let blocker = null
      for (const x of [left + 1, left + size / 2, left + size - 1]) {
        blocker = blockerAt(field, x, y)
        if (blocker) break
      }
      if (!blocker) break
      left = Math.min(left - size - BLOCKER_GAP, blocker.getBoundingClientRect().left - size - BLOCKER_GAP)
    }
    return Math.max(floor, left)
  }

  function queuePlace() {
    if (!frame) frame = requestAnimationFrame(place)
  }

  function scan() {
    scanTimer = 0
    const found = classify()
    for (const [field, tag] of tags) {
      if (!found.has(field)) {
        tag.host.remove()
        tags.delete(field)
      }
    }
    for (const [field, info] of found) {
      const tag = tags.get(field)
      if (tag) {
        if (tag.info.kind !== info.kind) paint(tag.host, info.kind)
        tag.info = info
        continue
      }
      const host = makeTag(field)
      paint(host, info.kind)
      tags.set(field, { host, info })
    }
    queuePlace()
  }

  function queueScan() {
    if (!scanTimer) scanTimer = setTimeout(scan, SCAN_MS)
  }

  function credentials() {
    const filled = Array.from(document.querySelectorAll('input')).filter((i) => isPassword(i) && i.value && shown(i))
    if (!filled.length) return null
    const pw = filled.length === 3 ? filled[1] : filled[0]
    const list = Array.from(scopeOf(pw).querySelectorAll('input')).filter((i) => !i.disabled && shown(i))
    const at = list.indexOf(pw)
    let user = null
    let named = null
    for (let k = at - 1; k >= 0; k--) {
      const field = list[k]
      if (!isText(field) || !field.value) continue
      if (!user) user = field
      if (!named && (matchesAny(field, USERNAME_SELECTORS) || loginOnly(field))) named = field
    }
    const chosen = named || user
    return { username: chosen ? chosen.value.trim() : '', password: pw.value }
  }

  function capture() {
    const c = credentials()
    if (!c) return
    const stamp = c.username + '\n' + c.password
    const now = Date.now()
    if (stamp === lastSave && now - lastSaveAt < SAVE_REPEAT_MS) return
    lastSave = stamp
    lastSaveAt = now
    POST(STRINGIFY({ type: 'save', username: c.username, password: c.password }))
  }

  function submitter(target) {
    const b = target.closest(BUTTONS)
    if (!b) return false
    const label = [b.textContent, b.value, b.getAttribute('aria-label'), b.getAttribute('title'), b.id, b.getAttribute('name')].map((v) => v || '').join(' ')
    if (SKIP_HINT.test(label)) return false
    const type = (b.getAttribute('type') || '').toLowerCase()
    if (b.tagName === 'INPUT') return type === 'submit' || type === 'image' || SUBMIT_HINT.test(label)
    if (b.tagName === 'BUTTON' && b.form && (type === '' || type === 'submit')) return true
    return SUBMIT_HINT.test(label)
  }

  document.addEventListener('submit', capture, true)
  document.addEventListener('keydown', (e) => {
    const t = e.target
    if (e.key === 'Enter' && t && t.tagName === 'INPUT' && (isPassword(t) || isText(t))) capture()
  }, true)
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !e.target || !e.target.closest) return
    if (hosts.has(e.target)) return
    if (submitter(e.target)) capture()
  }, true)

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (!hosts.has(r.target)) {
        queueScan()
        return
      }
    }
  })

  function start() {
    if (!document.documentElement) return
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'style', 'class', 'hidden', 'disabled', 'name', 'id', 'autocomplete', 'placeholder', 'aria-label'] })
    queueScan()
  }

  addEventListener('scroll', queuePlace, { capture: true, passive: true })
  addEventListener('resize', queuePlace)
  document.addEventListener('focusin', queueScan, true)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
  addEventListener('load', queueScan)
})();
