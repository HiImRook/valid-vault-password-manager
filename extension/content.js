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
    hideDropdown()
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
        .user { color:#b8f0c4; font-size:13px; margin:8px 0 16px; word-break:break-all; }
        .row { display:flex; gap:10px; }
        button { flex:1; padding:11px; border-radius:6px; border:none; font-size:13px; font-weight:700; cursor:pointer; }
        .save { background:#33ff66; color:#05140a; }
        .cancel { background:transparent; color:#33ff66; border:1px solid #1f9e40; font-weight:400; }
      </style>
      <div class="backdrop" id="backdrop">
        <div class="card">
          <div class="title">Save to Valid Vault?</div>
          <div class="sub" id="sp-domain"></div>
          <div class="user" id="sp-user"></div>
          <div class="row">
            <button class="save" id="sp-save">Save</button>
            <button class="cancel" id="sp-cancel">Not now</button>
          </div>
        </div>
      </div>
    `
    return { host, shadow }
  }

  function showSavePrompt(domain, username, password) {
    if (!savePrompt) savePrompt = createSavePrompt()
    savePrompt.shadow.getElementById('sp-domain').textContent = domain
    savePrompt.shadow.getElementById('sp-user').textContent = username || '(no username)'
    savePrompt.host.style.display = 'block'
    const close = () => { savePrompt.host.style.display = 'none' }
    savePrompt.shadow.getElementById('sp-cancel').onclick = close
    savePrompt.shadow.getElementById('sp-save').onclick = async () => {
      await chrome.runtime.sendMessage({ action: 'saveCredential', domain, username, password })
      close()
    }
    savePrompt.shadow.getElementById('backdrop').onclick = (e) => {
      if (e.target === savePrompt.shadow.getElementById('backdrop')) close()
    }
  }

  function captureAndPrompt() {
    if (!usernameField && !passwordField) return
    const u = usernameField ? usernameField.value : ''
    const p = passwordField ? passwordField.value : ''
    if (!p) return  // no password, nothing to save
    showSavePrompt(currentDomain, u, p)
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

    usernameField.addEventListener('focus', () => showDropdown(usernameField))
    passwordField.addEventListener('focus', () => showDropdown(passwordField))
    wireSubmitCapture()

    document.addEventListener('click', (e) => {
      if (!dropdown) return
      if (!dropdown.host.contains(e.target) && e.target !== usernameField) {
        hideDropdown()
      }
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()