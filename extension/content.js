(() => {
  if (window.localVaultInjected) return
  window.localVaultInjected = true

  // background.js's inactivity timer only resets on an explicit 'activity' message.
  // Without this, actively using autofill on a page doesn't count as activity, and
  // the vault can lock mid-use even while the person is right there working with it.
  // Throttled so the broader set of call sites below (ordinary typing, every
  // autofill dispatch, dropdown opens) can ping liberally without turning every
  // keystroke into its own runtime message — only the correctness of "was there
  // recent activity" matters, not sub-second precision.
  let lastActivityPingAt = 0
  function pingActivity() {
    const now = Date.now()
    if (now - lastActivityPingAt < 3000) return
    lastActivityPingAt = now
    try { chrome.runtime.sendMessage({ action: 'activity' }) } catch (e) {}
  }

  // Ordinary typing/selecting in any field on the page, and every synthetic
  // input event our own autofill dispatches, both land here — so passive
  // personal-info autofill and plain typing both count as activity now, not
  // just the handful of deliberate click-driven actions (dropdown pick, tag
  // click, unlock) that were the only things resetting the timer before.
  document.addEventListener('input', (e) => {
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) pingActivity()
  }, true)
  // Tab/arrow-key navigation between fields, and time spent with a dropdown
  // or the save prompt open, doesn't fire 'input' at all — this catches the
  // "still clearly here, just not typing this instant" case.
  document.addEventListener('keydown', (e) => {
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) pingActivity()
  }, true)

  // React (and similar frameworks) install their own value tracker over a plain
  // `el.value = x` assignment, so setting it directly can leave the DOM showing
  // the new value while the framework's internal state — and anything driven by
  // its onChange — never sees the change. Calling the native prototype setter
  // directly, before dispatching the input event, is what actually invalidates
  // that tracker. Falls back to a plain assignment for anything without one
  // (plain HTML pages, older engines) — this can only help, never regress.
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

  // A <select>'s value has to be one of its own <option> values — assigning an
  // arbitrary string (a saved "United States" against options keyed "US", say)
  // silently clears the selection instead of picking anything, which is worse
  // than leaving it untouched. Tries an exact option value match first, then a
  // normalized match against either the option's value or its visible text
  // (handles "US" vs "United States", casing, punctuation). Returns whether
  // anything was actually selected, so callers only dispatch input/change and
  // mark the field filled when a real match was found.
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
  let dropdown = null
  let dropdownOwnerField = null  // which field the currently-open dropdown belongs to

  // A page can have more than one login form (or gain a second one dynamically,
  // via the MutationObserver below). Each wired form gets its own {username,
  // password} pair instead of everything sharing one mutable global — a shared
  // pair meant that wiring a second form silently repointed the first form's
  // already-attached listeners at the wrong fields.
  const wiredForms = []
  const trackedFields = new Set()  // every username/password field across all wired forms

  // Shared low-level matcher: both the login-username heuristic and the signup/
  // personal-info classifier (matchSignupFieldType, below) run candidate fields
  // through the same selector-list check, instead of each hand-rolling its own
  // matching logic. Keeps the two classifiers from silently disagreeing about
  // what a given input actually is.
  function fieldMatchesSelectors(el, selectors) {
    for (let i = 0; i < selectors.length; i++) {
      if (el.matches(selectors[i])) return true
    }
    return false
  }

  // Used only to PREFER a candidate within detectLoginForm's existing pool of
  // visible text/email/tel inputs — it never narrows that pool. If nothing
  // matches, the previous behavior (first visible candidate) still applies, so
  // this can only make matching better on sites that already worked, not break
  // them.
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

  function detectLoginForm(skipPasswordFields) {
    const pwFields = document.querySelectorAll('input[type="password"]')
    if (pwFields.length === 0) return null

    for (const pwField of pwFields) {
      if (skipPasswordFields && skipPasswordFields.has(pwField)) continue
      const form = pwField.closest('form') || document
      const candidates = Array.from(form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]'))
        .filter((input) => input.offsetParent !== null)
      if (candidates.length === 0) continue

      const best = candidates.find((input) => fieldMatchesSelectors(input, USERNAME_SELECTORS)) || candidates[0]
      return { username: best, password: pwField }
    }
    return null
  }

  function createDropdown() {
    const shadowHost = document.createElement('div')
    shadowHost.id = 'local-vault-dropdown-host'
    shadowHost.style.cssText = 'position:absolute;z-index:2147483647;'
    document.body.appendChild(shadowHost)

    const shadow = shadowHost.attachShadow({ mode: 'closed' })
    
    shadow.innerHTML = `
      <style>
        .dropdown {
          position: absolute;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          min-width: 280px;
          max-width: 400px;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .header {
          padding: 12px 16px;
          background: #0a0a0a;
          color: #00d4aa;
          font-size: 12px;
          font-weight: 500;
          border-bottom: 1px solid #333;
        }
        .item {
          padding: 12px 16px;
          cursor: pointer;
          border-bottom: 1px solid #2a2a2a;
          color: #e0e0e0;
        }
        .item:hover {
          background: #2a2a2a;
        }
        .item:last-child {
          border-bottom: none;
        }
        .username {
          font-size: 13px;
          margin-bottom: 4px;
        }
        .password-dots {
          font-size: 11px;
          color: #666;
        }
        .manage {
          padding: 10px 16px;
          text-align: center;
          color: #00d4aa;
          font-size: 12px;
          border-top: 1px solid #333;
        }
        .no-accounts {
          padding: 16px;
          text-align: center;
          color: #666;
          font-size: 12px;
        }
      </style>
      <div class="dropdown" id="dropdown">
        <div class="header">🔐 Local Vault</div>
        <div id="items"></div>
      </div>
    `

    return { host: shadowHost, shadow }
  }

  function positionDropdown(field) {
    if (!dropdown) return
    const rect = field.getBoundingClientRect()
    dropdown.host.style.left = rect.left + window.scrollX + 'px'
    dropdown.host.style.top = rect.bottom + window.scrollY + 2 + 'px'
  }

  // formFields identifies which form's dropdown this is, so selecting a
  // credential always fills the fields it was opened from, even if another
  // login form on the page got focused/wired in between.
  async function showDropdown(field, formFields) {
    // Opening the dropdown (without necessarily picking anything yet) is
    // itself a sign the person is actively working the page, not idle.
    pingActivity()
    if (!dropdown) dropdown = createDropdown()

    dropdownOwnerField = field
    positionDropdown(field)
    dropdown.host.style.display = 'block'

    const response = await chrome.runtime.sendMessage({
      action: 'getCredentialsForDomain',
      domain: currentDomain
    })

    const itemsContainer = dropdown.shadow.getElementById('items')
    itemsContainer.innerHTML = ''

    if (response.success && response.credentials.length > 0) {
      for (const cred of response.credentials) {
        const item = document.createElement('div')
        item.className = 'item'
        item.innerHTML = `
          <div class="username">${escapeHtml(cred.username)}</div>
          <div class="password-dots">••••••••</div>
        `
        item.onclick = () => fillCredentials(cred, formFields)
        itemsContainer.appendChild(item)
      }

      const manage = document.createElement('div')
      manage.className = 'manage'
      manage.textContent = 'Manage in Local Vault...'
      manage.onclick = () => chrome.runtime.sendMessage({ action: 'openManage' })
      itemsContainer.appendChild(manage)
    } else {
      itemsContainer.innerHTML = '<div class="no-accounts">No saved accounts</div>'
    }
  }

  function hideDropdown() {
    if (dropdown) dropdown.host.style.display = 'none'
  }

  function fillCredentials(cred, formFields) {
    pingActivity()
    const username = formFields && formFields.username
    const password = formFields && formFields.password
    if (username) {
      setNativeValue(username, cred.username)
      username.dispatchEvent(new Event('input', { bubbles: true }))
      username.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (password) {
      setNativeValue(password, cred.password)
      password.dispatchEvent(new Event('input', { bubbles: true }))
      password.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (cred.extraFields && cred.extraFields.length) {
      const form = (password && password.closest('form')) || document
      const candidates = form.querySelectorAll('input, textarea, select')
      for (const el of candidates) {
        if (isTrackedField(el)) continue
        if (el.tagName === 'INPUT' && (el.type === 'password' || el.type === 'hidden')) continue
        if (el.value) continue
        const match = cred.extraFields.find((f) => normalizeLabel(f.label) === normalizeLabel(getFieldLabel(el)))
        if (match) {
          const filled = el.tagName === 'SELECT' ? setSelectValue(el, match.value) : (setNativeValue(el, match.value), true)
          if (filled) {
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
          }
        }
      }
    }
    hideDropdown()
  }

  // Anything on the form that isn't the login/password and isn't a Personal Info
  // field (name, phone, address, email stay a settings-driven autofill source, never
  // captured per-site) still belongs to this one site's credential record, things
  // like an account number. It's captured as the user types it, not filled from a
  // settings page, and saved alongside the login it was typed next to.
  function isTrackedField(el) {
    return trackedFields.has(el)
  }

  // A saved label and a freshly-read one rarely come back byte-identical: sites
  // tweak whitespace, capitalization, or a trailing colon/asterisk without changing
  // what the field actually is. Matching should tolerate that; the label shown to
  // the user stays whatever was originally captured.
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
        .extra-note { color:#6fae7f; font-size:11px; margin-bottom:16px; }
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

  function showSavePrompt(domain, username, password, isUpdate, extraFields, pendingId) {
    if (!savePrompt) savePrompt = createSavePrompt()
    savePrompt.shadow.getElementById('sp-title').textContent = isUpdate ? 'Update saved password?' : 'Save to Valid Vault?'
    savePrompt.shadow.getElementById('sp-domain').textContent = domain
    savePrompt.shadow.getElementById('sp-user').textContent = username || '(no username)'
    const extraEl = savePrompt.shadow.getElementById('sp-extra')
    if (extraEl) {
      extraEl.textContent = extraFields && extraFields.length
        ? '+ ' + extraFields.length + ' additional field' + (extraFields.length !== 1 ? 's' : '') + ' on this form will be saved too'
        : ''
    }
    const msgEl0 = savePrompt.shadow.getElementById('sp-msg')
    if (msgEl0) msgEl0.textContent = ''
    savePrompt.host.style.display = 'block'
    // Any real dismissal — cancel, clicking outside, or a successful save —
    // resolves the underlying pending-save record (by its own id, since more
    // than one can be staged in the same tab) so it stops reappearing on later
    // pages in this tab. A locked-vault save attempt does NOT resolve it (see
    // below), since the user is expected to unlock and click Save again. A
    // non-locked write failure (storage error, etc.) also does not resolve it
    // — the user sees an error and can retry Save without losing the capture.
    const close = () => {
      savePrompt.host.style.display = 'none'
      if (pendingId) { try { chrome.runtime.sendMessage({ action: 'resolvePendingSave', id: pendingId }) } catch (e) {} }
    }
    savePrompt.shadow.getElementById('sp-cancel').onclick = close
    savePrompt.shadow.getElementById('sp-save').onclick = async () => {
      pingActivity()
      const msgEl = savePrompt.shadow.getElementById('sp-msg')
      const result = await chrome.runtime.sendMessage({ action: 'saveCredential', domain, username, password, extraFields })
      if (result && result.locked) {
        if (msgEl) msgEl.textContent = 'Vault is locked. Click the Valid Vault icon to unlock, then click Save again.'
        return
      }
      if (!result || !result.success) {
        if (msgEl) msgEl.textContent = 'Could not save — please try again.'
        return
      }
      close()
    }
    savePrompt.shadow.getElementById('backdrop').onclick = (e) => {
      if (e.target === savePrompt.shadow.getElementById('backdrop')) close()
    }
  }

  // domain is passed explicitly (not read from the outer currentDomain) because
  // checkPendingSave() can be resolving a save that was staged on a DIFFERENT
  // page than the one currently loaded (a redirect mid-login) — the credential
  // must always be saved under the domain it was actually typed on.
  async function maybePromptSave(domain, u, p, extras, pendingId) {
    let existing = null
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain })
      if (result && result.success) existing = result.credentials.find(c => c.username === u)
    } catch (e) {}
    if (existing && existing.password === p && sameExtraFields(existing.extraFields, extras)) {
      // already saved, nothing changed — resolve the staged record now instead
      // of leaving it to sit until the TTL expires
      if (pendingId) { try { chrome.runtime.sendMessage({ action: 'resolvePendingSave', id: pendingId }) } catch (e) {} }
      return
    }
    showSavePrompt(domain, u, p, !!existing, extras, pendingId)
  }

  // One logical submission can trigger this three separate ways — the form's
  // own submit event, Enter in the password field (which usually ALSO fires
  // submit), and a button-click heuristic — each doing its own redundant
  // stagePendingSave + existing-credential round trip. This collapses
  // overlapping calls for the same password field into one; a genuinely later,
  // separate submission (after the first finishes) is unaffected.
  const captureInFlight = new WeakSet()

  async function captureAndPrompt(formFields) {
    const username = formFields && formFields.username
    const password = formFields && formFields.password
    if (!username && !password) return
    if (password && captureInFlight.has(password)) return
    if (password) captureInFlight.add(password)
    try {
      const u = username ? username.value : ''
      const p = password ? password.value : ''
      if (!p) return  // no password, nothing to save
      const extras = collectExtraFields(password)

      // Own id per capture (generated here, not round-tripped from background)
      // so two submissions in the same tab within the TTL window stage as two
      // independent records instead of the second overwriting the first.
      const pendingId = 'ps_' + Date.now() + '_' + Math.random().toString(36).slice(2)

      // Stage a copy in background.js BEFORE the async existing-credential lookup
      // below. A real submit can navigate away — or tear down this whole content
      // script — before that lookup's promise resolves, silently losing the save
      // prompt. The staged copy survives navigation; checkPendingSave() picks it
      // up on whatever page loads next, if this document doesn't get the chance.
      try {
        chrome.runtime.sendMessage({ action: 'stagePendingSave', id: pendingId, domain: currentDomain, username: u, password: p, extraFields: extras })
      } catch (e) {}

      await maybePromptSave(currentDomain, u, p, extras, pendingId)
    } finally {
      if (password) captureInFlight.delete(password)
    }
  }

  // Checked once per page load. If the previous page's submit got cut off by
  // navigation before it could show its own save prompt — including a redirect
  // to a different hostname, which is common for login flows (SSO, login.x.com
  // -> x.com/dashboard) — this is where that prompt actually appears, under the
  // domain the credential was originally typed on.
  async function checkPendingSave() {
    let pending
    try {
      pending = await chrome.runtime.sendMessage({ action: 'takePendingSave' })
    } catch (e) { return }
    if (!pending || !pending.found) return
    // A pending save being recovered here means a login/SSO/MFA flow is still
    // actively in progress in this tab (a real submission happened recently
    // enough that its record hasn't expired) — that counts as the person
    // being present, even though nothing on this exact page was clicked yet.
    pingActivity()
    await maybePromptSave(pending.domain, pending.username, pending.password, pending.extraFields, pending.id)
  }

  // formFields is captured once, per form, in this closure — every listener
  // here reads it directly instead of a shared mutable variable, so wiring a
  // second form later can't repoint what this form's listeners act on.
  //
  // Returns a teardown function that removes every listener this attached,
  // including the document-level click listener — which otherwise lives for
  // the lifetime of the page even after the form itself is long gone from the
  // DOM (an SPA that mounts/unmounts a login form repeatedly would otherwise
  // accumulate one such listener, and its retained closure, per mount).
  // A password field with no wrapping <form> (a custom login widget built out
  // of plain divs) has no natural boundary to scope a "nearby button" heuristic
  // to — falling back to "every button on the page belongs to this field" meant
  // that a page with two SEPARATE formless widgets would fire BOTH widgets'
  // capture on a click anywhere, since each one's listener treated the whole
  // document as its own. This walks up from the password field looking for the
  // smallest ancestor that already contains a button-like control, and uses
  // that as the pseudo-form boundary instead — the two widgets' own containers
  // are typically disjoint, so a click inside one no longer falsely belongs to
  // the other. Capped depth so a field with no reasonable container (badly
  // flattened markup) doesn't walk all the way up to <body> and lose the
  // scoping benefit entirely; that rare case still falls back to page-wide,
  // matching the old behavior, rather than refusing to work at all.
  function findFormlessContainer(field) {
    let el = field.parentElement
    let depth = 0
    while (el && el !== document.body && depth < 8) {
      if (el.querySelector('button, input[type="submit"], input[type="button"]')) return el
      el = el.parentElement
      depth++
    }
    return null
  }

  function wireSubmitCapture(formFields) {
    const password = formFields.password
    const form = password.closest('form')
    const container = form || findFormlessContainer(password)

    const submitHandler = function () { captureAndPrompt(formFields) }
    if (form) form.addEventListener('submit', submitHandler, true)

    // also capture Enter in password field and clicks on likely submit buttons
    const keydownHandler = function (e) {
      if (e.key === 'Enter') setTimeout(() => captureAndPrompt(formFields), 0)
    }
    password.addEventListener('keydown', keydownHandler)

    // button clicks near the form (submit buttons that are not type=submit in a form)
    const clickHandler = function (e) {
      const t = e.target
      if (!t) return
      const isBtn = (t.tagName === 'BUTTON') || (t.tagName === 'INPUT' && (t.type === 'submit' || t.type === 'button'))
      // Scoped to the real <form>, or the nearest formless container found
      // above — only falling all the way back to page-wide when neither
      // exists, instead of doing that for every formless widget by default.
      const belongsToThisForm = container ? container.contains(t) : true
      if (isBtn && belongsToThisForm && password.value) {
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

  // Fields already wired get their listeners attached exactly once, even though
  // init() itself may run again later (see the MutationObserver below) when a
  // form is injected into the page after the initial scan.
  const wiredPasswordFields = new WeakSet()

  function wireLoginForm(fields) {
    const { username, password } = fields
    wiredPasswordFields.add(password)
    trackedFields.add(username)
    trackedFields.add(password)

    username.setAttribute('autocomplete', 'off')
    password.setAttribute('autocomplete', 'off')

    const usernameFocusHandler = (e) => { showDropdown(username, fields); e.stopImmediatePropagation() }
    const passwordFocusHandler = (e) => { showDropdown(password, fields); e.stopImmediatePropagation() }
    username.addEventListener('focus', usernameFocusHandler, true)
    password.addEventListener('focus', passwordFocusHandler, true)
    const teardownSubmitCapture = wireSubmitCapture(fields)

    // Recorded (not just fire-and-forget listeners) so cleanupDetachedState()
    // can find and tear this down once the form is removed from the DOM —
    // see that function for why this matters.
    wiredForms.push({
      fields,
      cleanup: function () {
        username.removeEventListener('focus', usernameFocusHandler, true)
        password.removeEventListener('focus', passwordFocusHandler, true)
        teardownSubmitCapture()
        trackedFields.delete(username)
        trackedFields.delete(password)
      }
    })
  }

  // Wires every not-yet-wired login form currently on the page. Recurses so a
  // page with multiple login forms present at once (or gaining a second one
  // later) gets all of them, not just the first.
  function init() {
    const fields = detectLoginForm(wiredPasswordFields)
    if (!fields) return
    wireLoginForm(fields)
    init()
  }

  // Registered once (not per-form) — reads dropdownOwnerField, which tracks
  // whichever field the currently-open dropdown belongs to, rather than a
  // single shared "the" username field.
  document.addEventListener('click', (e) => {
    if (!dropdown) return
    if (!dropdown.host.contains(e.target) && e.target !== dropdownOwnerField) {
      hideDropdown()
    }
  })

  // Fields that arrive after the initial scan (SPA navigations, a modal injected
  // on click, content loaded behind an XHR) never went through detection at all
  // before this — both init() (login forms) and scanAndPopulatePersonalInfoFields()
  // (name/email/phone/address fields) only ran once, at load. Re-scanning on every
  // DOM mutation is wasteful, so this only acts when a plausible new <input> shows
  // up. scanAndPopulatePersonalInfoFields()/attachVaultTag() are idempotent (they
  // skip fields already tagged/filled), so re-running them on every such mutation
  // is safe, just a little redundant.
  let rescanScheduled = false
  function scheduleRescan() {
    if (rescanScheduled) return
    rescanScheduled = true
    setTimeout(() => {
      rescanScheduled = false
      cleanupDetachedState()
      init()
      scanAndPopulatePersonalInfoFields()
    }, 250)
  }

  // A form (or a personal-info field) removed from the DOM — an SPA navigating
  // away from a login step, a modal closing, a wizard moving on — otherwise
  // left every listener wireLoginForm()/attachVaultTag() attached still alive
  // indefinitely: the document-level submit-capture click listener per wired
  // form, and the window scroll/resize listeners keeping each floating vault
  // tag positioned, none of which ever got torn down on their own. On a
  // long-lived SPA page that mounts/unmounts forms repeatedly this accumulates
  // without bound. Cheap to run (small arrays, one isConnected check each), so
  // it rides along on the same debounce as the rescan above rather than
  // needing its own scheduling.
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

  // Attributes a framework commonly fills in AFTER the bare <input> is first
  // inserted (React/Vue hydration, a multi-step form library assigning name/id
  // once a step becomes active, etc). Without watching these, a field that
  // looked unclassifiable at insertion time — no name, no id, nothing — stays
  // unclassified forever, even though matchSignupFieldType()/detectLoginForm()
  // would happily recognize it once the attribute lands. 'type' is included so
  // a field that's turned into a password field after insertion (some frameworks
  // build the field generically, then set type='password' for a password step)
  // is picked up by detectLoginForm() too, not just the personal-info scan.
  const WATCHED_DYNAMIC_ATTRS = ['name', 'id', 'autocomplete', 'aria-label', 'placeholder', 'type']

  // textarea/select included alongside input now that personal-info discovery
  // covers them too (see scanAndPopulatePersonalInfoFields).
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
      // Removed nodes matter too now — that's what lets cleanupDetachedState()
      // above actually run promptly instead of only whenever something else
      // happens to add a new input later.
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== 1) continue
        if (node.matches && node.matches(DISCOVERABLE_FIELDS_SELECTOR)) { scheduleRescan(); return }
        if (node.querySelector && node.querySelector(DISCOVERABLE_FIELDS_SELECTOR)) { scheduleRescan(); return }
      }
    }
  })
  formObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: WATCHED_DYNAMIC_ATTRS
  })

  // Same-document SPA navigations (pushState/replaceState, or back/forward via
  // popstate) never reload this content script, so checkPendingSave() would
  // otherwise only ever run once, at the very first load. history is the same
  // underlying object the page's own scripts see (isolated worlds still share
  // window/DOM), so wrapping it here also catches the page's own router calls.
  // Debounced together with a rescan, since a router may fire several history
  // calls back-to-back for one logical navigation.
  let routeChangeScheduled = false
  function scheduleRouteChange() {
    if (routeChangeScheduled) return
    routeChangeScheduled = true
    setTimeout(() => {
      routeChangeScheduled = false
      init()
      scanAndPopulatePersonalInfoFields()
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

  // Fallback for fields the exact selectors above miss — id="firstName-field",
  // name="first_name_input", aria-label="First name", etc. Each keyword is
  // matched as a whole word/phrase against a normalized signal string (never a
  // raw substring), so "state" doesn't match inside "statement" and "address"
  // doesn't match inside "email address" ahead of the email check.
  // Multi-word phrases and unambiguous compound/abbreviated forms — safe to
  // match against ANY signal, including free-text prose (labels, placeholders,
  // aria-labels), since they're specific enough that incidental collisions are
  // very unlikely.
  const SIGNUP_FIELD_KEYWORDS = {
    firstName: ['first name', 'given name', 'firstname', 'fname'],
    lastName: ['last name', 'family name', 'surname', 'lastname', 'lname'],
    email: ['email', 'e mail', 'email address'],
    phone: ['phone', 'phone number', 'mobile', 'mobile number', 'cell phone', 'telephone'],
    'address.street': ['street address', 'address line 1', 'address line1', 'mailing address'],
    'address.zip': ['zip code', 'postal code', 'postcode']
  }

  // Bare, generic single words — "state", "city", "country", "street", "zip",
  // "town". These are common enough in ordinary prose ("please state your
  // reason", "which city do you support?") that trusting them against free-text
  // label/placeholder/aria-label content risks real false positives. Only
  // matched against structured, developer-authored identifiers (name/id/
  // autocomplete), where a bare "state" or "city" is far more likely to
  // actually mean what it says.
  const SIGNUP_FIELD_KEYWORDS_STRUCTURED_ONLY = {
    'address.street': ['street'],
    'address.city': ['city', 'town'],
    'address.state': ['state', 'province'],
    'address.zip': ['zip'],
    'address.country': ['country']
  }

  // Whole-word/phrase containment: pads both sides with spaces so a match can
  // only land on a real word boundary, not a substring buried inside a longer
  // word (e.g. "state" must not match "statement").
  function normalizedIncludesPhrase(normalized, phrase) {
    return (' ' + normalized + ' ').indexOf(' ' + phrase + ' ') !== -1
  }

  // Structured, developer-authored identifiers — trustworthy enough for even
  // generic single-word keywords.
  function fieldStructuredSignalStrings(el) {
    const out = []
    if (el.name) out.push(el.name)
    if (el.id) out.push(el.id)
    const autocomplete = el.getAttribute('autocomplete')
    if (autocomplete) out.push(autocomplete)
    return out
  }

  // Free-text, human-facing strings — safe only for specific multi-word phrases.
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

  const filledSignupFields = new WeakSet()

  function matchSignupFieldType(el) {
    // The login form's own username/password fields are owned by the login-detection
    // path (detectLoginForm/isTrackedField), never the signup/personal-info one — a
    // field otherwise matching e.g. the email pattern shouldn't also grow a "fill
    // from profile" tag while it's actively serving as the login username.
    if (isTrackedField(el)) return null
    for (const fieldType in SIGNUP_FIELD_MAP) {
      if (fieldMatchesSelectors(el, SIGNUP_FIELD_MAP[fieldType])) return fieldType
    }
    return matchSignupFieldTypeByKeywords(el)
  }

  // Fingerprint/WebAuthn cannot be triggered from here: the credential is bound to
  // the extension's own origin (chrome-extension://...), and a content script runs
  // in the page's origin (e.g. tubitv.com) — a fingerprint attempt made from an
  // arbitrary website would always fail against the wrong origin. Password auth has
  // no such restriction, but still can't run its crypto here: a content script's
  // storage is scoped to the page's own origin, not the extension's, so the actual
  // unwrap runs in background.js, which has the correct access to the real vault.
  // This function only collects the password and hands it off.
  async function unlockInline() {
    const pw = window.prompt('Vault is locked. Enter your password to unlock:')
    if (!pw) return false
    const result = await chrome.runtime.sendMessage({ action: 'authenticateWithPassword', password: pw })
    if (result && result.success) pingActivity()
    return !!(result && result.success)
  }

  async function fillPersonalInfoField(el, fieldType) {
    const response = await chrome.runtime.sendMessage({ action: 'getPersonalInfoField', fieldType })
    if (response && response.success && response.value) {
      el.setAttribute('autocomplete', 'off')
      // A <select> (state/country dropdowns are the common case) only counts
      // as filled if one of its actual options matched — see setSelectValue.
      const filled = el.tagName === 'SELECT' ? setSelectValue(el, response.value) : (setNativeValue(el, response.value), true)
      if (!filled) return false
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      filledSignupFields.add(el)
      return true
    }
    return false
  }

  // Only used from a deliberate click (the tag, the email picker), never from the
  // passive page-load scan — an unlock prompt should never appear unprompted just
  // because a site happened to load with a matching field.
  async function fillPersonalInfoFieldWithUnlock(el, fieldType) {
    const response = await chrome.runtime.sendMessage({ action: 'getPersonalInfoField', fieldType })
    if (response && response.success && response.value) {
      el.setAttribute('autocomplete', 'off')
      const filled = el.tagName === 'SELECT' ? setSelectValue(el, response.value) : (setNativeValue(el, response.value), true)
      if (filled) {
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        filledSignupFields.add(el)
        return true
      }
      return false
    }
    if (response && response.locked) {
      const unlocked = await unlockInline()
      if (unlocked) return fillPersonalInfoField(el, fieldType)
    }
    return false
  }

  function createVaultTag() {
    const tag = document.createElement('div')
    tag.textContent = 'V'
    tag.style.fontWeight = '800'
    tag.title = 'Fill with Valid Vault'
    tag.style.cssText = `
      position: absolute;
      z-index: 2147483646;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #00d4aa;
      color: #05140a;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      border: 1px solid #00b294;
    `
    document.body.appendChild(tag)
    return tag
  }

  function positionVaultTag(tag, el) {
    const rect = el.getBoundingClientRect()
    const size = 22
    const top = rect.top + window.scrollY + (rect.height - size) / 2
    const left = rect.right + window.scrollX - size - 6
    tag.style.top = top + 'px'
    tag.style.left = left + 'px'
  }

  const fieldTags = new WeakMap()
  // Parallel array (not just the WeakMap above) so cleanupDetachedState() can
  // actually enumerate tagged fields — a WeakMap can't be iterated. Without
  // this, a personal-info field removed from the DOM (an SPA step navigated
  // away from) leaves its floating "V" tag icon on screen forever, along with
  // the window scroll/resize listeners keeping it positioned — both outlive
  // the field indefinitely since nothing ever calls removeEventListener or
  // removes the tag element.
  const taggedFieldRecords = []

  function attachVaultTag(el, fieldType) {
    if (fieldTags.has(el)) { positionVaultTag(fieldTags.get(el), el); return }
    if (!el.isConnected) return
    const tag = createVaultTag()
    positionVaultTag(tag, el)
    tag.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      pingActivity()
      if (fieldType === 'email') {
        showEmailPicker(el)
      } else {
        fillPersonalInfoFieldWithUnlock(el, fieldType)
      }
    }
    const scrollHandler = () => positionVaultTag(tag, el)
    const resizeHandler = () => positionVaultTag(tag, el)
    window.addEventListener('scroll', scrollHandler, true)
    window.addEventListener('resize', resizeHandler)
    fieldTags.set(el, tag)
    taggedFieldRecords.push({ el, tag, scrollHandler, resizeHandler })
  }

  let emailPicker = null

  function createEmailPicker() {
    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;z-index:2147483647;display:none;'
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'closed' })
    shadow.innerHTML = `
      <style>
        .dropdown { position:absolute; background:#1a1a1a; border:1px solid #333; border-radius:8px;
          box-shadow:0 4px 12px rgba(0,0,0,0.5); min-width:220px; max-width:340px; overflow:hidden;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
        .header { padding:10px 14px; background:#0a0a0a; color:#00d4aa; font-size:12px; font-weight:500; border-bottom:1px solid #333; }
        .item { padding:10px 14px; cursor:pointer; border-bottom:1px solid #2a2a2a; color:#e0e0e0; font-size:13px; word-break:break-all; }
        .item:hover { background:#2a2a2a; }
        .item:last-child { border-bottom:none; }
      </style>
      <div class="dropdown">
        <div class="header">Choose an email</div>
        <div id="items"></div>
      </div>
    `
    return { host, shadow }
  }

  async function showEmailPicker(field) {
    if (!emailPicker) emailPicker = createEmailPicker()
    const rect = field.getBoundingClientRect()
    emailPicker.host.style.left = rect.left + window.scrollX + 'px'
    emailPicker.host.style.top = rect.bottom + window.scrollY + 2 + 'px'
    emailPicker.host.style.display = 'block'

    let response = await chrome.runtime.sendMessage({ action: 'getPersonalInfoAllEmails' })
    if (response && response.locked) {
      const unlocked = await unlockInline()
      if (unlocked) response = await chrome.runtime.sendMessage({ action: 'getPersonalInfoAllEmails' })
    }
    const itemsContainer = emailPicker.shadow.getElementById('items')
    itemsContainer.innerHTML = ''

    if (response && response.success && response.emails.length > 0) {
      response.emails.forEach((email) => {
        const item = document.createElement('div')
        item.className = 'item'
        item.textContent = email
        item.onclick = () => {
          pingActivity()
          field.setAttribute('autocomplete', 'off')
          setNativeValue(field, email)
          field.dispatchEvent(new Event('input', { bubbles: true }))
          field.dispatchEvent(new Event('change', { bubbles: true }))
          filledSignupFields.add(field)
          emailPicker.host.style.display = 'none'
        }
        itemsContainer.appendChild(item)
      })
    } else {
      itemsContainer.innerHTML = '<div class="item">No saved emails</div>'
    }
  }

  document.addEventListener('click', (e) => {
    if (emailPicker && emailPicker.host.style.display !== 'none') {
      if (!emailPicker.host.contains(e.target)) emailPicker.host.style.display = 'none'
    }
  })

  async function trySignupAutofill(el) {
    if (el.type === 'password') return
    if (filledSignupFields.has(el)) return
    const fieldType = matchSignupFieldType(el)
    if (!fieldType) return
    attachVaultTag(el, fieldType)
    if (el.value) return
    // Email can have multiple saved addresses — leave it to the tag/picker so the
    // user chooses, rather than silently filling in whichever is ranked first.
    if (fieldType === 'email') return
    await fillPersonalInfoField(el, fieldType)
  }

  // Personal-info fields aren't always plain <input>s — a state/country picker
  // is very often a <select>, and a "notes"/address-line-2 style field is
  // sometimes a <textarea>. Both expose the same name/id/autocomplete/label
  // signals matchSignupFieldType() already reads, so no separate classifier
  // is needed — only the discovery selectors below needed widening. Custom
  // comboboxes (a div-based dropdown) and contenteditable fields have no such
  // standard signal to key off of and are deliberately still out of scope.
  document.addEventListener('focus', (e) => {
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) trySignupAutofill(t)
  }, true)

  async function scanAndPopulatePersonalInfoFields() {
    const fields = document.querySelectorAll('input, textarea, select')
    for (let i = 0; i < fields.length; i++) {
      const el = fields[i]
      if (el.tagName === 'INPUT' && (el.type === 'password' || el.type === 'hidden')) continue
      if (el.offsetParent === null) continue
      const fieldType = matchSignupFieldType(el)
      if (!fieldType) continue
      attachVaultTag(el, fieldType)
      if (!el.value && fieldType !== 'email') await fillPersonalInfoField(el, fieldType)
    }
  }

  // init() must run first: it populates trackedFields, which matchSignupFieldType
  // (via isTrackedField) relies on to keep every wired login form's own fields
  // out of the signup/personal-info scan below.
  function bootstrap() {
    init()
    scanAndPopulatePersonalInfoFields()
    checkPendingSave()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap)
  } else {
    bootstrap()
  }
})()