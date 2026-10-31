import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const EXTENSION_ROOT = path.join(REPO_ROOT, 'extension')
export const FIXTURES_ROOT = path.join(REPO_ROOT, 'tests', 'fixtures')
export const PASSWORD = 'Correct-horse-9!'
export const SECOND_PASSWORD = 'Battery-Staple-7#'
export const PASSPHRASE = 'copper-lantern-mosaic-drift7!'
export const KEY_PROTECTION = [PASSPHRASE, PASSPHRASE, 0, 'rex', 1, 'teddy', 2, 'hobbit']
export const KEY_ANSWERS = [PASSPHRASE, 'rex', 'teddy', 'hobbit']

const CONTENT_TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain' }
const FIXTURE_PREFIX = '/__fixture/'

export function startServer(root, stubs = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0])
      if (stubs[url]) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(stubs[url]) }
      const file = url.startsWith(FIXTURE_PREFIX) ? path.join(FIXTURES_ROOT, url.slice(FIXTURE_PREFIX.length)) : path.join(root, url === '/' ? '/index.html' : url)
      if (!file.startsWith(root) && !file.startsWith(FIXTURES_ROOT)) { res.writeHead(403); return res.end() }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end() }
      res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream' })
      res.end(fs.readFileSync(file))
    })
    server.listen(0, '127.0.0.1', () => resolve({ url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((done) => server.close(done)) }))
  })
}

export function launchBrowser() {
  return chromium.launch()
}

export const CHROME_SHIM = () => {
  const makeArea = (name) => {
    const load = () => JSON.parse(localStorage.getItem('__chrome_' + name) || '{}')
    const save = (o) => localStorage.setItem('__chrome_' + name, JSON.stringify(o))
    const listeners = window.__storageListeners || (window.__storageListeners = [])
    const notify = (changes) => { for (const l of listeners) try { l(changes, name) } catch (e) {} }
    return {
      get: async (k) => {
        const o = load()
        if (k == null) return o
        const keys = Array.isArray(k) ? k : typeof k === 'string' ? [k] : Object.keys(k)
        const r = {}
        for (const x of keys) if (x in o) r[x] = o[x]; else if (k && typeof k === 'object' && !Array.isArray(k)) r[x] = k[x]
        return r
      },
      set: async (v) => {
        const o = load()
        const changes = {}
        for (const [key, value] of Object.entries(JSON.parse(JSON.stringify(v)))) { changes[key] = { oldValue: o[key], newValue: value }; o[key] = value }
        save(o)
        notify(changes)
      },
      remove: async (k) => {
        const o = load()
        const changes = {}
        for (const x of (Array.isArray(k) ? k : [k])) { if (x in o) changes[x] = { oldValue: o[x] }; delete o[x] }
        save(o)
        notify(changes)
      },
      clear: async () => save({})
    }
  }
  window.addEventListener('storage', (e) => {
    const m = /^__chrome_(local|session)$/.exec(e.key || '')
    if (!m) return
    const before = JSON.parse(e.oldValue || '{}')
    const after = JSON.parse(e.newValue || '{}')
    const changes = {}
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { oldValue: before[k], newValue: after[k] }
    if (Object.keys(changes).length) for (const l of (window.__storageListeners || [])) try { l(changes, m[1]) } catch (err) {}
  })
  const messageListeners = []
  const noop = () => {}
  const event = () => ({ addListener: noop, removeListener: noop, hasListener: () => false })
  window.__sent = []
  window.chrome = {
    runtime: {
      id: 'testext',
      getURL: (p) => location.origin + '/' + p.replace(/^\//, ''),
      getManifest: () => ({ version: 'test' }),
      sendMessage: async (m) => {
        window.__sent.push(m && m.action)
        if (messageListeners.length) {
          return new Promise((resolve) => {
            let answered = false
            const respond = (r) => { if (!answered) { answered = true; resolve(r) } }
            let keep = false
            for (const l of messageListeners) { const r = l(m, { url: location.href, tab: { id: 1, windowId: 1, url: location.href } }, respond); if (r === true) keep = true }
            if (!keep) setTimeout(() => respond(undefined), 0)
          })
        }
        if (m && m.action === 'persistSessionKey') { await chrome.storage.session.set({ masterKeyBytes: m.masterKeyBytes }); return { success: true } }
        return {}
      },
      onMessage: { addListener: (l) => messageListeners.push(l), removeListener: noop },
      onInstalled: event(), onStartup: event(), lastError: null
    },
    storage: { local: makeArea('local'), session: makeArea('session'), onChanged: { addListener: (l) => (window.__storageListeners || (window.__storageListeners = [])).push(l), removeListener: noop } },
    tabs: { query: async () => [{ id: 1, url: 'https://example.com/account', title: 'Example Account', windowId: 1 }], create: async () => ({}), sendMessage: async () => ({}), onRemoved: event(), onUpdated: event(), get: async () => ({ id: 1, windowId: 1 }) },
    windows: { create: async () => ({ id: 9 }), update: async () => ({}), get: async () => ({ left: 0, top: 0, width: 1200, height: 800 }), onRemoved: event() },
    alarms: { create: noop, clear: async () => true, onAlarm: event() },
    permissions: { request: async () => true, remove: async () => true, contains: async () => true },
    contextMenus: { create: noop, removeAll: (cb) => cb && cb(), onClicked: event() },
    action: { setBadgeText: noop, setBadgeBackgroundColor: noop, setIcon: noop },
    sidePanel: { open: async () => {}, setOptions: async () => {}, setPanelBehavior: async () => {} },
    bookmarks: { getTree: async () => [] },
    commands: { onCommand: event() }
  }
  window.__closed = false
  window.close = () => { window.__closed = true }
}

export async function newExtensionContext(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 1100, height: options.height || 900 }, acceptDownloads: true })
  await context.addInitScript(CHROME_SHIM)
  await context.addInitScript(() => { window.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => false } })
  await context.addInitScript(() => { delete window.showSaveFilePicker; delete window.showOpenFilePicker })
  await context.addInitScript(() => {
    window.__testVaultKey = async () => {
      const { masterKeyToCryptoKey } = await import('/crypto.js')
      const session = await chrome.storage.session.get('masterKeyBytes')
      return masterKeyToCryptoKey(new Uint8Array(session.masterKeyBytes))
    }
  })
  if (options.openShadowRoots) await context.addInitScript(() => { const attach = Element.prototype.attachShadow; Element.prototype.attachShadow = function (init) { return attach.call(this, Object.assign({}, init, { mode: 'open' })) } })
  return context
}

export async function openPage(context, url) {
  const page = await context.newPage()
  page.errors = []
  page.nativeDialogs = []
  page.on('dialog', (d) => { page.nativeDialogs.push(d.type() + ':' + d.message()); d.accept() })
  page.on('pageerror', (e) => page.errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) page.errors.push(m.text()) })
  await page.goto(url)
  await page.waitForTimeout(500)
  return page
}

export async function dialogTitles(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('.wv-dialog-overlay')).map((o) => (o.querySelector('.wv-dialog-title') || {}).textContent))
}

export async function fillDialog(page, values, action = 'ok') {
  const overlay = page.locator('.wv-dialog-overlay').last()
  await overlay.waitFor({ state: 'visible', timeout: 15000 })
  const title = await overlay.locator('.wv-dialog-title').textContent()
  const fields = overlay.locator('.vv-field-input')
  for (let i = 0; i < (values || []).length; i++) {
    const value = values[i]
    if (value === undefined || value === null) continue
    if (i >= await fields.count()) throw new Error('Dialog "' + title + '" has ' + (await fields.count()) + ' fields, test supplied ' + values.length)
    const field = fields.nth(i)
    if ((await field.evaluate((n) => n.tagName)) === 'SELECT') await field.selectOption(String(value))
    else await field.fill(String(value))
  }
  const buttons = overlay.locator('.wv-dialog-actions button')
  const handle = await overlay.elementHandle()
  if (action === 'ok') await buttons.last().click()
  else if (action === 'cancel') await buttons.first().click()
  else await buttons.filter({ hasText: action }).first().click()
  await page.waitForFunction((el) => !el.isConnected || (el.querySelector('.vv-form-error') && el.querySelector('.vv-form-error').textContent.trim()), handle, { timeout: 30000 }).catch(() => {})
  return title
}

export async function dialogError(page) {
  const overlay = page.locator('.wv-dialog-overlay').last()
  await page.waitForTimeout(300)
  if (!(await overlay.isVisible())) return null
  return overlay.locator('.vv-form-error').textContent()
}

export async function settleDialogs(page, password = PASSWORD, rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await page.waitForTimeout(800)
    const titles = await dialogTitles(page)
    if (!titles.length) return
    if (titles[titles.length - 1] === 'Unlock') await fillDialog(page, [password])
    else await fillDialog(page, [])
  }
}

export async function waitForText(page, selector, pattern, timeout = 20000) {
  await page.waitForFunction(([s, src]) => { const n = document.querySelector(s); return n && new RegExp(src).test(n.textContent) }, [selector, pattern.source], { timeout }).catch(() => {})
  return page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', selector)
}

export async function setUpPopup(context, baseUrl) {
  const popup = await openPage(context, baseUrl + '/popup.html')
  await popup.fill('#setup-password', PASSWORD)
  await popup.click('#btn-setup-pw')
  await waitForText(popup, '#msg-setup', /enrolled/)
  await popup.click('#btn-setup-done')
  await popup.waitForSelector('#view-unlocked:not(.hidden)')
  return popup
}

export async function openTab(page, name) {
  await page.click('.sidebar-tab[data-tab="' + name + '"]')
  await page.waitForTimeout(300)
}

export async function revealLogins(page) {
  if (await page.locator('#btn-unlock-creds').count()) { await page.click('#btn-unlock-creds'); await fillDialog(page, [PASSWORD]); await page.waitForTimeout(800) }
  const heads = page.locator('#credentials-list .credential-item')
  for (let i = 0; i < await heads.count(); i++) await heads.nth(i).click()
  const shows = page.locator('#credentials-list .btn-show')
  for (let i = 0; i < await shows.count(); i++) { await shows.nth(i).click(); await page.waitForTimeout(250) }
  await page.waitForTimeout(400)
  return page.evaluate(() => Array.from(document.querySelectorAll('#credentials-list [data-cred-id]')).map((r) => r.querySelector('.credential-username').textContent + '=' + r.querySelector('.credential-password').textContent).sort().join(','))
}

export async function unlockSection(page, contentSelector) {
  const button = page.locator(contentSelector + ' button').first()
  if (await button.count() && /Unlock/.test(await button.textContent())) { await button.click(); await fillDialog(page, [PASSWORD]); await page.waitForTimeout(800) }
}

export async function seedLogins(page) {
  await page.evaluate(async () => {
    const key = await window.__testVaultKey()
    const passwords = await import('/passwords.js')
    await passwords.ensureVault(key)
    await passwords.saveCredential('site.com', 'alice', 'alice-pw-1!', key, [{ label: 'PIN', value: '4321' }], 'username')
    await passwords.saveCredential('other.org', 'bob@mail.com', 'bob-pw-2!', key, [], 'email')
  })
}

export async function download(page, trigger) {
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), trigger()])
  return { name: file.suggestedFilename(), text: fs.readFileSync(await file.path(), 'utf8') }
}

export async function chooseFile(page, trigger, file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 30000 }), trigger()])
  await chooser.setFiles({ name: file.name, mimeType: 'application/octet-stream', buffer: Buffer.from(file.text) })
}
