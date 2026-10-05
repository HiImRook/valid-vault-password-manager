import { generateSalt, deriveKeyFromSecret, wrapMasterKey, unwrapMasterKey } from './crypto.js'
import { getAuth, setAuth } from './store.js'

const KEY_FILE_FORMAT = 'valid-vault-key'
const KEY_FILE_VERSION = 1
const EXPORT_ITERATIONS = 1000000
const MIN_PASSPHRASE_LENGTH = 12
const MIN_UNIQUE_CHARS = 6
const QUESTION_COUNT = 3
const DEFAULT_NICKNAME = 'My Master Key'

const SECURITY_QUESTIONS = [
  'Name of your first pet', 'Name of your favorite childhood toy', 'Your favorite childhood book',
  'Your mothers middle name', 'Name of your first school', 'Your childhood best friend first name',
  'Make of your first car', 'Name of your first employer', 'Your favorite childhood teacher last name',
  'The street you grew up on'
]

const COMMON_BASES = new Set([
  'password', 'passwort', 'passw', 'pass', 'qwerty', 'qwertyuiop', 'qwertz', 'azerty', 'asdf', 'asdfgh', 'asdfghjkl',
  'zxcvbn', 'zxcvbnm', 'qazwsx', 'qwer', 'abc', 'abcd', 'abcdef', 'abcdefg', 'abcdefgh', 'abcabc', 'aaa', 'aaaa',
  'letmein', 'welcome', 'welcomeback', 'admin', 'administrator', 'root', 'user', 'login', 'guest', 'test', 'tester',
  'iloveyou', 'loveyou', 'love', 'lovely', 'monkey', 'dragon', 'football', 'baseball', 'basketball', 'soccer',
  'hockey', 'sunshine', 'princess', 'master', 'shadow', 'superman', 'batman', 'spiderman', 'trustno', 'trustnoone',
  'freedom', 'whatever', 'hello', 'helloworld', 'secret', 'secure', 'security', 'default', 'changeme', 'letmeinnow',
  'starwars', 'pokemon', 'michael', 'jennifer', 'jordan', 'hunter', 'ranger', 'buster', 'thomas', 'robert',
  'charlie', 'daniel', 'jessica', 'ashley', 'andrew', 'joshua', 'matthew', 'michelle', 'nicole', 'summer',
  'winter', 'autumn', 'spring', 'flower', 'cookie', 'cheese', 'chocolate', 'computer', 'internet', 'google',
  'facebook', 'instagram', 'twitter', 'youtube', 'minecraft', 'fortnite', 'roblox', 'bitcoin', 'crypto', 'ethereum',
  'wallet', 'vault', 'validvault', 'localvault', 'mypassword', 'mypass', 'newpassword', 'oldpassword', 'passphrase',
  'mysecret', 'blink', 'killer', 'pepper', 'ginger', 'tigger', 'purple', 'orange', 'yellow', 'silver', 'golden',
  'diamond', 'angel', 'heaven', 'jesus', 'christ', 'god', 'lucky', 'money', 'family', 'forever', 'friends',
  'princesa', 'mustang', 'harley', 'corvette', 'ferrari', 'mercedes', 'yankees', 'cowboys', 'eagles', 'lakers',
  'maverick', 'phoenix', 'matrix', 'ninja', 'pirate', 'zombie', 'gamer', 'player', 'access', 'unlock', 'open',
  'sesame', 'opensesame', 'nothing', 'none', 'blank', 'temp', 'temporary', 'qwerasdf', 'zaq', 'zaqxsw', 'xsw'
])

const LEET_MAP = { '@': 'a', '4': 'a', '8': 'b', '3': 'e', '6': 'g', '1': 'i', '!': 'i', '|': 'l', '0': 'o', '$': 's', '5': 's', '7': 't', '2': 'z' }

function pickThreeQuestions() {
  const pool = SECURITY_QUESTIONS.map((q, i) => i)
  const picked = []
  for (let i = 0; i < QUESTION_COUNT; i++) {
    const r = crypto.getRandomValues(new Uint32Array(1))[0] % pool.length
    picked.push(pool[r])
    pool.splice(r, 1)
  }
  return picked
}

function combineSecret(passphrase, qIdx, answers) {
  const parts = [passphrase]
  for (let i = 0; i < qIdx.length; i++) parts.push(String(qIdx[i]) + ':' + answers[i])
  return parts.join('\u0000')
}

function coreVariants(text) {
  const core = String(text).toLowerCase().replace(/^[^a-z@$]+/, '').replace(/[^a-z]+$/, '')
  const leet = core.split('').map((c) => LEET_MAP[c] || c).join('').replace(/[^a-z]/g, '')
  const plain = core.replace(/[^a-z]/g, '')
  return [leet, plain]
}

function isRepeatOfCommon(letters) {
  for (let size = 1; size <= letters.length / 2; size++) {
    if (letters.length % size !== 0) continue
    const unit = letters.slice(0, size)
    if (unit.repeat(letters.length / size) === letters && (COMMON_BASES.has(unit) || size <= 3)) return true
  }
  return false
}

function passphraseProblem(pass) {
  if (!pass || pass.length < MIN_PASSPHRASE_LENGTH) return 'Use at least ' + MIN_PASSPHRASE_LENGTH + ' characters.'
  if (!/[a-zA-Z]/.test(pass) || !/[0-9]/.test(pass) || !/[^a-zA-Z0-9]/.test(pass)) return 'Include a letter, a number, and a symbol.'
  if (new Set(pass.toLowerCase()).size < MIN_UNIQUE_CHARS) return 'Too many repeated characters. Try four or more random words.'
  for (const letters of coreVariants(pass)) {
    if (letters.length < 4 || COMMON_BASES.has(letters) || isRepeatOfCommon(letters)) return 'That passphrase is too common and would be guessed quickly. Try four or more random words.'
  }
  return null
}

async function keyIdFor(masterKey) {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', masterKey))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw))
  return Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function isKeyPackage(obj) {
  return !!obj && obj.format === KEY_FILE_FORMAT && Array.isArray(obj.questions) && obj.questions.length === QUESTION_COUNT &&
    obj.questions.every((q) => Number.isInteger(q) && q >= 0 && q < SECURITY_QUESTIONS.length) &&
    Array.isArray(obj.salt) && !!obj.wrapped && typeof obj.wrapped === 'object'
}

async function buildPackage(masterKey, passphrase, qIdx, answers, nickname) {
  const secret = combineSecret(passphrase, qIdx, answers)
  const salt = await generateSalt()
  const wrapKey = await deriveKeyFromSecret(secret, salt, EXPORT_ITERATIONS)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', masterKey))
  const wrapped = await wrapMasterKey(raw, wrapKey)
  return {
    format: KEY_FILE_FORMAT,
    version: KEY_FILE_VERSION,
    nickname: nickname || DEFAULT_NICKNAME,
    questions: qIdx.slice(),
    salt: Array.from(salt),
    iterations: EXPORT_ITERATIONS,
    wrapped
  }
}

async function openPackage(pkg, passphrase, answers) {
  const secret = combineSecret(passphrase, pkg.questions, answers)
  const wrapKey = await deriveKeyFromSecret(secret, new Uint8Array(pkg.salt), pkg.iterations || EXPORT_ITERATIONS)
  return unwrapMasterKey(pkg.wrapped, wrapKey)
}

async function getSavedPackage(masterKey) {
  const authRec = await getAuth()
  if (!authRec || !authRec.keyPackage || !authRec.keyPackageId) return null
  if (authRec.keyPackageId !== await keyIdFor(masterKey)) return null
  return isKeyPackage(authRec.keyPackage) ? authRec.keyPackage : null
}

async function savePackage(masterKey, pkg) {
  const authRec = await getAuth() || {}
  authRec.keyPackage = pkg
  authRec.keyPackageId = await keyIdFor(masterKey)
  await setAuth(authRec)
}

async function getNickname() {
  const authRec = await getAuth() || {}
  return (authRec.keyNickname || '').trim() || DEFAULT_NICKNAME
}

export {
  SECURITY_QUESTIONS,
  pickThreeQuestions,
  passphraseProblem,
  isKeyPackage,
  buildPackage,
  openPackage,
  getSavedPackage,
  savePackage,
  getNickname
}
