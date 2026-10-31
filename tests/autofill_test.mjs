import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, PASSWORD, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup } from './harness.mjs'

const V_TAG = 'div[title="Fill with Valid Vault"]'

let server
let browser
let context
const pages = []

async function site(name) {
  const page = await openPage(context, server.url + '/__fixture/' + name)
  await page.waitForTimeout(800)
  pages.push(page)
  return page
}

async function taggedFields(page) {
  return page.evaluate((selector) => {
    const ids = []
    for (const tag of document.querySelectorAll(selector)) {
      const r = tag.getBoundingClientRect()
      for (const id of ['q', 'e', 'u', 'p', 'pin']) {
        const el = document.getElementById(id)
        if (!el) continue
        const b = el.getBoundingClientRect()
        if (r.top >= b.top - 4 && r.bottom <= b.bottom + 4 && r.left >= b.left && r.right <= b.right + 30) ids.push(id)
      }
    }
    return Array.from(new Set(ids)).sort()
  }, V_TAG)
}

async function pickLogin(page, username) {
  await page.locator(V_TAG).first().click()
  await page.waitForTimeout(800)
  const item = page.locator('.item', { hasText: username }).first()
  const found = await item.count()
  if (found) { await item.click(); await page.waitForTimeout(800) }
  return found
}

async function unlockFromPopup() {
  const popup = await openPage(context, server.url + '/popup.html')
  await popup.fill('#input-password', PASSWORD)
  await popup.click('#btn-password')
  await popup.waitForSelector('#view-unlocked:not(.hidden)')
  await popup.close()
}

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  context = await newExtensionContext(browser, { openShadowRoots: true })
  await setUpPopup(context, server.url)
})

after(async () => {
  await browser.close()
  await server.close()
})

test('login fields get V tags', async () => {
  const page = await site('login.html')
  assert.ok(await page.locator(V_TAG).count() >= 2)
})

test('submitting a login offers to save it with its extra field', async () => {
  const page = await site('login.html')
  await page.fill('#u', 'carol')
  await page.fill('#p', 'carol-pw-3!')
  await page.fill('#pin', '9999')
  await page.click('#go')
  await page.waitForSelector('#sp-save', { timeout: 10000 })
  assert.match(await page.textContent('#sp-extra'), /1 additional field/)
  assert.match(await page.textContent('#sp-user'), /carol/)
  await page.click('#sp-save')
  await page.waitForTimeout(1500)
  const saved = await page.evaluate(async () => {
    const passwords = await import('/passwords.js')
    const r = await passwords.getCredentials('127.0.0.1', await window.__testVaultKey())
    return r.credentials.map((c) => ({ username: c.username, password: c.password, extra: c.extraFields }))
  })
  assert.equal(saved.length, 1)
  assert.equal(saved[0].username, 'carol')
  assert.equal(saved[0].password, 'carol-pw-3!')
  assert.match(JSON.stringify(saved[0].extra), /Account PIN.*9999/)
})

test('the V tag picker fills the username, password, and extra field', async () => {
  const page = await site('login.html')
  assert.equal(await pickLogin(page, 'carol'), 1)
  assert.equal(await page.inputValue('#u'), 'carol')
  assert.equal(await page.inputValue('#p'), 'carol-pw-3!')
  assert.equal(await page.inputValue('#pin'), '9999')
})

test('a locked vault fills nothing', async () => {
  const page = await site('login.html')
  await page.evaluate(async () => { await chrome.storage.session.remove('masterKeyBytes') })
  const locked = await site('login.html')
  await locked.locator(V_TAG).first().click()
  await locked.waitForTimeout(1200)
  assert.equal(await locked.inputValue('#p'), '')
  await unlockFromPopup()
})

test('a username box with no type gets a V tag and saves and fills back', async () => {
  const page = await site('untyped.html')
  assert.ok((await taggedFields(page)).includes('u'))
  await page.fill('#u', 'dana')
  await page.fill('#p', 'dana-pw-4!')
  await page.fill('#pin', '1111')
  await page.click('#go')
  await page.waitForSelector('#sp-save', { timeout: 10000 })
  assert.match(await page.textContent('#sp-user'), /dana/)
  assert.match(await page.textContent('#sp-extra'), /1 additional field/)
  await page.click('#sp-save')
  await page.waitForTimeout(1200)
  const again = await site('untyped.html')
  assert.equal(await pickLogin(again, 'dana'), 1)
  assert.equal(await again.inputValue('#u'), 'dana')
  assert.equal(await again.inputValue('#p'), 'dana-pw-4!')
  assert.equal(await again.inputValue('#pin'), '1111')
})

test('a username box with an unknown type gets a V tag', async () => {
  const page = await site('oddtype.html')
  assert.ok((await taggedFields(page)).includes('u'))
})

test('a typed email field is chosen over an untyped search box', async () => {
  const page = await site('mixed.html')
  const tagged = await taggedFields(page)
  assert.ok(tagged.includes('e'))
  assert.ok(!tagged.includes('q'))
  await page.fill('#e', 'erin@mail.com')
  await page.fill('#p', 'erin-pw-5!')
  await page.click('#go')
  await page.waitForSelector('#sp-save', { timeout: 10000 })
  assert.match(await page.textContent('#sp-user'), /erin@mail\.com/)
})

test('the sites raise no page errors', () => {
  assert.deepEqual(pages.flatMap((p) => p.errors), [])
})
