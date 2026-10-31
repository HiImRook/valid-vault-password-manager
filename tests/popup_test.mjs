import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, PASSWORD, startServer, launchBrowser, newExtensionContext, openPage } from './harness.mjs'

let server
let browser
let popup

const visible = (selector) => popup.locator(selector).isVisible()
const message = async (selector) => (await popup.locator(selector).textContent()).trim()
const theme = () => popup.evaluate(() => document.documentElement.getAttribute('data-theme') || 'day')

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  const context = await newExtensionContext(browser)
  popup = await openPage(context, server.url + '/popup.html')
})

after(async () => {
  await browser.close()
  await server.close()
})

test('a fresh install shows setup with Finish disabled', async () => {
  assert.equal(await visible('#view-setup'), true)
  assert.equal(await visible('#setup-fp-note'), true)
  assert.equal(await popup.locator('#btn-setup-done').isDisabled(), true)
})

test('a short password is refused', async () => {
  await popup.fill('#setup-password', 'short')
  await popup.click('#btn-setup-pw')
  await popup.waitForTimeout(100)
  assert.match(await message('#msg-setup'), /12/)
})

test('a strong password enrolls and Finish opens the unlocked view', async () => {
  await popup.fill('#setup-password', PASSWORD)
  await popup.click('#btn-setup-pw')
  await popup.waitForTimeout(2500)
  assert.match(await message('#msg-setup'), /enrolled/i)
  assert.equal(await popup.locator('#btn-setup-done').isDisabled(), false)
  await popup.click('#btn-setup-done')
  await popup.waitForTimeout(800)
  assert.equal(await visible('#view-unlocked'), true)
})

test('the bookmark icon saves the current page and fills in', async () => {
  assert.equal(await visible('#btn-bookmark'), true)
  await popup.click('#btn-bookmark')
  await popup.waitForTimeout(200)
  assert.equal(await visible('#bookmark-add'), true)
  await popup.click('#btn-bookmark-save')
  await popup.waitForTimeout(1500)
  assert.match(await message('#msg-unlocked'), /Bookmarked/)
  assert.equal(await popup.locator('#btn-bookmark.saved').count(), 1)
})

test('the menu opens and closes on an outside click', async () => {
  await popup.click('#btn-expand')
  assert.equal(await visible('#menu-dropdown'), true)
  await popup.mouse.click(20, 300)
  assert.equal(await visible('#menu-dropdown'), false)
})

test('Lock shows the locked view with no fingerprint button', async () => {
  await popup.click('#btn-lock')
  await popup.waitForTimeout(500)
  assert.equal(await visible('#view-locked'), true)
  assert.equal(await visible('#btn-fingerprint'), false)
})

test('a wrong password is refused', async () => {
  await popup.fill('#input-password', 'wrong-password-1')
  await popup.click('#btn-password')
  await popup.waitForTimeout(2500)
  assert.equal(await visible('#view-unlocked'), false)
  assert.ok((await message('#msg-locked')).length > 0)
})

test('the right password unlocks with Enter and remembers the bookmark', async () => {
  await popup.fill('#input-password', PASSWORD)
  await popup.press('#input-password', 'Enter')
  await popup.waitForTimeout(2500)
  assert.equal(await visible('#view-unlocked'), true)
  await popup.waitForTimeout(500)
  assert.equal(await popup.locator('#btn-bookmark.saved').count(), 1)
})

test('the bookmark icon removes a saved page', async () => {
  await popup.click('#btn-bookmark')
  await popup.waitForTimeout(200)
  assert.equal(await visible('#bookmark-remove'), true)
  await popup.click('#btn-bookmark-remove')
  await popup.waitForTimeout(1500)
  assert.match(await message('#msg-unlocked'), /Removed/)
})

test('reopening stays unlocked from the session key', async () => {
  await popup.reload()
  await popup.waitForTimeout(800)
  assert.equal(await visible('#view-unlocked'), true)
})

test('day and night mode switch, save, and persist', async () => {
  assert.equal(await theme(), 'day')
  await popup.click('[data-theme-toggle] >> visible=true')
  assert.equal(await theme(), 'dark')
  assert.equal(await popup.evaluate(async () => (await chrome.storage.local.get('vv-theme'))['vv-theme']), 'dark')
  await popup.reload()
  await popup.waitForTimeout(300)
  assert.equal(await theme(), 'dark')
})

test('clearing the session locks the popup, and the toggle still works', async () => {
  await popup.evaluate(async () => { await chrome.storage.session.remove('masterKeyBytes') })
  await popup.reload()
  await popup.waitForTimeout(800)
  assert.equal(await visible('#view-locked'), true)
  await popup.click('#view-locked [data-theme-toggle]')
  assert.equal(await theme(), 'day')
})

test('the popup raises no page errors', () => {
  assert.deepEqual(popup.errors, [])
})
