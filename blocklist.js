#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = __dirname
const OUTPUT_DIR = path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'browser')
const OUTPUT = path.join(OUTPUT_DIR, 'easylist-domains.txt')
const NOTICE = path.join(OUTPUT_DIR, 'EASYLIST-NOTICE.txt')
const BLOCK_SOURCES = [
  'easyprivacy/easyprivacy_trackingservers.txt',
  'easyprivacy/easyprivacy_trackingservers_admiral.txt',
  'easyprivacy/easyprivacy_trackingservers_general.txt',
  'easyprivacy/easyprivacy_trackingservers_international.txt',
  'easyprivacy/easyprivacy_trackingservers_mining.txt',
  'easyprivacy/easyprivacy_trackingservers_notifications.txt',
  'easyprivacy/easyprivacy_trackingservers_thirdparty.txt',
  'easylist/easylist_adservers.txt'
]
const ALLOW_SOURCES = [
  'easyprivacy/easyprivacy_allowlist.txt',
  'easylist/easylist_allowlist.txt'
]
const BLOCK_RULE = /^\|\|([a-z0-9][a-z0-9.-]*\.[a-z0-9-]+)\^(\$third-party)?$/
const ALLOW_RULE = /^@@\|\|([a-z0-9][a-z0-9.-]*\.[a-z0-9-]+)\^(\$third-party)?$/
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

function fail(message) {
  console.error('blocklist.js: ' + message)
  process.exit(1)
}

function readRules(base, files, pattern) {
  const found = new Set()
  for (const file of files) {
    const full = path.join(base, file)
    if (!fs.existsSync(full)) fail('missing ' + file)
    for (const raw of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      const match = pattern.exec(raw.trim())
      if (match && !IPV4.test(match[1])) found.add(match[1])
    }
  }
  return found
}

function commitOf(base) {
  try {
    return execFileSync('git', ['-C', base, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch (e) {
    return 'unknown'
  }
}

const source = process.argv[2]
if (!source) fail('usage: node blocklist.js <path to a clone of github.com/easylist/easylist>')
const base = path.resolve(source)
const blocked = readRules(base, BLOCK_SOURCES, BLOCK_RULE)
const allowed = readRules(base, ALLOW_SOURCES, ALLOW_RULE)
for (const domain of allowed) blocked.delete(domain)
const lines = [...blocked].sort().concat([...allowed].sort().map(domain => '@@' + domain))
fs.mkdirSync(OUTPUT_DIR, { recursive: true })
fs.writeFileSync(OUTPUT, lines.join('\n') + '\n')
const notice = [
  'easylist-domains.txt',
  '',
  'Domain entries extracted from EasyList and EasyPrivacy.',
  'Source: The EasyList authors (https://easylist.to/)',
  'Repository: https://github.com/easylist/easylist',
  'Commit: ' + commitOf(base),
  'Files: ' + BLOCK_SOURCES.concat(ALLOW_SOURCES).join(', '),
  '',
  'This file is licensed separately from Valid Vault, under the same terms as its source:',
  'GNU General Public License version 3 or later, or',
  'Creative Commons Attribution-ShareAlike 3.0 Unported or later.',
  'https://easylist.to/pages/licence.html',
  '',
  'Changes: only plain domain rules were kept, other rule types were dropped, and the entries were sorted.',
  'Lines starting with @@ are exceptions taken from the allowlists.',
  ''
]
fs.writeFileSync(NOTICE, notice.join('\n'))
console.log('blocklist.js: ' + blocked.size + ' blocked, ' + allowed.size + ' exceptions')
