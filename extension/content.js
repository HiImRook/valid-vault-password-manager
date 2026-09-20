(() => {
  if (window.localVaultInjected) return
  window.localVaultInjected = true

  // background.js's inactivity timer only resets on an explicit 'activity' message.
  // Without this, actively using autofill on a page doesn't count as activity, and
  // the vault can lock mid-use even while the person is right there working with it.
  function pingActivity() {
    try { chrome.runtime.sendMessage({ action: 'activity' }) } catch (e) {}
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
      username.value = cred.username
      username.dispatchEvent(new Event('input', { bubbles: true }))
      username.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (password) {
      password.value = cred.password
      password.dispatchEvent(new Event('input', { bubbles: true }))
      password.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (cred.extraFields && cred.extraFields.length) {
      const form = (password && password.closest('form')) || document
      const candidates = form.querySelectorAll('input')
      for (const el of candidates) {
        if (isTrackedField(el)) continue
        if (el.type === 'password' || el.type === 'hidden' || el.value) continue
        const match = cred.extraFields.find((f) => normalizeLabel(f.label) === normalizeLabel(getFieldLabel(el)))
        if (match) {
          el.value = match.value
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
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
    const inputs = form.querySelectorAll('input')
    const extras = []
    for (const el of inputs) {
      if (['password', 'hidden', 'submit', 'button', 'checkbox', 'radio'].indexOf(el.type) !== -1) continue
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

  function showSavePrompt(domain, username, password, isUpdate, extraFields) {
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
    savePrompt.host.style.display = 'block'
    const close = () => { savePrompt.host.style.display = 'none' }
    savePrompt.shadow.getElementById('sp-cancel').onclick = close
    savePrompt.shadow.getElementById('sp-save').onclick = async () => {
      pingActivity()
      const msgEl = savePrompt.shadow.getElementById('sp-msg')
      const result = await chrome.runtime.sendMessage({ action: 'saveCredential', domain, username, password, extraFields })
      if (result && result.locked) {
        if (msgEl) msgEl.textContent = 'Vault is locked. Click the Valid Vault icon to unlock, then click Save again.'
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
  async function maybePromptSave(domain, u, p, extras) {
    let existing = null
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain })
      if (result && result.success) existing = result.credentials.find(c => c.username === u)
    } catch (e) {}
    if (existing && existing.password === p && sameExtraFields(existing.extraFields, extras)) return  // already saved, nothing changed
    showSavePrompt(domain, u, p, !!existing, extras)
  }

  async function captureAndPrompt(formFields) {
    const username = formFields && formFields.username
    const password = formFields && formFields.password
    if (!username && !password) return
    const u = username ? username.value : ''
    const p = password ? password.value : ''
    if (!p) return  // no password, nothing to save
    const extras = collectExtraFields(password)

    // Stage a copy in background.js BEFORE the async existing-credential lookup
    // below. A real submit can navigate away — or tear down this whole content
    // script — before that lookup's promise resolves, silently losing the save
    // prompt. The staged copy survives navigation; checkPendingSave() picks it
    // up on whatever page loads next, if this document doesn't get the chance.
    try {
      chrome.runtime.sendMessage({ action: 'stagePendingSave', domain: currentDomain, username: u, password: p, extraFields: extras })
    } catch (e) {}

    await maybePromptSave(currentDomain, u, p, extras)
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
    await maybePromptSave(pending.domain, pending.username, pending.password, pending.extraFields)
  }

  // formFields is captured once, per form, in this closure — every listener
  // here reads it directly instead of a shared mutable variable, so wiring a
  // second form later can't repoint what this form's listeners act on.
  function wireSubmitCapture(formFields) {
    const password = formFields.password
    const form = password.closest('form')
    if (form) {
      form.addEventListener('submit', function () { captureAndPrompt(formFields) }, true)
    }
    // also capture Enter in password field and clicks on likely submit buttons
    password.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') setTimeout(() => captureAndPrompt(formFields), 0)
    })
    // button clicks near the form (submit buttons that are not type=submit in a form)
    document.addEventListener('click', function (e) {
      const t = e.target
      if (!t) return
      const isBtn = (t.tagName === 'BUTTON') || (t.tagName === 'INPUT' && (t.type === 'submit' || t.type === 'button'))
      // If this form has a real <form> element, only react to a button that's
      // actually inside it — otherwise every wired form's listener would fire
      // on every button click on the page, not just its own.
      const belongsToThisForm = form ? form.contains(t) : true
      if (isBtn && belongsToThisForm && password.value) {
        setTimeout(() => captureAndPrompt(formFields), 50)
      }
    }, true)
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
    wiredForms.push(fields)

    username.setAttribute('autocomplete', 'off')
    password.setAttribute('autocomplete', 'off')

    username.addEventListener('focus', (e) => { showDropdown(username, fields); e.stopImmediatePropagation() }, true)
    password.addEventListener('focus', (e) => { showDropdown(password, fields); e.stopImmediatePropagation() }, true)
    wireSubmitCapture(fields)
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
      init()
      scanAndPopulatePersonalInfoFields()
    }, 250)
  }

  const formObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue
        if (node.matches && node.matches('input')) { scheduleRescan(); return }
        if (node.querySelector && node.querySelector('input')) { scheduleRescan(); return }
      }
    }
  })
  formObserver.observe(document.documentElement, { childList: true, subtree: true })


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
  const SIGNUP_FIELD_KEYWORDS = {
    firstName: ['first name', 'given name', 'firstname', 'fname'],
    lastName: ['last name', 'family name', 'surname', 'lastname', 'lname'],
    email: ['email', 'e mail', 'email address'],
    phone: ['phone', 'phone number', 'mobile', 'mobile number', 'cell phone', 'telephone'],
    'address.street': ['street address', 'address line 1', 'address line1', 'mailing address', 'street'],
    'address.city': ['city', 'town'],
    'address.state': ['state', 'province'],
    'address.zip': ['zip code', 'zip', 'postal code', 'postcode'],
    'address.country': ['country']
  }

  // Whole-word/phrase containment: pads both sides with spaces so a match can
  // only land on a real word boundary, not a substring buried inside a longer
  // word (e.g. "state" must not match "statement").
  function normalizedIncludesPhrase(normalized, phrase) {
    return (' ' + normalized + ' ').indexOf(' ' + phrase + ' ') !== -1
  }

  // Every raw signal a field carries that a person (or the reviewer flagging
  // this gap) would recognize the field by — not just the single "best" one
  // getFieldLabel picks for display, but all of them, since a fallback match
  // only needs ONE to hit.
  function fieldSignalStrings(el) {
    const out = []
    if (el.name) out.push(el.name)
    if (el.id) out.push(el.id)
    const ariaLabel = el.getAttribute('aria-label')
    if (ariaLabel) out.push(ariaLabel)
    if (el.placeholder) out.push(el.placeholder)
    if (el.labels && el.labels.length) {
      for (const l of el.labels) if (l.textContent) out.push(l.textContent)
    }
    return out
  }

  function matchSignupFieldTypeByKeywords(el) {
    const signals = fieldSignalStrings(el).map(normalizeLabel)
    for (const fieldType in SIGNUP_FIELD_KEYWORDS) {
      const keywords = SIGNUP_FIELD_KEYWORDS[fieldType]
      for (const signal of signals) {
        for (const keyword of keywords) {
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
      el.value = response.value
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
      el.value = response.value
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      filledSignupFields.add(el)
      return true
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
    fieldTags.set(el, tag)
    window.addEventListener('scroll', () => positionVaultTag(tag, el), true)
    window.addEventListener('resize', () => positionVaultTag(tag, el))
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
          field.value = email
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

  document.addEventListener('focus', (e) => {
    if (e.target && e.target.tagName === 'INPUT') trySignupAutofill(e.target)
  }, true)

  async function scanAndPopulatePersonalInfoFields() {
    const inputs = document.querySelectorAll('input')
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i]
      if (el.type === 'password' || el.type === 'hidden') continue
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