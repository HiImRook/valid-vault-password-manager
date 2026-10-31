import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup, seedLogins, revealLogins, fillDialog, settleDialogs } from './harness.mjs'

let server
let browser
let manage

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  const context = await newExtensionContext(browser)
  const popup = await setUpPopup(context, server.url)
  await seedLogins(popup)
  manage = await openPage(context, server.url + '/manage.html')
})

after(async () => {
  await browser.close()
  await server.close()
})

test('saved logins stay hidden until Manage is unlocked', async () => {
  assert.match(await manage.textContent('#credentials-list'), /Unlock to view credentials/)
})

test('unlocked logins show usernames, passwords, and extra fields', async () => {
  assert.equal(await revealLogins(manage), 'alice=alice-pw-1!,bob@mail.com=bob-pw-2!')
  const list = await manage.textContent('#credentials-list')
  assert.match(list, /PIN/)
  assert.match(list, /4321/)
})

test('editing a password saves the new one and keeps the old one as previous', async () => {
  const row = manage.locator('#credentials-list [data-cred-id]').filter({ hasText: 'alice' })
  await row.locator('.btn-edit').click()
  await fillDialog(manage, ['alice-new-5!'])
  await settleDialogs(manage, undefined, 3)
  await manage.reload()
  await manage.waitForTimeout(600)
  assert.equal(await revealLogins(manage), 'alice=alice-new-5!,bob@mail.com=bob-pw-2!')
  const tree = await manage.evaluate(async () => {
    const passwords = await import('/passwords.js')
    const t = await passwords.readVaultTree(await window.__testVaultKey())
    return t.credentials['site.com'].map((c) => !!c.previousPassword)
  })
  assert.deepEqual(tree, [true])
})

test('cancelling a delete keeps the login and uses the Valid Vault dialog', async () => {
  const row = manage.locator('#credentials-list [data-cred-id]').filter({ hasText: 'bob' })
  await row.locator('.btn-delete').click()
  await fillDialog(manage, [], 'cancel')
  await manage.waitForTimeout(500)
  assert.match(await manage.textContent('#credentials-list'), /bob@mail\.com/)
  assert.deepEqual(manage.nativeDialogs, [])
})

test('deleting a login removes it and leaves a tombstone for merging', async () => {
  const row = manage.locator('#credentials-list [data-cred-id]').filter({ hasText: 'bob' })
  await row.locator('.btn-delete').click()
  await settleDialogs(manage, undefined, 3)
  await manage.reload()
  await manage.waitForTimeout(600)
  assert.equal(await revealLogins(manage), 'alice=alice-new-5!')
  const tombstone = await manage.evaluate(async () => {
    const passwords = await import('/passwords.js')
    const t = await passwords.readVaultTree(await window.__testVaultKey())
    return t.credentials['other.org'].every((c) => c.deleted)
  })
  assert.equal(tombstone, true)
})

test('Manage raises no page errors', () => {
  assert.deepEqual(manage.errors, [])
})
