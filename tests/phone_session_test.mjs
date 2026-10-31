import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { REPO_ROOT, PASSWORD, KEY_PROTECTION, startServer, launchBrowser, fillDialog } from './harness.mjs'
import { newPhone, visible, waitMessage, phoneTab, setUpWithPassword, addLogin, revealAll } from './phone_harness.mjs'

let server
let browser

before(async () => {
  server = await startServer(REPO_ROOT)
  browser = await launchBrowser()
})

after(async () => {
  await browser.close()
  await server.close()
})

test('auto-lock clears revealed secrets and returns to the lock screen', async () => {
  const phone = await newPhone(browser, server.url, { noBiometrics: true })
  const { page } = phone
  await setUpWithPassword(phone)
  await addLogin(phone, 'lock.com', 'dave', 'dave-pw-6!')
  await phoneTab(page, 'settings')
  await page.fill('#input-autolock-timeout', '10')
  await page.dispatchEvent('#input-autolock-timeout', 'change')
  await waitMessage(page, 'msg-settings', /Auto-lock set/)
  assert.equal(await page.textContent('#readout-autolock-timeout'), '00h 00m 10s')
  await revealAll(phone)
  await page.waitForSelector('#view-locked:not(.hidden)', { timeout: 20000 })
  assert.equal(await page.evaluate(() => document.getElementById('credentials-list').textContent), '')
  await page.fill('#input-unlock-password', PASSWORD)
  await page.click('#btn-unlock-pw')
  await page.waitForSelector('#view-app:not(.hidden)')
  assert.equal(await visible(page, '#credentials-list .gate'), true)
  await phoneTab(page, 'settings')
  await page.fill('#input-autolock-timeout', '99999')
  await page.dispatchEvent('#input-autolock-timeout', 'change')
  assert.equal(await page.inputValue('#input-autolock-timeout'), '7200')
  await phone.context.close()
})

test('phone data from v0.5 to v0.7 opens after the update', async () => {
  const seed = async (page) => {
    await page.evaluate(async (password) => {
      const auth = await import('/extension/auth.js')
      const passwords = await import('/extension/passwords.js')
      const store = await import('/extension/store.js')
      auth.startPasswordCreation()
      const created = await auth.setPassword(password, null)
      await passwords.ensureVault(created.masterKey)
      await passwords.saveCredential('old.com', 'olduser', 'old-pw-7!', created.masterKey, 'username')
      const record = await store.getAuth()
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', created.masterKey))
      const keyRaw = crypto.getRandomValues(new Uint8Array(32))
      const key = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['encrypt'])
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, raw))
      const b64 = (bytes) => btoa(String.fromCharCode(...bytes))
      localStorage.setItem('__bioKeys', JSON.stringify({ valid_vault_biometric_key: b64(keyRaw) }))
      record.fingerprintNative = { wrapped: b64(wrapped), iv: b64(iv) }
      record.autoLockTimeout = 300
      record.keyNickname = 'Old Phone Key'
      await store.setAuth(record)
      const db = await store.openDB()
      db.close()
    }, PASSWORD)
  }
  const phone = await newPhone(browser, server.url, { seed })
  const { page } = phone
  assert.equal(await visible(page, '#view-locked'), true)
  assert.equal(await visible(page, '#btn-unlock-fp'), true)
  await page.click('#btn-unlock-fp')
  await page.waitForSelector('#view-app:not(.hidden)')
  assert.deepEqual(await revealAll(phone), ['olduser=old-pw-7!'])
  await phoneTab(page, 'settings')
  assert.equal(await page.inputValue('#input-autolock-timeout'), '300')
  assert.equal(await page.inputValue('#key-nickname-input'), 'Old Phone Key')
  const database = await page.evaluate(() => new Promise((resolve) => { const r = indexedDB.open('ValidVault'); r.onsuccess = () => resolve({ version: r.result.version, stores: Array.from(r.result.objectStoreNames) }) }))
  assert.equal(database.version, 5)
  assert.deepEqual(['bookmarks', 'personalInfo', 'webcreds'].filter((s) => !database.stores.includes(s)), [])
  await phone.context.close()
})

test('vault and key QR codes show and close, and key protection is reused', async () => {
  const phone = await newPhone(browser, server.url, { noBiometrics: true })
  const { page } = phone
  await setUpWithPassword(phone)
  await addLogin(phone, 'qr.com', 'erin', 'erin-pw-8!')
  await phoneTab(page, 'sync')
  await page.click('#btn-share-vault')
  await fillDialog(page, [PASSWORD])
  await page.waitForSelector('#qr-overlay:not(.hidden) svg')
  await page.click('#btn-stop-share')
  assert.equal(await visible(page, '#qr-overlay'), false)
  await page.click('#btn-share-key')
  await fillDialog(page, [PASSWORD])
  await fillDialog(page, KEY_PROTECTION)
  await page.waitForSelector('#qr-overlay:not(.hidden) svg')
  await page.click('#btn-stop-share')
  await page.click('#btn-share-key')
  await fillDialog(page, [PASSWORD])
  await page.waitForSelector('#qr-overlay:not(.hidden) svg')
  await page.click('#btn-stop-share')
  assert.deepEqual(page.errors, [])
  await phone.context.close()
})

test('every tab fits the phone width', async () => {
  const phone = await newPhone(browser, server.url, { noBiometrics: true })
  const { page } = phone
  await setUpWithPassword(phone)
  for (const name of ['manage', 'personal', 'webcreds', 'bookmarks', 'sync', 'settings', 'guide', 'about']) {
    await phoneTab(page, name)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, name + ' overflows')
  }
  assert.deepEqual(page.errors, [])
  await phone.context.close()
})
