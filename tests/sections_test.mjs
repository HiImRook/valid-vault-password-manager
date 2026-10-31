import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, PASSWORD, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup, openTab, unlockSection, fillDialog, waitForText } from './harness.mjs'

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

let server
let browser
let manage

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  const context = await newExtensionContext(browser)
  await setUpPopup(context, server.url)
  manage = await openPage(context, server.url + '/manage.html')
})

after(async () => {
  await browser.close()
  await server.close()
})

test('a misc credential saves and reveals after unlocking the section', async () => {
  await openTab(manage, 'webcreds')
  await manage.click('#btn-add-webcred')
  await fillDialog(manage, ['Wi-Fi', 'Home', 'wifi-secret-9'])
  assert.match(await waitForText(manage, '#msg-webcreds', /Saved/), /Saved/)
  await unlockSection(manage, '#webcreds-list')
  await manage.locator('#webcreds-list .credential-item').first().click()
  await manage.locator('#webcreds-list .btn-show').first().click()
  await manage.waitForTimeout(500)
  const list = await manage.textContent('#webcreds-list')
  assert.match(list, /Wi-Fi/)
  assert.match(list, /Home/)
  assert.match(list, /wifi-secret-9/)
})

test('personal info edits ask for the password and save', async () => {
  await openTab(manage, 'personal')
  await unlockSection(manage, '#personalinfo-content')
  await manage.locator('#personalinfo-content button', { hasText: 'Edit' }).first().click()
  await fillDialog(manage, [PASSWORD])
  await fillDialog(manage, ['Alice'])
  await waitForText(manage, '#msg-personalinfo', /Saved/)
  await manage.waitForTimeout(500)
  assert.match(await manage.textContent('#personalinfo-content'), /Alice/)
})

test('emails can be added, reordered to primary, and deleted', async () => {
  for (const email of ['one@mail.com', 'two@mail.com']) {
    await manage.click('#btn-add-email')
    await fillDialog(manage, [PASSWORD])
    await fillDialog(manage, [email])
    await waitForText(manage, '#msg-personalinfo', /added/)
    await manage.waitForTimeout(400)
  }
  await manage.locator('[data-email-up]').nth(1).click()
  await fillDialog(manage, [PASSWORD])
  await manage.waitForTimeout(900)
  const order = await manage.evaluate(() => Array.from(document.querySelectorAll('[data-email-del]')).map((b) => b.closest('.pi-row').querySelector('.pi-value').textContent).join(','))
  assert.match(order, /^two@mail\.com\s*Primary,one@mail\.com$/)
  await manage.locator('[data-email-del]').nth(1).click()
  await fillDialog(manage, [PASSWORD])
  await fillDialog(manage, [], 'cancel')
  await manage.waitForTimeout(500)
  assert.equal(await manage.locator('[data-email-del]').count(), 2)
  await manage.locator('[data-email-del]').nth(1).click()
  await fillDialog(manage, [PASSWORD])
  await fillDialog(manage, [])
  await manage.waitForTimeout(900)
  assert.equal(await manage.locator('[data-email-del]').count(), 1)
  assert.doesNotMatch(await manage.textContent('#personalinfo-content'), /one@mail/)
})

test('a crypto wallet saves from a pasted seed phrase', async () => {
  await openTab(manage, 'wallets')
  await unlockSection(manage, '#wallets-content')
  await manage.click('#btn-add-wallet')
  await manage.waitForTimeout(300)
  await manage.fill('.wv-editor .wv-fields input', 'Main')
  await manage.locator('.wv-word-input').first().fill(SEED_PHRASE)
  await manage.locator('.wv-editor button', { hasText: 'Done' }).click()
  await manage.waitForTimeout(500)
  const cancelNotes = manage.locator('.wv-editor button', { hasText: 'Cancel' })
  if (await cancelNotes.count()) await cancelNotes.click()
  await manage.waitForTimeout(300)
  assert.equal(await manage.locator('.wv-wallet-name').count(), 1)
})

test('Manage raises no page errors', () => {
  assert.deepEqual(manage.errors, [])
})
