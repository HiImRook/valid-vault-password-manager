import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, PASSWORD, startServer, launchBrowser, newExtensionContext, openPage } from './harness.mjs'

const WINDOW_SIZE = { width: 364, height: 401 }

let server
let browser
let page

const text = async (selector) => (await page.locator(selector).textContent()).trim()
const closed = () => page.evaluate(() => window.__closed)

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  const context = await newExtensionContext(browser, WINDOW_SIZE)
  page = await openPage(context, server.url + '/popup.html')
  await page.fill('#setup-password', PASSWORD)
  await page.click('#btn-setup-pw')
  await page.waitForTimeout(2500)
  await page.evaluate(async () => { await chrome.storage.session.remove('masterKeyBytes') })
  await page.goto(server.url + '/unlock.html?site=example.com')
  await page.waitForTimeout(600)
})

after(async () => {
  await browser.close()
  await server.close()
})

test('the window names the site asking to unlock', async () => {
  assert.match(await text('#site'), /example\.com/)
})

test('a password-only vault shows no fingerprint button or divider', async () => {
  assert.equal(await page.locator('#btn-fingerprint').isVisible(), false)
  assert.equal(await page.locator('.or').isVisible(), false)
})

test('the password field starts focused and the window fits without scrolling', async () => {
  assert.equal(await page.evaluate(() => document.activeElement.id), 'input-password')
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true)
})

test('an empty password asks for one', async () => {
  await page.click('#btn-password')
  await page.waitForTimeout(100)
  assert.match(await text('#msg'), /Enter your master password/)
})

test('the eye button shows and hides the password', async () => {
  await page.fill('#input-password', 'abc')
  await page.click('#btn-eye')
  assert.equal(await page.getAttribute('#input-password', 'type'), 'text')
  await page.click('#btn-eye')
  assert.equal(await page.getAttribute('#input-password', 'type'), 'password')
})

test('a wrong password is refused and the window stays open', async () => {
  await page.fill('#input-password', 'wrong-password-1')
  await page.click('#btn-password')
  await page.waitForTimeout(2500)
  assert.match(await text('#msg'), /Wrong password/)
  assert.equal(await closed(), false)
})

test('the right password starts the session and closes the window', async () => {
  await page.fill('#input-password', PASSWORD)
  await page.press('#input-password', 'Enter')
  await page.waitForTimeout(2500)
  assert.equal(await closed(), true)
  assert.equal(await page.evaluate(async () => (await chrome.storage.session.get('masterKeyBytes')).masterKeyBytes.length), 32)
})

test('Cancel closes the window', async () => {
  await page.evaluate(() => { window.__closed = false })
  await page.click('#btn-cancel')
  assert.equal(await closed(), true)
})

test('the unlock window raises no page errors', () => {
  assert.deepEqual(page.errors, [])
})
