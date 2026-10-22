import { readLoginCsv, readBookmarkHtml, readBookmarkTree, siteFromAddress, suggestAppSite } from './fileimport.js'
import { readLoginFile, MAX_FILE_BYTES } from './exportfiles.js'
import * as passwords from './passwords.js'
import * as bookmarks from './bookmarks.js'
import { formDialog, confirmDialog, choiceDialog } from './dialogs.js'

const ANY_FILE_ACCEPT = ''
const HTML_ACCEPT = '.html,.htm,text/html'
const HEADER_PREVIEW_CHARS = 28

function pickFile(accept, options) {
  const settings = options || {}
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(value)
    }
    input.onchange = () => {
      const f = input.files && input.files[0]
      if (!f) { done(null); return }
      if (settings.maxBytes && f.size > settings.maxBytes) { done({ tooLarge: true, name: f.name || '' }); return }
      const reader = new FileReader()
      reader.onload = () => {
        if (!(reader.result instanceof ArrayBuffer)) { done(null); return }
        const bytes = new Uint8Array(reader.result)
        done(settings.binary ? { bytes, name: f.name || '' } : { bytes, text: new TextDecoder('utf-8').decode(bytes), name: f.name || '' })
      }
      reader.onerror = () => done(null)
      reader.readAsArrayBuffer(f)
    }
    input.addEventListener('cancel', () => done(null))
    document.body.appendChild(input)
    input.click()
  })
}

function when(ms) {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function day(ms) {
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function count(n, one, many) {
  return n + ' ' + (n === 1 ? one : many)
}

function fileLabel(file) {
  return file && file.name ? file.name : 'the file you imported'
}

function deleteReminder(file, encrypted) {
  if (encrypted) return 'Delete ' + fileLabel(file) + ' now. Anyone who has it and its export password can read your passwords, and Valid Vault can\'t delete it for you.'
  return 'Delete ' + fileLabel(file) + ' now. It holds your passwords unencrypted, and Valid Vault can\'t delete it for you.'
}

function askFilePassword(label, open) {
  return formDialog({
    title: 'Open your ' + label + ' file',
    text: 'Enter the password you set when you exported this file. It is used once to open the file on this device and is never saved.',
    fields: [{ label: 'Export password', secret: true }],
    okLabel: 'Open',
    busyLabel: 'Opening...',
    validate: async (values) => {
      if (!values[0]) return { error: 'Enter the export password.', focus: 0 }
      try { return { value: await open(values[0]) } } catch (e) { return { error: e && e.message ? e.message : 'That file could not be opened.', focus: 0 } }
    }
  })
}

function appName(app) {
  return app.label && app.label !== app.app ? app.label : app.app
}

function askAppSite(app, position, total) {
  return formDialog({
    title: 'Which website is ' + appName(app) + ' for?',
    text: (total > 1 ? 'App ' + position + ' of ' + total + '. ' : '') + 'The file has a login for the app ' + app.app + ' with no website. Enter the site it belongs to. The login is saved under that site' + (app.linkable === false ? '. You removed this app\'s link before, so it stays unlinked.' : ', and the app is linked to it so it fills in the app too.'),
    fields: [{ label: 'Website', value: suggestAppSite(app.app, app.label), placeholder: 'example.com' }],
    okLabel: 'Use this site',
    cancelLabel: 'Skip this app',
    validate: (values) => {
      const where = siteFromAddress(values[0])
      if (!where.site) return { error: 'Enter a website, like example.com.', focus: 0 }
      if (where.site === app.app.toLowerCase()) return { error: 'That is the app\'s package name. Enter its website, like example.com.', focus: 0 }
      if (passwords.isPublicSuffix(where.site)) return { error: 'That is a shared domain ending. Enter the app\'s own website, like example.co.uk.', focus: 0 }
      return { value: where.site }
    }
  })
}

async function settleApps(parsed, masterKey) {
  const match = await passwords.matchImportedAppsFor(parsed.entries, parsed.apps || [], masterKey)
  const entries = parsed.entries.concat(match.resolved)
  const links = match.links.slice()
  let skippedApps = 0
  if (match.open.length === 0) return { entries, links, skippedApps }
  const groups = new Map()
  for (const app of match.open) {
    if (!groups.has(app.app)) groups.set(app.app, [])
    groups.get(app.app).push(app)
  }
  const choice = await choiceDialog({
    title: 'Match app logins to websites',
    text: count(match.open.length, 'login in the file belongs', 'logins in the file belong') + ' to ' + count(groups.size, 'app', 'apps') + ' with no website. Valid Vault keeps every login under a website, so each app needs its site. You can skip any of them.',
    choices: [
      { label: 'Skip them', value: 'skip', className: 'secondary' },
      { label: 'Match them', value: 'match' }
    ]
  })
  if (choice !== 'match') return { entries, links, skippedApps: match.open.length }
  let position = 0
  for (const [pkg, apps] of groups) {
    position++
    const site = await askAppSite(apps[0], position, groups.size)
    if (!site) { skippedApps += apps.length; continue }
    for (const app of apps) entries.push(Object.assign({}, app, { site }))
    if (apps[0].linkable !== false) links.push({ pkg, site })
  }
  return { entries, links, skippedApps }
}

async function askMapping(headers, guess) {
  const options = headers.map((header, i) => ({
    label: 'Column ' + (i + 1) + (header ? ': ' + (header.length > HEADER_PREVIEW_CHARS ? header.slice(0, HEADER_PREVIEW_CHARS) + '...' : header) : ''),
    value: i
  }))
  const values = await formDialog({
    title: 'Which columns are which?',
    text: 'Valid Vault did not recognize this file\'s columns. Pick the column that holds each part of a login.',
    fields: [
      { label: 'Website address', options, value: guess.site >= 0 ? guess.site : 0 },
      { label: 'Username', options: [{ label: 'No username column', value: -1 }].concat(options), value: guess.username },
      { label: 'Password', options, value: guess.password >= 0 ? guess.password : Math.min(1, options.length - 1) }
    ],
    okLabel: 'Continue',
    validate: (v) => {
      const site = Number(v[0])
      const username = Number(v[1])
      const password = Number(v[2])
      if (site === password) return { error: 'The website and password must be different columns.', focus: 2 }
      if (username === site || username === password) return { error: 'The username must be its own column.', focus: 1 }
      const chosen = [site, username, password]
      const mapping = Object.assign({}, guess, { site, username, password })
      for (const name of ['email', 'note', 'type', 'date', 'label']) {
        if (typeof mapping[name] !== 'number' || chosen.includes(mapping[name])) mapping[name] = -1
      }
      return { value: mapping }
    }
  })
  return values || null
}

function changedText(ms, missing) {
  return 'last changed ' + (ms ? when(ms) : missing)
}

function newerSide(a, b) {
  return a && b && a !== b ? (a > b ? 'current' : 'incoming') : null
}

function fileConflictDialog(conflict) {
  const a = conflict.current.changedAt
  const b = conflict.incoming.changedAt
  const newer = newerSide(a, b)
  return choiceDialog({
    title: conflict.site + (conflict.username ? ' · ' + conflict.username : ''),
    text: 'This login is in the file twice with different passwords. Pick the one that is current. The other one won\'t be imported.',
    fields: [
      { label: 'Earlier in the file' + (newer === 'current' ? ' (newer)' : '') + ', ' + changedText(a, 'not in this file'), secret: true, value: conflict.current.password },
      { label: 'Later in the file' + (newer === 'incoming' ? ' (newer)' : '') + ', ' + changedText(b, 'not in this file'), secret: true, value: conflict.incoming.password }
    ],
    cancelLabel: 'Stop import',
    escape: false,
    neutralFocus: true,
    choices: [
      { label: 'Keep earlier', value: 'current', className: 'secondary' },
      { label: 'Use later', value: 'incoming' }
    ]
  })
}

function vaultConflictDialog(conflict) {
  const a = conflict.current.changedAt
  const b = conflict.incoming.changedAt
  const newer = newerSide(a, b)
  const used = conflict.current.lastUsedAt ? when(conflict.current.lastUsedAt) : 'not recorded yet'
  return choiceDialog({
    title: conflict.site + (conflict.username ? ' · ' + conflict.username : ''),
    text: 'This login is in your vault and in the file with different passwords. Pick the one that is current.\n\nThe other is kept as the previous password for 30 days, until ' + day(conflict.previousUntil) + ', so you can switch back if you pick wrong.',
    fields: [
      { label: 'In your vault' + (newer === 'current' ? ' (newer)' : '') + ', ' + changedText(a, 'unknown') + ' · last used ' + used, secret: true, value: conflict.current.password },
      { label: 'From the file' + (newer === 'incoming' ? ' (newer)' : '') + ', ' + changedText(b, 'not in this file'), secret: true, value: conflict.incoming.password }
    ],
    cancelLabel: 'Stop import',
    escape: false,
    neutralFocus: true,
    choices: [
      { label: 'Keep vault\'s', value: 'current', className: 'secondary' },
      { label: 'Use the file\'s', value: 'incoming' }
    ]
  })
}

function conflictDialog(conflict) {
  return conflict.kind === 'file' ? fileConflictDialog(conflict) : vaultConflictDialog(conflict)
}

function skippedText(skipped, deleted, skippedApps) {
  const parts = []
  if (skipped.notLogin) parts.push(count(skipped.notLogin, 'item that isn\'t a login', 'items that aren\'t logins'))
  if (skipped.archived) parts.push(count(skipped.archived, 'archived item', 'archived items'))
  if (skipped.app) parts.push(count(skipped.app, 'app entry with no app name', 'app entries with no app name'))
  if (skippedApps) parts.push(count(skippedApps, 'app login you didn\'t match to a website', 'app logins you didn\'t match to a website'))
  if (skipped.missing) parts.push(count(skipped.missing, 'row missing a website or password', 'rows missing a website or password'))
  if (deleted) parts.push(count(deleted, 'login you deleted from your vault', 'logins you deleted from your vault'))
  return parts.length ? 'Skipped: ' + parts.join(', ') + '.' : ''
}

async function finishDialog(title, text) {
  await choiceDialog({ title, text, choices: [{ label: 'Done', value: true }] })
}

async function runPasswordImport({ masterKey, authorize, notify }) {
  if (!masterKey) { notify('Unlock first', 'error'); return null }
  const file = await pickFile(ANY_FILE_ACCEPT, { maxBytes: MAX_FILE_BYTES, binary: true })
  if (!file) { notify('No file selected', 'error'); return null }
  if (file.tooLarge) { notify('That file is too large to import.', 'error'); return null }
  let parsed
  try { parsed = await readLoginFile(file, askFilePassword) } catch (e) { notify(e && e.message ? e.message : 'That file could not be read.', 'error'); return null }
  if (!parsed) { notify('Import cancelled. Nothing changed.', 'info'); return null }
  const encrypted = !!parsed.encrypted
  const reminder = deleteReminder(file, encrypted)
  if (parsed.needsMapping) {
    const mapping = await askMapping(parsed.headers, parsed.mapping)
    if (!mapping) { notify('Import cancelled. Nothing changed. ' + reminder, 'info'); return null }
    const format = parsed.format
    parsed = readLoginCsv(parsed.csvText, mapping)
    if (format && !parsed.format) parsed.format = format
  }
  if (parsed.entries.length === 0 && (parsed.apps || []).length === 0) {
    notify('No logins found in ' + fileLabel(file) + '. ' + reminder, 'error')
    return null
  }
  if (!(await authorize())) return null
  const settled = await settleApps(parsed, masterKey)
  if (settled.entries.length === 0) {
    const skipped = skippedText(parsed.skipped, 0, settled.skippedApps)
    await finishDialog('Nothing to import', (skipped ? skipped + '\n\n' : '') + reminder)
    notify('Nothing imported. ' + reminder, 'info')
    return null
  }
  const preview = await passwords.previewLoginImportFor(settled.entries, masterKey, settled.links)
  const lines = []
  if (parsed.format) lines.push('This looks like a ' + parsed.format + ' export.')
  lines.push(count(preview.fresh, 'new login', 'new logins') + ', ' + count(preview.same, 'already saved', 'already saved') + ', ' + count(preview.conflicts, 'with a different password', 'with a different password') + '.')
  if (preview.links) lines.push(count(preview.links, 'app gets', 'apps get') + ' linked to its website, so its login fills in the app too.')
  const skipped = skippedText(parsed.skipped, preview.deleted, settled.skippedApps)
  if (skipped) lines.push(skipped)
  if (preview.fileDuplicates) lines.push(count(preview.fileDuplicates, 'login appears', 'logins appear') + ' in the file more than once with different passwords.')
  if (preview.conflicts || preview.fileDuplicates) lines.push('For each login with a different password, you\'ll see both and pick the current one.')
  if (preview.fresh === 0 && preview.conflicts === 0 && preview.links === 0) {
    await finishDialog('Nothing new to import', lines.join(' ') + '\n\n' + reminder)
    notify('Nothing new to import. ' + reminder, 'info')
    return null
  }
  const go = await confirmDialog({ title: 'Import passwords?', text: lines.join(' '), okLabel: 'Import' })
  if (!go) { notify('Import cancelled. Nothing changed. ' + reminder, 'info'); return null }
  const result = await passwords.importLogins(settled.entries, masterKey, conflictDialog, settled.links)
  if (result.cancelled) {
    notify('Import stopped. Nothing was saved. ' + reminder, 'info')
    return result
  }
  const summary = []
  if (result.added) summary.push('Added ' + count(result.added, 'new login', 'new logins') + '.')
  if (result.replaced) summary.push('Switched ' + count(result.replaced, 'login', 'logins') + ' to the file\'s password.')
  if (result.kept) summary.push('Kept your password for ' + count(result.kept, 'login', 'logins') + '.')
  if (result.replaced || result.kept) summary.push('The passwords you didn\'t pick are kept as previous passwords until ' + day(result.previousUntil) + '.')
  if (result.linked) summary.push('Linked ' + count(result.linked, 'app', 'apps') + ' to ' + (result.linked === 1 ? 'its website' : 'their websites') + '.')
  if (result.fileDuplicates) summary.push('Left out ' + count(result.fileDuplicates, 'repeated entry', 'repeated entries') + ' from the file that you didn\'t pick.')
  if (result.same) summary.push(count(result.same, 'login was', 'logins were') + ' already saved.')
  const skippedAfter = skippedText(parsed.skipped, result.deleted, settled.skippedApps)
  if (skippedAfter) summary.push(skippedAfter)
  await finishDialog('Import complete', summary.join(' ') + '\n\n' + reminder)
  notify((summary[0] || 'Import complete.') + ' ' + reminder, 'success')
  return result
}

async function importBookmarkEntries({ masterKey, authorize, notify, parsed, source, emptyText }) {
  if (parsed.entries.length === 0) {
    notify(emptyText, 'error')
    return null
  }
  if (!(await authorize())) return null
  const plan = await bookmarks.previewBookmarkImport(parsed.entries, masterKey)
  const parts = [count(plan.fresh.length, 'new bookmark', 'new bookmarks'), count(plan.existing, 'already saved', 'already saved')]
  if (plan.duplicates) parts.push(count(plan.duplicates, 'repeated', 'repeated'))
  if (plan.deleted) parts.push(count(plan.deleted, 'you deleted before', 'you deleted before'))
  if (parsed.skipped) parts.push(count(parsed.skipped, 'that isn\'t a web link', 'that aren\'t web links'))
  const text = 'Found ' + count(parsed.found, 'link', 'links') + ' in ' + source + ': ' + parts.join(', ') + '. Folders are combined into one list.'
  if (plan.fresh.length === 0) { notify('Nothing new to import. ' + text, 'info'); return null }
  const go = await confirmDialog({ title: 'Import bookmarks?', text, okLabel: 'Import' })
  if (!go) { notify('Import cancelled. Nothing changed.', 'info'); return null }
  const result = await bookmarks.importBookmarkList(parsed.entries, masterKey)
  notify('Imported ' + count(result.added, 'bookmark', 'bookmarks') + '.', 'success')
  return result
}

async function runBookmarkImport({ masterKey, authorize, notify }) {
  if (!masterKey) { notify('Unlock first', 'error'); return null }
  const file = await pickFile(HTML_ACCEPT)
  if (!file) { notify('No file selected', 'error'); return null }
  let parsed
  try { parsed = readBookmarkHtml(file.text) } catch (e) { notify(e && e.message ? e.message : 'That file could not be read.', 'error'); return null }
  return importBookmarkEntries({
    masterKey,
    authorize,
    notify,
    parsed,
    source: fileLabel(file),
    emptyText: 'No bookmarks found in ' + fileLabel(file) + '. Export your bookmarks from your browser as an HTML file, then import that file.'
  })
}

async function runBrowserBookmarkImport({ masterKey, authorize, notify, tree }) {
  if (!masterKey) { notify('Unlock first', 'error'); return null }
  return importBookmarkEntries({
    masterKey,
    authorize,
    notify,
    parsed: readBookmarkTree(tree),
    source: 'this browser',
    emptyText: 'This browser has no bookmarks to import.'
  })
}

export { runPasswordImport, runBookmarkImport, runBrowserBookmarkImport, pickFile }
