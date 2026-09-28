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
  input.type = field.secret ? 'password' : 'text'
  input.autocomplete = 'off'
  input.spellcheck = false
  input.setAttribute('autocapitalize', 'off')
  if (field.placeholder) input.placeholder = field.placeholder
  if (field.value) input.value = field.value
  row.appendChild(input)
  if (field.secret) {
    const eye = actionButton('Show', 'secondary vv-eye', () => {
      const hidden = input.type === 'password'
      input.type = hidden ? 'text' : 'password'
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
    const finish = (value) => {
      overlay.remove()
      document.removeEventListener('keydown', onKey, true)
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
      if (e.key === 'Escape' && !busy) { e.preventDefault(); finish(null) }
      if (e.key === 'Enter' && !busy) { e.preventDefault(); submit() }
    }
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

async function askSecret(title, label, text) {
  const values = await formDialog({ title, text, fields: [{ label, secret: true }], okLabel: 'Continue' })
  if (!values || !values[0]) return null
  return values[0]
}

export { formDialog, askSecret }
