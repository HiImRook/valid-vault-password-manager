const OPEN_DIALOGS = new Set()
const MASK_WITH_STYLE = (() => {
  try { return location.protocol === 'chrome-extension:' } catch (e) { return false }
})()

function setMasked(input, masked) {
  if (MASK_WITH_STYLE) {
    input.type = 'text'
    input.style.webkitTextSecurity = masked ? 'disc' : 'none'
    input.dataset.masked = masked ? 'yes' : 'no'
  } else {
    input.type = masked ? 'password' : 'text'
  }
}

function isMasked(input) {
  return MASK_WITH_STYLE ? input.dataset.masked === 'yes' : input.type === 'password'
}

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function actionButton(label, className, handler) {
  const b = el('button', className, label)
  b.type = 'button'
  b.onclick = (e) => {
    e.stopPropagation()
    handler()
  }
  return b
}

function buildField(field, index) {
  const wrap = el('div', 'vv-field')
  if (field.label) {
    const label = el('label', 'vv-field-label', field.label)
    label.htmlFor = 'vv-field-' + index
    wrap.appendChild(label)
  }
  const row = el('div', 'vv-field-row')
  if (field.options) {
    const select = el('select', 'vv-field-input vv-field-select')
    select.id = 'vv-field-' + index
    field.options.forEach((option) => {
      const opt = el('option', '', option.label)
      opt.value = String(option.value)
      select.appendChild(opt)
    })
    if (field.value !== undefined) select.value = String(field.value)
    row.appendChild(select)
    wrap.appendChild(row)
    if (field.hint) wrap.appendChild(el('div', 'vv-field-hint', field.hint))
    return { wrap, input: select }
  }
  const input = el('input', 'vv-field-input')
  input.id = 'vv-field-' + index
  setMasked(input, !!field.secret)
  input.autocomplete = 'off'
  if (field.secret) {
    for (const name of ['copy', 'cut', 'dragstart']) input.addEventListener(name, (e) => { if (isMasked(input)) e.preventDefault() })
    input.setAttribute('data-1p-ignore', 'true')
    input.setAttribute('data-lpignore', 'true')
    input.setAttribute('data-bwignore', 'true')
    input.setAttribute('autocorrect', 'off')
  }
  input.spellcheck = false
  input.setAttribute('autocapitalize', 'off')
  if (field.placeholder) input.placeholder = field.placeholder
  if (field.value) input.value = field.value
  if (field.readonly) input.readOnly = true
  row.appendChild(input)
  const actions = field.actions || (field.action ? [field.action] : [])
  for (const action of actions) {
    const extra = actionButton(action.label, 'secondary vv-eye', () => {
      action.onClick(input)
      input.focus()
    })
    extra.tabIndex = -1
    row.appendChild(extra)
  }
  if (field.secret) {
    const eye = actionButton('Show', 'secondary vv-eye', () => {
      const hidden = isMasked(input)
      setMasked(input, !hidden)
      eye.textContent = hidden ? 'Hide' : 'Show'
      input.focus()
    })
    eye.tabIndex = -1
    row.appendChild(eye)
  }
  wrap.appendChild(row)
  if (field.hint) wrap.appendChild(el('div', 'vv-field-hint', field.hint))
  return { wrap, input }
}

function formDialog(options) {
  return new Promise((resolve) => {
    const overlay = el('div', 'wv-dialog-overlay')
    const box = el('div', 'wv-dialog vv-form')
    box.appendChild(el('div', 'wv-dialog-title', options.title))
    if (options.text) box.appendChild(el('p', 'wv-dialog-text', options.text))
    const inputs = (options.fields || []).map((field, i) => {
      const built = buildField(field, i)
      box.appendChild(built.wrap)
      return built.input
    })
    const error = el('div', 'vv-form-error')
    box.appendChild(error)
    const row = el('div', 'wv-dialog-actions')
    let busy = false
    const entry = { overlay, onKey: null, cancel: null }
    const detach = () => {
      overlay.remove()
      document.removeEventListener('keydown', entry.onKey, true)
      OPEN_DIALOGS.delete(entry)
    }
    const finish = (value) => {
      detach()
      resolve(value)
    }
    const submit = async () => {
      if (busy) return
      const values = inputs.map((input) => input.value)
      error.textContent = ''
      if (options.validate) {
        busy = true
        okButton.disabled = true
        okButton.textContent = options.busyLabel || 'Checking...'
        let result = null
        try { result = await options.validate(values) } catch (e) { result = { error: e && e.message ? e.message : String(e) } }
        if (!overlay.isConnected) return
        busy = false
        okButton.disabled = false
        okButton.textContent = options.okLabel || 'Continue'
        if (result && result.error) {
          error.textContent = result.error
          if (inputs[result.focus || 0]) inputs[result.focus || 0].focus()
          return
        }
        finish(result && result.value !== undefined ? result.value : values)
        return
      }
      finish(values)
    }
    const onKey = (e) => {
      if (!overlay.isConnected) { detach(); return }
      if (e.key === 'Escape' && !busy) { e.preventDefault(); finish(null) }
      if (e.key === 'Enter' && !busy) { e.preventDefault(); submit() }
    }
    entry.onKey = onKey
    entry.cancel = () => finish(null)
    OPEN_DIALOGS.add(entry)
    row.appendChild(actionButton(options.cancelLabel || 'Cancel', 'secondary', () => { if (!busy) finish(null) }))
    const okButton = actionButton(options.okLabel || 'Continue', options.danger ? 'danger' : '', submit)
    row.appendChild(okButton)
    box.appendChild(row)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    document.addEventListener('keydown', onKey, true)
    if (inputs[0]) inputs[0].focus()
    else okButton.focus()
  })
}

function choiceDialog(options) {
  return new Promise((resolve) => {
    const overlay = el('div', 'wv-dialog-overlay')
    const box = el('div', 'wv-dialog vv-form')
    box.appendChild(el('div', 'wv-dialog-title', options.title))
    if (options.text) {
      for (const paragraph of String(options.text).split('\n\n')) box.appendChild(el('p', 'wv-dialog-text', paragraph))
    }
    (options.fields || []).forEach((field, i) => {
      box.appendChild(buildField(Object.assign({ readonly: true }, field), 'c' + i).wrap)
    })
    const row = el('div', 'wv-dialog-actions')
    const entry = { overlay, onKey: null, cancel: null }
    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      overlay.remove()
      document.removeEventListener('keydown', entry.onKey, true)
      OPEN_DIALOGS.delete(entry)
      resolve(value)
    }
    entry.onKey = (e) => {
      if (!overlay.isConnected) { finish(null); return }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (options.escape !== false) finish(null)
      }
    }
    entry.cancel = () => finish(null)
    OPEN_DIALOGS.add(entry)
    if (options.cancelLabel) row.appendChild(actionButton(options.cancelLabel, 'secondary', () => finish(null)))
    const buttons = (options.choices || []).map((choice) => {
      const b = actionButton(choice.label, choice.className || '', () => finish(choice.value))
      row.appendChild(b)
      return b
    })
    box.appendChild(row)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    document.addEventListener('keydown', entry.onKey, true)
    if (options.neutralFocus) {
      box.tabIndex = -1
      box.focus()
    } else if (buttons.length) buttons[buttons.length - 1].focus()
  })
}

function closeAllDialogs() {
  for (const entry of Array.from(OPEN_DIALOGS)) {
    if (entry.cancel) { entry.cancel(); continue }
    entry.overlay.remove()
    document.removeEventListener('keydown', entry.onKey, true)
    OPEN_DIALOGS.delete(entry)
  }
}

async function confirmDialog(options) {
  const values = await formDialog({ title: options.title, text: options.text, okLabel: options.okLabel || 'Continue', cancelLabel: options.cancelLabel, danger: !!options.danger })
  return values !== null
}

async function askSecret(title, label, text) {
  const values = await formDialog({ title, text, fields: [{ label, secret: true }], okLabel: 'Continue' })
  if (!values || !values[0]) return null
  return values[0]
}

export { formDialog, confirmDialog, askSecret, choiceDialog, closeAllDialogs }
