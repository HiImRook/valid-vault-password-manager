const BINARY_PREFIX = 'LVLT3'
const FOUNTAIN_PREFIX = 'LVLT2'
const HEADER_FIELDS = 5
const MAX_HEADER_BYTES = 80
const COLON = 58
const LEGACY_PREFIX = 'LVLT'
const CHUNK_BYTES = 400
const LEGACY_CHUNK_BYTES = 700
const MAX_CHUNK_BYTES = 4096
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024
const SEED_MODULUS = 2147483647
const SEED_MULTIPLIER = 48271
const MAX_INFLATED_BYTES = 32 * 1024 * 1024
const ENCODING_PLAIN = 'j'
const ENCODING_DEFLATE = 'z'
const COMPRESSION_FORMAT = 'deflate-raw'
const QR_FRAME_MS = 200
const DIGITS = /^[0-9]+$/
const MIX_STEP = 0x9e3779b9
const MIX_MULTIPLIER_A = 0x85ebca6b
const MIX_MULTIPLIER_B = 0xc2b2ae35
const UINT32_RANGE = 4294967296
const DENSE_PICK_CHANCE = 0.5

function makeRng(seed) {
  let state = seed % SEED_MODULUS
  if (state <= 0) state += SEED_MODULUS - 1
  return function next() {
    state = (state * SEED_MULTIPLIER) % SEED_MODULUS
    return state / SEED_MODULUS
  }
}

function solitonDegree(rng, chunkCount) {
  const pivot = 1 / chunkCount
  const roll = rng()
  if (roll < pivot) return 1
  let cumulative = pivot
  for (let d = 2; d <= chunkCount; d++) {
    cumulative += 1 / (d * (d - 1))
    if (roll < cumulative) return d
  }
  return chunkCount
}

function pickChunks(rng, chunkCount, degree) {
  const picked = new Set()
  while (picked.size < degree) {
    picked.add(Math.floor(rng() * chunkCount))
  }
  return Array.from(picked)
}

function makeMixedRng(seed) {
  let state = seed >>> 0
  return function next() {
    state = (state + MIX_STEP) >>> 0
    let z = state
    z = Math.imul(z ^ (z >>> 16), MIX_MULTIPLIER_A) >>> 0
    z = Math.imul(z ^ (z >>> 13), MIX_MULTIPLIER_B) >>> 0
    z = (z ^ (z >>> 16)) >>> 0
    return z / UINT32_RANGE
  }
}

function denseChunks(rng, chunkCount) {
  const picked = []
  for (let i = 0; i < chunkCount; i++) {
    if (rng() < DENSE_PICK_CHANCE) picked.push(i)
  }
  if (picked.length === 0) picked.push(Math.floor(rng() * chunkCount))
  return picked
}

function frameIndices(systematic, seed, chunkCount) {
  if (systematic) {
    if (seed <= chunkCount) return [seed - 1]
    return denseChunks(makeMixedRng(seed), chunkCount)
  }
  const rng = makeRng(seed)
  const degree = solitonDegree(rng, chunkCount)
  return pickChunks(rng, chunkCount, degree)
}

function stringToBytes(text) {
  return new TextEncoder().encode(text)
}

function bytesToString(bytes) {
  return new TextDecoder().decode(bytes)
}

function splitChunks(bytes, chunkBytes) {
  const chunks = []
  for (let i = 0; i < bytes.length; i += chunkBytes) {
    const chunk = new Uint8Array(chunkBytes)
    chunk.set(bytes.slice(i, i + chunkBytes))
    chunks.push(chunk)
  }
  return chunks
}

function xorInto(target, source) {
  for (let i = 0; i < target.length; i++) {
    target[i] = target[i] ^ source[i]
  }
}

function base64ToBytes(text) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function deflate(bytes) {
  if (typeof CompressionStream !== 'function') return null
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(COMPRESSION_FORMAT))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch (e) {
    return null
  }
}

async function inflate(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('This device cannot read compressed codes')
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(COMPRESSION_FORMAT)).getReader()
  const parts = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_INFLATED_BYTES) {
      try { await reader.cancel() } catch (e) {}
      throw new Error('Code is too large')
    }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

async function createEncoder(payload) {
  const plain = stringToBytes(payload)
  if (plain.length === 0) throw new Error('Nothing to send')
  const packed = await deflate(plain)
  const useDeflate = !!packed && packed.length < plain.length
  const bytes = useDeflate ? packed : plain
  const encoding = useDeflate ? ENCODING_DEFLATE : ENCODING_PLAIN
  const chunks = splitChunks(bytes, CHUNK_BYTES)
  const chunkCount = chunks.length
  const payloadLength = bytes.length
  let blockSeed = 1

  function nextFrame() {
    const seed = blockSeed
    blockSeed++
    const combined = new Uint8Array(CHUNK_BYTES)
    for (const index of frameIndices(true, seed, chunkCount)) {
      xorInto(combined, chunks[index])
    }
    const header = stringToBytes(BINARY_PREFIX + ':' + CHUNK_BYTES + ':' + encoding + ':' + chunkCount + ':' + payloadLength + ':' + seed + ':')
    const frame = new Uint8Array(header.length + combined.length)
    frame.set(header, 0)
    frame.set(combined, header.length)
    return frame
  }

  return { nextFrame, chunkCount }
}

function readInt(text) {
  if (!DIGITS.test(text)) return null
  const value = parseInt(text, 10)
  return Number.isSafeInteger(value) ? value : null
}

function startsWithAscii(bytes, text) {
  if (bytes.length < text.length) return false
  for (let i = 0; i < text.length; i++) if (bytes[i] !== text.charCodeAt(i)) return false
  return true
}

function parseBinaryFrame(bytes) {
  let colons = 0
  let end = -1
  const limit = Math.min(bytes.length, MAX_HEADER_BYTES)
  for (let i = 0; i < limit; i++) {
    if (bytes[i] !== COLON) continue
    colons++
    if (colons === HEADER_FIELDS + 1) { end = i; break }
  }
  if (end < 0) return { success: false, error: 'Damaged frame' }
  const parts = new TextDecoder().decode(bytes.subarray(0, end)).split(':')
  if (parts.length !== HEADER_FIELDS + 1 || parts[0] !== BINARY_PREFIX) return { success: false, error: 'Damaged frame' }
  const encoding = parts[2]
  if (encoding !== ENCODING_PLAIN && encoding !== ENCODING_DEFLATE) return { success: false, error: 'Damaged frame' }
  const chunkBytes = readInt(parts[1])
  const chunkCount = readInt(parts[3])
  const payloadLength = readInt(parts[4])
  const seed = readInt(parts[5])
  if (!chunkBytes || !chunkCount || !payloadLength || !seed) return { success: false, error: 'Damaged frame' }
  if (chunkBytes > MAX_CHUNK_BYTES || payloadLength > MAX_PAYLOAD_BYTES) return { success: false, error: 'Damaged frame' }
  if (chunkCount !== Math.ceil(payloadLength / chunkBytes)) return { success: false, error: 'Damaged frame' }
  const data = bytes.slice(end + 1)
  if (data.length !== chunkBytes) return { success: false, error: 'Damaged frame' }
  return { success: true, systematic: true, encoding, chunkBytes, chunkCount, payloadLength, seed, data }
}

function parseFrame(frame) {
  if (frame instanceof Uint8Array) {
    if (startsWithAscii(frame, BINARY_PREFIX + ':')) return parseBinaryFrame(frame)
    try { frame = new TextDecoder('utf-8', { fatal: true }).decode(frame) } catch (e) { return { success: false, error: 'Not a fountain frame' } }
  }
  const frameText = frame
  if (typeof frameText !== 'string') return { success: false, error: 'Not a fountain frame' }
  let systematic
  let encoding
  let parts
  if (frameText.startsWith(FOUNTAIN_PREFIX + ':')) {
    systematic = true
    parts = frameText.slice(FOUNTAIN_PREFIX.length + 1).split(':')
    if (parts.length !== 6) return { success: false, error: 'Damaged frame' }
    encoding = parts.splice(1, 1)[0]
    if (encoding !== ENCODING_PLAIN && encoding !== ENCODING_DEFLATE) return { success: false, error: 'Damaged frame' }
  } else if (frameText.startsWith(LEGACY_PREFIX + ':')) {
    systematic = false
    encoding = ENCODING_PLAIN
    parts = frameText.slice(LEGACY_PREFIX.length + 1).split(':')
    if (parts.length !== 4) return { success: false, error: 'Damaged frame' }
    parts.unshift(String(LEGACY_CHUNK_BYTES))
  } else {
    return { success: false, error: 'Not a fountain frame' }
  }
  const chunkBytes = readInt(parts[0])
  const chunkCount = readInt(parts[1])
  const payloadLength = readInt(parts[2])
  const seed = readInt(parts[3])
  if (!chunkBytes || !chunkCount || !payloadLength || !seed) return { success: false, error: 'Damaged frame' }
  if (chunkBytes > MAX_CHUNK_BYTES || payloadLength > MAX_PAYLOAD_BYTES) return { success: false, error: 'Damaged frame' }
  if (chunkCount !== Math.ceil(payloadLength / chunkBytes)) return { success: false, error: 'Damaged frame' }
  let data
  try { data = base64ToBytes(parts[4]) } catch (e) { return { success: false, error: 'Damaged frame' } }
  if (data.length !== chunkBytes) return { success: false, error: 'Damaged frame' }
  return { success: true, systematic, encoding, chunkBytes, chunkCount, payloadLength, seed, data }
}

function createDecoder() {
  const rows = new Map()
  const seenSeeds = new Set()
  let stream = null
  let words = 0
  let lowSeed = Infinity
  let highSeed = 0

  function maskFor(indices) {
    const mask = new Uint32Array(words)
    for (const index of indices) mask[index >>> 5] ^= (1 << (index & 31)) >>> 0
    return mask
  }

  function hasBit(mask, index) {
    return ((mask[index >>> 5] >>> (index & 31)) & 1) === 1
  }

  function xorMask(target, source) {
    for (let i = 0; i < target.length; i++) target[i] = (target[i] ^ source[i]) >>> 0
  }

  function addRow(mask, data) {
    for (let index = 0; index < stream.chunkCount; index++) {
      if (!hasBit(mask, index)) continue
      const row = rows.get(index)
      if (!row) {
        rows.set(index, { mask, data })
        return
      }
      xorMask(mask, row.mask)
      xorInto(data, row.data)
    }
  }

  function solve() {
    const solved = new Array(stream.chunkCount)
    for (let index = stream.chunkCount - 1; index >= 0; index--) {
      const row = rows.get(index)
      const data = new Uint8Array(row.data)
      for (let other = index + 1; other < stream.chunkCount; other++) {
        if (hasBit(row.mask, other)) xorInto(data, solved[other])
      }
      solved[index] = data
    }
    return solved
  }

  function status() {
    return { success: true, complete: rows.size === stream.chunkCount, solved: rows.size, total: stream.chunkCount, caught: seenSeeds.size, span: highSeed ? highSeed - lowSeed + 1 : 0 }
  }

  function addFrame(frame) {
    const parsed = parseFrame(frame)
    if (!parsed.success) return { success: false, error: parsed.error }

    if (stream === null) {
      stream = { systematic: parsed.systematic, encoding: parsed.encoding, chunkBytes: parsed.chunkBytes, chunkCount: parsed.chunkCount, payloadLength: parsed.payloadLength }
      words = Math.ceil(stream.chunkCount / 32)
    } else if (stream.systematic !== parsed.systematic || stream.encoding !== parsed.encoding || stream.chunkBytes !== parsed.chunkBytes || stream.chunkCount !== parsed.chunkCount || stream.payloadLength !== parsed.payloadLength) {
      return { success: false, error: 'Frame from a different code' }
    }

    if (seenSeeds.has(parsed.seed) || rows.size === stream.chunkCount) return status()
    seenSeeds.add(parsed.seed)
    if (parsed.seed < lowSeed) lowSeed = parsed.seed
    if (parsed.seed > highSeed) highSeed = parsed.seed

    addRow(maskFor(frameIndices(stream.systematic, parsed.seed, stream.chunkCount)), new Uint8Array(parsed.data))
    return status()
  }

  async function assemble() {
    if (stream === null || rows.size !== stream.chunkCount) {
      return { success: false, error: 'Incomplete' }
    }
    const solved = solve()
    const full = new Uint8Array(stream.chunkCount * stream.chunkBytes)
    for (let i = 0; i < stream.chunkCount; i++) {
      full.set(solved[i], i * stream.chunkBytes)
    }
    const bytes = full.slice(0, stream.payloadLength)
    if (stream.encoding === ENCODING_PLAIN) return { success: true, payload: bytesToString(bytes) }
    try {
      return { success: true, payload: bytesToString(await inflate(bytes)) }
    } catch (e) {
      return { success: false, error: 'That code could not be read. Scan it again.' }
    }
  }

  return { addFrame, assemble }
}

export { createEncoder, createDecoder, QR_FRAME_MS }
