import fs from 'node:fs'
import path from 'node:path'
import { FIXTURES_ROOT, PASSWORD, fillDialog } from './harness.mjs'

const NATIVE_MOCK = fs.readFileSync(path.join(FIXTURES_ROOT, 'phone_native_mock.js'), 'utf8')
const PHONE_VIEWPORT = { width: 390, height: 844 }

export async function newPhone(browser, baseUrl, options = {}) {
  const context = await browser.newContext({ viewport: PHONE_VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  if (options.noBiometrics) await context.addInitScript(() => localStorage.setItem('__bioAvailable', 'no'))
  await context.addInitScript(NATIVE_MOCK)
  const page = await context.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(e.message))
  if (options.seed) {
    await page.goto(baseUrl + '/www/index.html?seed')
    await options.seed(page)
  }
  await page.goto(baseUrl + '/www/index.html')
  await page.waitForFunction(() => document.getElementById('view-loading').classList.contains('hidden'))
  return { page, context }
}

export async function visible(page, selector) {
  return page.locator(selector).first().isVisible()
}

export async function message(page, id) {
  await page.waitForTimeout(150)
  const node = page.locator('#' + id)
  if (!(await node.isVisible())) return ''
  return (await node.textContent()) || ''
}

export async function waitMessage(page, id, pattern) {
  await page.waitForFunction(([target, source]) => {
    const n = document.getElementById(target)
    return n && !n.classList.contains('hidden') && new RegExp(source).test(n.textContent)
  }, [id, pattern.source], { timeout: 20000 })
  return page.locator('#' + id).textContent()
}

export async function phoneTab(page, name) {
  await page.locator('.tab[data-tab="' + name + '"]').click()
  await page.waitForTimeout(150)
}

export async function pickFile(page, trigger, file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), trigger()])
  await chooser.setFiles({ name: file.name, mimeType: 'application/octet-stream', buffer: Buffer.from(file.text) })
}

export async function setUpWithPassword(phone, password = PASSWORD) {
  await phone.page.fill('#setup-password', password)
  await phone.page.click('#btn-setup-pw')
  await waitMessage(phone.page, 'msg-setup', /Password enrolled/)
  await phone.page.click('#btn-setup-done')
  await phone.page.waitForSelector('#view-app:not(.hidden)')
}

export async function setUpWithFingerprintAndPassword(phone) {
  await phone.page.click('#btn-setup-fp')
  await waitMessage(phone.page, 'msg-setup', /Fingerprint enrolled/)
  await setUpWithPassword(phone)
}

export async function unlockLogins(phone) {
  await phoneTab(phone.page, 'manage')
  const gate = phone.page.locator('#credentials-list .gate button')
  if (await gate.count()) {
    await gate.click()
    const fingerprint = await phone.page.evaluate(() => document.getElementById('status-fp').textContent === 'Enrolled')
    if (!fingerprint) await fillDialog(phone.page, [PASSWORD])
    await phone.page.waitForSelector('#credentials-list .gate', { state: 'detached' })
  }
}

export async function addLogin(phone, site, username, password) {
  await phoneTab(phone.page, 'manage')
  await phone.page.click('#btn-add-login')
  const overlay = phone.page.locator('.wv-dialog-overlay').last()
  await overlay.waitFor({ state: 'visible', timeout: 15000 })
  if (/Unlock/.test(await overlay.locator('.wv-dialog-title').textContent())) {
    await fillDialog(phone.page, [PASSWORD])
    await phone.page.waitForFunction(() => { const o = document.querySelectorAll('.wv-dialog-overlay'); return o.length && !/Unlock/.test(o[o.length - 1].querySelector('.wv-dialog-title').textContent) })
  }
  await fillDialog(phone.page, [site, '', username, password])
  await waitMessage(phone.page, 'msg-manage', /Login saved|already existed/)
}

export async function loginGroups(phone) {
  await unlockLogins(phone)
  return phone.page.evaluate(() => Array.from(document.querySelectorAll('#credentials-list .group')).map((g) => ({ site: g.querySelector('.group-name').textContent, count: g.querySelectorAll('.item').length })))
}

export async function revealAll(phone) {
  await unlockLogins(phone)
  await phone.page.evaluate(() => { for (const h of document.querySelectorAll('#credentials-list .group-head')) if (!h.parentElement.classList.contains('open')) h.click() })
  const shows = phone.page.locator('#credentials-list .item-actions button', { hasText: 'Show' })
  for (let guard = 0; guard < 50 && await shows.count(); guard++) { await shows.first().click(); await phone.page.waitForTimeout(80) }
  await phone.page.waitForTimeout(300)
  return phone.page.evaluate(() => Array.from(document.querySelectorAll('#credentials-list .item')).map((i) => i.querySelector('.item-label').textContent + '=' + i.querySelector('.item-secret').textContent).sort())
}
