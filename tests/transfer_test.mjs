import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, PASSWORD, KEY_PROTECTION, KEY_ANSWERS, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup, seedLogins, revealLogins, openTab, unlockSection, fillDialog, dialogTitles, settleDialogs, waitForText, download, chooseFile } from './harness.mjs'

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

let server
let browser
let source
let target
const files = {}

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  const sourceContext = await newExtensionContext(browser)
  const popup = await setUpPopup(sourceContext, server.url)
  await seedLogins(popup)
  await popup.evaluate(async () => {
    const key = await window.__testVaultKey()
    const bookmarks = await import('/bookmarks.js')
    await bookmarks.saveBookmark('https://news.example.com/', 'News', key)
  })
  source = await openPage(sourceContext, server.url + '/manage.html')
  await openTab(source, 'webcreds')
  await source.click('#btn-add-webcred')
  await fillDialog(source, ['Wi-Fi', 'Home', 'wifi-secret-9'])
  await waitForText(source, '#msg-webcreds', /Saved/)
  await openTab(source, 'personal')
  await unlockSection(source, '#personalinfo-content')
  await source.locator('#personalinfo-content button', { hasText: 'Edit' }).first().click()
  await fillDialog(source, [PASSWORD])
  await fillDialog(source, ['Alice'])
  await waitForText(source, '#msg-personalinfo', /Saved/)
  await openTab(source, 'wallets')
  await unlockSection(source, '#wallets-content')
  await source.click('#btn-add-wallet')
  await source.waitForTimeout(300)
  await source.fill('.wv-editor .wv-fields input', 'Main')
  await source.locator('.wv-word-input').first().fill(SEED_PHRASE)
  await source.locator('.wv-editor button', { hasText: 'Done' }).click()
  await source.waitForTimeout(500)
  const cancelNotes = source.locator('.wv-editor button', { hasText: 'Cancel' })
  if (await cancelNotes.count()) await cancelNotes.click()
  await source.waitForTimeout(300)
})

after(async () => {
  await browser.close()
  await server.close()
})

test('the exported vault file is encrypted', async () => {
  await openTab(source, 'sync')
  files.vault = await download(source, async () => { await source.click('#btn-export-vault'); await fillDialog(source, [PASSWORD]) })
  assert.match(files.vault.name, /\.vault$/)
  assert.doesNotMatch(files.vault.text, /alice-pw-1|wifi-secret|Alice|news\.example/)
})

test('the exported key file carries no raw key', async () => {
  await source.click('#btn-export-key')
  await fillDialog(source, [PASSWORD])
  files.key = await download(source, async () => { await fillDialog(source, KEY_PROTECTION) })
  assert.match(files.key.name, /\.vaultkey$/)
  assert.doesNotMatch(files.key.text, /masterKeyBytes/)
  assert.match(files.key.text, /questions/)
  assert.deepEqual(source.errors, [])
})

test('a second browser refuses a wrong security answer and accepts the right ones', async () => {
  const targetContext = await newExtensionContext(browser)
  await setUpPopup(targetContext, server.url)
  target = await openPage(targetContext, server.url + '/manage.html')
  await openTab(target, 'sync')
  await chooseFile(target, () => target.click('#btn-import-key'), files.key)
  await fillDialog(target, [PASSWORD])
  await fillDialog(target, [KEY_ANSWERS[0], KEY_ANSWERS[1], KEY_ANSWERS[2], 'wrong'])
  assert.ok((await dialogTitles(target)).includes('Accept master key'))
  await fillDialog(target, KEY_ANSWERS)
  await fillDialog(target, [PASSWORD])
  assert.match(await waitForText(target, '#msg-sync', /imported/), /Master key imported/)
})

test('the imported vault brings every section across', async () => {
  await chooseFile(target, () => target.click('#btn-import-vault'), files.vault)
  await settleDialogs(target)
  assert.match(await waitForText(target, '#msg-sync', /merged|imported|up to date/i), /merged|imported/i)
  await openTab(target, 'manage')
  assert.equal(await revealLogins(target), 'alice=alice-pw-1!,bob@mail.com=bob-pw-2!')
  assert.match(await target.textContent('#credentials-list'), /4321/)
  await openTab(target, 'webcreds')
  await unlockSection(target, '#webcreds-list')
  await target.locator('#webcreds-list .credential-item').first().click()
  await target.locator('#webcreds-list .btn-show').first().click()
  await target.waitForTimeout(500)
  assert.match(await target.textContent('#webcreds-list'), /wifi-secret-9/)
  await openTab(target, 'personal')
  await unlockSection(target, '#personalinfo-content')
  assert.match(await target.textContent('#personalinfo-content'), /Alice/)
  await openTab(target, 'wallets')
  await unlockSection(target, '#wallets-content')
  assert.equal(await target.locator('.wv-wallet-name').count(), 1)
  const bookmarks = await target.evaluate(async () => {
    const list = await (await import('/bookmarks.js')).listBookmarks(await window.__testVaultKey())
    return list.map((b) => b.url)
  })
  assert.ok(bookmarks.some((u) => /news\.example\.com/.test(u)))
})

test('importing the same vault again changes nothing', async () => {
  await openTab(target, 'sync')
  await chooseFile(target, () => target.click('#btn-import-vault'), files.vault)
  await settleDialogs(target)
  assert.match(await waitForText(target, '#msg-sync', /up to date|merged/i), /up to date/i)
  assert.deepEqual(target.errors, [])
})
