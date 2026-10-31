import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup } from './harness.mjs'

let server
let browser
let context
let panel

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  context = await newExtensionContext(browser)
  const popup = await setUpPopup(context, server.url)
  await popup.evaluate(async () => {
    const key = await window.__testVaultKey()
    const bookmarks = await import('/bookmarks.js')
    await bookmarks.saveBookmark('https://news.example.com/', 'News', key)
    await bookmarks.saveBookmark('https://docs.example.com/', 'Docs', key)
  })
  panel = await openPage(context, server.url + '/bookmarks.html')
  await panel.waitForTimeout(1200)
})

after(async () => {
  await browser.close()
  await server.close()
})

test('the side panel lists saved bookmarks', async () => {
  assert.equal(await panel.locator('.item').count(), 2)
  assert.match(await panel.textContent('#list'), /News/)
})

test('search filters the list', async () => {
  await panel.fill('#filter', 'docs')
  await panel.waitForTimeout(300)
  assert.equal(await panel.locator('.item').count(), 1)
  assert.match(await panel.textContent('#list'), /Docs/)
  await panel.fill('#filter', '')
  await panel.waitForTimeout(300)
})

test('a bookmark can be renamed', async () => {
  await panel.locator('.item', { hasText: 'Docs' }).locator('button[title="Rename"]').click()
  await panel.fill('.rename-input', 'Team Docs')
  await panel.press('.rename-input', 'Enter')
  await panel.waitForTimeout(1200)
  assert.match(await panel.textContent('#list'), /Team Docs/)
})

test('removing asks first, and Keep cancels', async () => {
  await panel.locator('.item', { hasText: 'Team Docs' }).locator('button[title="Remove"]').click()
  assert.match(await panel.textContent('#list'), /Remove Team Docs\?/)
  await panel.locator('button[title="Keep"]').click()
  await panel.waitForTimeout(300)
  assert.equal(await panel.locator('.item').count(), 2)
})

test('confirming removes the bookmark', async () => {
  await panel.locator('.item', { hasText: 'Team Docs' }).locator('button[title="Remove"]').click()
  await panel.locator('.item.confirming button[title="Remove"]').click()
  await panel.waitForTimeout(1200)
  assert.equal(await panel.locator('.item').count(), 1)
  assert.doesNotMatch(await panel.textContent('#list'), /Team Docs/)
})

test('locking hides the bookmarks behind the unlock gate', async () => {
  await panel.evaluate(async () => { await chrome.storage.session.remove('masterKeyBytes') })
  await panel.waitForTimeout(800)
  assert.equal(await panel.isVisible('#gate'), true)
  assert.equal(await panel.isVisible('#list'), false)
})

test('the User Guide opens', async () => {
  const guide = await openPage(context, server.url + '/guide.html')
  assert.match(await guide.textContent('body'), /Valid Vault/)
  assert.deepEqual(guide.errors, [])
})

test('the side panel raises no page errors', () => {
  assert.deepEqual(panel.errors, [])
})
