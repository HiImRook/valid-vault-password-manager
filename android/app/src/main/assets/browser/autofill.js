(function () {
  if (window.top !== window || window.__vvAutofill) return
  const BRIDGE = window.vvAutofill
  if (!BRIDGE || typeof BRIDGE.postMessage !== 'function') return
  Object.defineProperty(window, '__vvAutofill', { value: true })

  const TAG = 28
  const MIN_TAG = 18
  const GAP = 6
  const SCAN_MS = 350
  const SAVE_REPEAT_MS = 4000
  const USER_HINT = /user|login|signin|sign_in|identifier|account/i
  const TEXT_TYPES = new Set(['', 'text', 'email', 'tel'])
  const SUBMIT_HINT = /log\s*in|sign\s*in|sign\s*on|sign\s*up|submit|continue|next|register|create|save|change|update|reset|confirm|verify|enter/i
  const SKIP_HINT = /show|hide|reveal|toggle|eye|visib|cancel|back|forgot|close/i
  const BUTTONS = 'button, input[type="submit" i], input[type="image" i], input[type="button" i], [role="button"]'
  const tags = new Map()
  const hosts = new WeakSet()
  let scanTimer = 0
  let frame = 0
  let lastSave = ''
  let lastSaveAt = 0

  function typeOf(input) {
    return (input.getAttribute('type') || '').toLowerCase()
  }

  function isPassword(input) {
    return typeOf(input) === 'password'
  }

  function isText(input) {
    return TEXT_TYPES.has(typeOf(input))
  }

  function shown(input) {
    if (!input.isConnected) return false
    const r = input.getBoundingClientRect()
    if (r.width < 24 || r.height < 12) return false
    const s = getComputedStyle(input)
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
  }

  function inputsIn(scope) {
    return Array.from(scope.querySelectorAll('input')).filter((i) => !i.disabled && shown(i))
  }

  function nextIsPassword(input) {
    const list = inputsIn(input.form || document)
    const at = list.indexOf(input)
    return at >= 0 && at + 1 < list.length && isPassword(list[at + 1])
  }

  function isUser(input) {
    if (!isText(input)) return false
    const auto = (input.getAttribute('autocomplete') || '').toLowerCase()
    if (auto.includes('username')) return true
    if (nextIsPassword(input)) return true
    const hint = [input.name, input.id, input.getAttribute('placeholder'), input.getAttribute('aria-label')].join(' ')
    return USER_HINT.test(hint)
  }

  function makeTag() {
    const host = document.createElement('div')
    host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483647!important;width:' + TAG + 'px!important;height:' + TAG + 'px!important;display:none!important;cursor:pointer!important;margin:0!important;padding:0!important'
    const root = host.attachShadow({ mode: 'closed' })
    const face = document.createElement('div')
    face.textContent = 'V'
    face.style.cssText = 'width:100%;height:100%;box-sizing:border-box;border-radius:7px;background:#0A0E0A;border:1px solid #1F9E40;color:#33FF66;font:bold 13px monospace;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none'
    root.appendChild(face)
    host.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation() }, true)
    host.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() }, true)
    host.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.isTrusted) BRIDGE.postMessage('fill')
    }, true)
    hosts.add(host)
    document.documentElement.appendChild(host)
    return host
  }

  function place() {
    frame = 0
    for (const [field, host] of tags) {
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
      const size = Math.max(MIN_TAG, Math.min(TAG, Math.round(r.height) - 4))
      host.style.setProperty('width', size + 'px', 'important')
      host.style.setProperty('height', size + 'px', 'important')
      host.style.setProperty('top', Math.round(r.top + (r.height - size) / 2) + 'px', 'important')
      host.style.setProperty('left', Math.round(r.right - size - GAP) + 'px', 'important')
    }
  }

  function queuePlace() {
    if (!frame) frame = requestAnimationFrame(place)
  }

  function scan() {
    scanTimer = 0
    for (const input of document.querySelectorAll('input')) {
      if (tags.has(input) || input.disabled || input.readOnly) continue
      if (!shown(input)) continue
      if (isPassword(input) || isUser(input)) tags.set(input, makeTag())
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
    const list = inputsIn(pw.form || document)
    const at = list.indexOf(pw)
    let user = ''
    for (let k = at - 1; k >= 0; k--) {
      if (isText(list[k]) && list[k].value) {
        user = list[k].value
        break
      }
    }
    return { username: user.trim(), password: pw.value }
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

  function capture() {
    const c = credentials()
    if (!c) return
    const stamp = c.username + '\n' + c.password
    const now = Date.now()
    if (stamp === lastSave && now - lastSaveAt < SAVE_REPEAT_MS) return
    lastSave = stamp
    lastSaveAt = now
    BRIDGE.postMessage(JSON.stringify({ type: 'save', username: c.username, password: c.password }))
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
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['type', 'style', 'class', 'hidden', 'disabled'] })
    queueScan()
  }

  addEventListener('scroll', queuePlace, { capture: true, passive: true })
  addEventListener('resize', queuePlace)
  document.addEventListener('focusin', queueScan, true)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
  addEventListener('load', queueScan)
})();
