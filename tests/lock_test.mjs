import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, PASSWORD, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup, seedLogins, revealLogins, openTab, settleDialogs } from './harness.mjs'

let server
let browser
let context
let manage

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  context = await newExtensionContext(browser)
  const popup = await setUpPopup(context, server.url)
  await seedLogins(popup)
  await popup.close()
  manage = await openPage(context, server.url + '/manage.html')
  await revealLogins(manage)
})

after(async () => {
  await browser.close()
  await server.close()
})

test('locking from the popup locks Manage and clears revealed secrets', async () => {
  const popup = await openPage(context, server.url + '/popup.html')
  await popup.click('#btn-lock')
  await popup.waitForSelector('#view-locked:not(.hidden)')
  await popup.close()
  await manage.waitForSelector('#manage-lock-overlay', { state: 'visible', timeout: 15000 })
  assert.doesNotMatch(await manage.textContent('body'), /alice-pw-1/)
})

test('a wrong password keeps Manage locked', async () => {
  await manage.fill('#input-manage-password', 'wrong-pass-1!')
  await manage.click('#btn-manage-unlock-pw')
  await manage.waitForTimeout(2500)
  assert.equal(await manage.isVisible('#manage-lock-overlay'), true)
})

test('the right password unlocks Manage with sections gated again', async () => {
  await manage.fill('#input-manage-password', PASSWORD)
  await manage.click('#btn-manage-unlock-pw')
  await manage.waitForTimeout(2500)
  assert.equal(await manage.isVisible('#manage-lock-overlay'), false)
  assert.match(await manage.textContent('#credentials-list'), /Unlock to view credentials/)
})

test('Clear Vault returns to setup and leaves no backup copy behind', async () => {
  await openTab(manage, 'settings')
  await manage.click('#btn-clear-vault')
  await settleDialogs(manage)
  await manage.waitForTimeout(1500)
  const mirrorKeys = await manage.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('vvMirror:')))
  assert.deepEqual(mirrorKeys, [])
  const popup = await openPage(context, server.url + '/popup.html')
  assert.equal(await popup.isVisible('#view-setup'), true)
})

test('Manage raises no page errors', () => {
  assert.deepEqual(manage.errors, [])
})
