(() => {
  if (window.localVaultInjected) return
  window.localVaultInjected = true

  let currentDomain = window.location.hostname
  let usernameField = null
  let passwordField = null
  let dropdown = null

  function detectLoginForm() {
    const pwFields = document.querySelectorAll('input[type="password"]')
    if (pwFields.length === 0) return null

    for (const pwField of pwFields) {
      const form = pwField.closest('form') || document
      const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]')
      
      for (const input of inputs) {
        if (input.offsetParent !== null) {
          return { username: input, password: pwField }
        }
      }
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

  async function showDropdown(field) {
    if (!dropdown) dropdown = createDropdown()

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
        item.onclick = () => fillCredentials(cred)
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

  function fillCredentials(cred) {
    if (usernameField) usernameField.value = cred.username
    if (passwordField) passwordField.value = cred.password
    if (cred.extraFields && cred.extraFields.length) {
      const form = (passwordField && passwordField.closest('form')) || document
      const candidates = form.querySelectorAll('input')
      for (const el of candidates) {
        if (isTrackedField(el)) continue
        if (el.type === 'password' || el.type === 'hidden' || el.value) continue
        const match = cred.extraFields.find((f) => f.label === getFieldLabel(el))
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
    return el === usernameField || el === passwordField
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

  function collectExtraFields() {
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
    const byLabel = new Map(a.map((f) => [f.label, f.value]))
    for (const f of b) {
      if (byLabel.get(f.label) !== f.value) return false
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

  async function captureAndPrompt() {
    if (!usernameField && !passwordField) return
    const u = usernameField ? usernameField.value : ''
    const p = passwordField ? passwordField.value : ''
    if (!p) return  // no password, nothing to save
    const extras = collectExtraFields()
    let existing = null
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain: currentDomain })
      if (result && result.success) existing = result.credentials.find(c => c.username === u)
    } catch (e) {}
    if (existing && existing.password === p && sameExtraFields(existing.extraFields, extras)) return  // already saved, nothing changed
    showSavePrompt(currentDomain, u, p, !!existing, extras)
  }

  function wireSubmitCapture() {
    if (!passwordField) return
    const form = passwordField.closest('form')
    if (form) {
      form.addEventListener('submit', function () { captureAndPrompt() }, true)
    }
    // also capture Enter in password field and clicks on likely submit buttons
    passwordField.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') setTimeout(captureAndPrompt, 0)
    })
    // button clicks near the form (submit buttons that are not type=submit in a form)
    document.addEventListener('click', function (e) {
      const t = e.target
      if (!t) return
      const isBtn = (t.tagName === 'BUTTON') || (t.tagName === 'INPUT' && (t.type === 'submit' || t.type === 'button'))
      if (isBtn && passwordField && passwordField.value) {
        setTimeout(captureAndPrompt, 50)
      }
    }, true)
  }

  function init() {
    const fields = detectLoginForm()
    if (!fields) return

    usernameField = fields.username
    passwordField = fields.password

    usernameField.setAttribute('autocomplete', 'off')
    passwordField.setAttribute('autocomplete', 'off')

    usernameField.addEventListener('focus', (e) => { showDropdown(usernameField); e.stopImmediatePropagation() }, true)
    passwordField.addEventListener('focus', (e) => { showDropdown(passwordField); e.stopImmediatePropagation() }, true)
    wireSubmitCapture()

    document.addEventListener('click', (e) => {
      if (!dropdown) return
      if (!dropdown.host.contains(e.target) && e.target !== usernameField) {
        hideDropdown()
      }
    })
  }


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

  const filledSignupFields = new WeakSet()

  function matchSignupFieldType(el) {
    for (const fieldType in SIGNUP_FIELD_MAP) {
      const selectors = SIGNUP_FIELD_MAP[fieldType]
      for (let i = 0; i < selectors.length; i++) {
        if (el.matches(selectors[i])) return fieldType
      }
    }
    return null
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanAndPopulatePersonalInfoFields)
  } else {
    scanAndPopulatePersonalInfoFields()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()