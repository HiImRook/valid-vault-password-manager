const GEN_MIN_CHOICES = [16, 20]
const GEN_MAX_CHOICES = [24, 32, 48, 64]
const GEN_DEFAULT_MIN = 16
const GEN_DEFAULT_MAX = 24
const GEN_CLASSES = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digit: '0123456789',
  special: '!@#$%^&*'
}

function randomInt(limit) {
  const range = 0x100000000
  const cap = range - (range % limit)
  const buf = new Uint32Array(1)
  while (true) {
    crypto.getRandomValues(buf)
    if (buf[0] < cap) return buf[0] % limit
  }
}

function shuffleChars(chars) {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    const t = chars[i]
    chars[i] = chars[j]
    chars[j] = t
  }
  return chars
}

function normalizePrefs(prefs) {
  const min = prefs && GEN_MIN_CHOICES.includes(prefs.min) ? prefs.min : GEN_DEFAULT_MIN
  const max = prefs && GEN_MAX_CHOICES.includes(prefs.max) ? prefs.max : GEN_DEFAULT_MAX
  return { min, max }
}

function generationPlan(prefs, style) {
  const p = normalizePrefs(prefs)
  const tierIndex = GEN_MAX_CHOICES.indexOf(p.max)
  const tierFloor = tierIndex > 0 ? GEN_MAX_CHOICES[tierIndex - 1] + 1 : p.min
  const span = Math.max(4, p.max - tierFloor)
  const lo = tierFloor
  const hi = Math.max(p.max, lo + span)
  let classes = ['upper', 'lower', 'digit', 'special'].map((k) => ({ required: true, chars: GEN_CLASSES[k] }))
  if (style === 'plain') classes = ['upper', 'lower', 'digit'].map((k) => ({ required: true, chars: GEN_CLASSES[k] }))
  return { lo, hi, classes }
}

function generatePassword(prefs, style) {
  const plan = generationPlan(prefs, style)
  const length = plan.lo + randomInt(plan.hi - plan.lo + 1)
  const pool = Array.from(new Set(plan.classes.map((c) => c.chars).join('').split(''))).join('')
  const chars = []
  for (const c of plan.classes) {
    if (c.required && chars.length < length) chars.push(c.chars[randomInt(c.chars.length)])
  }
  while (chars.length < length) chars.push(pool[randomInt(pool.length)])
  return shuffleChars(chars).join('')
}

export { GEN_MIN_CHOICES, GEN_MAX_CHOICES, GEN_DEFAULT_MIN, GEN_DEFAULT_MAX, normalizePrefs, generatePassword }
