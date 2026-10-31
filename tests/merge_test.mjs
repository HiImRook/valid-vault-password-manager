import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, startServer, launchBrowser, newExtensionContext, openPage } from './harness.mjs'

const TIE = 1700000000000

let server
let browser
let page

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  const context = await newExtensionContext(browser)
  page = await openPage(context, server.url + '/popup.html')
})

after(async () => {
  await browser.close()
  await server.close()
})

test('a login deleted on one device and edited on another in the same millisecond stays deleted', async () => {
  const result = await page.evaluate(async (stamp) => {
    const { laterRecord } = await import('/passwords.js')
    const edited = { id: 'login-1', username: 'alice', password: 'edited-pw', updatedAt: stamp }
    const deleted = { id: 'login-1', deleted: true, updatedAt: stamp }
    return [laterRecord(edited, deleted).deleted === true, laterRecord(deleted, edited).deleted === true]
  }, TIE)
  assert.deepEqual(result, [true, true])
})

test('a newer login edit still beats an older delete', async () => {
  const result = await page.evaluate(async (stamp) => {
    const { laterRecord } = await import('/passwords.js')
    const edited = { id: 'login-1', username: 'alice', password: 'edited-pw', updatedAt: stamp + 1 }
    const deleted = { id: 'login-1', deleted: true, updatedAt: stamp }
    return [laterRecord(edited, deleted).password, laterRecord(deleted, edited).password]
  }, TIE)
  assert.deepEqual(result, ['edited-pw', 'edited-pw'])
})

test('a bookmark deleted on one device and renamed on another in the same millisecond stays deleted', async () => {
  const result = await page.evaluate(async (stamp) => {
    const { mergeTrees } = await import('/bookmarks.js')
    const meta = { version: 1, createdAt: stamp, lastAccess: stamp }
    const renamed = { meta, items: [{ id: 'bm-1', url: 'https://news.example.com/', title: 'Renamed', updatedAt: stamp }] }
    const deleted = { meta, items: [{ id: 'bm-1', url: 'https://news.example.com/', deleted: true, updatedAt: stamp }] }
    return [mergeTrees(renamed, deleted).items[0].deleted === true, mergeTrees(deleted, renamed).items[0].deleted === true]
  }, TIE)
  assert.deepEqual(result, [true, true])
})

test('a newer bookmark rename still beats an older delete', async () => {
  const result = await page.evaluate(async (stamp) => {
    const { mergeTrees } = await import('/bookmarks.js')
    const meta = { version: 1, createdAt: stamp, lastAccess: stamp }
    const renamed = { meta, items: [{ id: 'bm-1', url: 'https://news.example.com/', title: 'Renamed', updatedAt: stamp + 1 }] }
    const deleted = { meta, items: [{ id: 'bm-1', url: 'https://news.example.com/', deleted: true, updatedAt: stamp }] }
    return [mergeTrees(renamed, deleted).items[0].title, mergeTrees(deleted, renamed).items[0].title]
  }, TIE)
  assert.deepEqual(result, ['Renamed', 'Renamed'])
})

test('the merge checks raise no page errors', () => {
  assert.deepEqual(page.errors, [])
})
