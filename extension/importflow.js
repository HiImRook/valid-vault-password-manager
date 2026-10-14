import { readLoginCsv, readBookmarkHtml, readBookmarkTree } from './fileimport.js'
import * as passwords from './passwords.js'
import * as bookmarks from './bookmarks.js'
import { formDialog, confirmDialog, choiceDialog } from './dialogs.js'

const CSV_ACCEPT = '.csv,text/csv,text/comma-separated-values,application/vnd.ms-excel,text/plain'
const HTML_ACCEPT = '.html,.htm,text/html'
const HEADER_PREVIEW_CHARS = 28

function pickFile(accept) {
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
      const reader = new FileReader()
      reader.onload = () => done(typeof reader.result === 'string' ? { text: reader.result, name: f.name || '' } : null)
      reader.onerror = () => done(null)
      reader.readAsText(f)
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

function deleteReminder(file) {
  return 'Delete ' + fileLabel(file) + ' now. It holds your passwords unencrypted, and Valid Vault can\'t delete it for you.'
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
      for (const name of ['email', 'note', 'type', 'date']) {
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

function skippedText(skipped, deleted) {
  const parts = []
  if (skipped.notLogin) parts.push(count(skipped.notLogin, 'item that isn\'t a login', 'items that aren\'t logins'))
  if (skipped.app) parts.push(count(skipped.app, 'app entry', 'app entries'))
  if (skipped.missing) parts.push(count(skipped.missing, 'row missing a website or password', 'rows missing a website or password'))
  if (deleted) parts.push(count(deleted, 'login you deleted from your vault', 'logins you deleted from your vault'))
  return parts.length ? 'Skipped: ' + parts.join(', ') + '.' : ''
}

async function finishDialog(title, text) {
  await choiceDialog({ title, text, choices: [{ label: 'Done', value: true }] })
}

async function runPasswordImport({ masterKey, authorize, notify }) {
  if (!masterKey) { notify('Unlock first', 'error'); return null }
  const file = await pickFile(CSV_ACCEPT)
  if (!file) { notify('No file selected', 'error'); return null }
  let parsed
  try { parsed = readLoginCsv(file.text) } catch (e) { notify(e && e.message ? e.message : 'That file could not be read.', 'error'); return null }
  if (parsed.needsMapping) {
    const mapping = await askMapping(parsed.headers, parsed.mapping)
    if (!mapping) { notify('Import cancelled. Nothing changed. ' + deleteReminder(file), 'info'); return null }
    parsed = readLoginCsv(file.text, mapping)
  }
  if (parsed.entries.length === 0) {
    notify('No logins found in ' + fileLabel(file) + '. ' + deleteReminder(file), 'error')
    return null
  }
  if (!(await authorize())) return null
  const preview = await passwords.previewLoginImportFor(parsed.entries, masterKey)
  const lines = []
  if (parsed.format) lines.push('This looks like a ' + parsed.format + ' export.')
  lines.push(count(preview.fresh, 'new login', 'new logins') + ', ' + count(preview.same, 'already saved', 'already saved') + ', ' + count(preview.conflicts, 'with a different password', 'with a different password') + '.')
  const skipped = skippedText(parsed.skipped, preview.deleted)
  if (skipped) lines.push(skipped)
  if (preview.fileDuplicates) lines.push(count(preview.fileDuplicates, 'login appears', 'logins appear') + ' in the file more than once with different passwords.')
  if (preview.conflicts || preview.fileDuplicates) lines.push('For each login with a different password, you\'ll see both and pick the current one.')
  if (preview.fresh === 0 && preview.conflicts === 0) {
    await finishDialog('Nothing new to import', lines.join(' ') + '\n\n' + deleteReminder(file))
    notify('Nothing new to import. ' + deleteReminder(file), 'info')
    return null
  }
  const go = await confirmDialog({ title: 'Import passwords?', text: lines.join(' '), okLabel: 'Import' })
  if (!go) { notify('Import cancelled. Nothing changed. ' + deleteReminder(file), 'info'); return null }
  const result = await passwords.importLogins(parsed.entries, masterKey, conflictDialog)
  if (result.cancelled) {
    notify('Import stopped. Nothing was saved. ' + deleteReminder(file), 'info')
    return result
  }
  const summary = []
  if (result.added) summary.push('Added ' + count(result.added, 'new login', 'new logins') + '.')
  if (result.replaced) summary.push('Switched ' + count(result.replaced, 'login', 'logins') + ' to the file\'s password.')
  if (result.kept) summary.push('Kept your password for ' + count(result.kept, 'login', 'logins') + '.')
  if (result.replaced || result.kept) summary.push('The passwords you didn\'t pick are kept as previous passwords until ' + day(result.previousUntil) + '.')
  if (result.fileDuplicates) summary.push('Left out ' + count(result.fileDuplicates, 'repeated entry', 'repeated entries') + ' from the file that you didn\'t pick.')
  if (result.same) summary.push(count(result.same, 'login was', 'logins were') + ' already saved.')
  const skippedAfter = skippedText(parsed.skipped, result.deleted)
  if (skippedAfter) summary.push(skippedAfter)
  await finishDialog('Import complete', summary.join(' ') + '\n\n' + deleteReminder(file))
  notify((summary[0] || 'Import complete.') + ' ' + deleteReminder(file), 'success')
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
