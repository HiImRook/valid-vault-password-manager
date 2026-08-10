const FOUNTAIN_PREFIX = 'LVLT'
const CHUNK_BYTES = 700
const SEED_MODULUS = 2147483647
const SEED_MULTIPLIER = 48271

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

function stringToBytes(text) {
  return new TextEncoder().encode(text)
}

function bytesToString(bytes) {
  return new TextDecoder().decode(bytes)
}

function splitChunks(bytes) {
  const chunks = []
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) {
    const chunk = new Uint8Array(CHUNK_BYTES)
    chunk.set(bytes.slice(i, i + CHUNK_BYTES))
    chunks.push(chunk)
  }
  return chunks
}

function xorInto(target, source) {
  for (let i = 0; i < CHUNK_BYTES; i++) {
    target[i] = target[i] ^ source[i]
  }
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(text) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function createEncoder(payload) {
  const bytes = stringToBytes(payload)
  const chunks = splitChunks(bytes)
  const chunkCount = chunks.length
  const payloadLength = bytes.length
  let blockSeed = 1

  function nextFrame() {
    const seed = blockSeed
    blockSeed++
    const rng = makeRng(seed)
    const degree = solitonDegree(rng, chunkCount)
    const indices = pickChunks(rng, chunkCount, degree)

    const combined = new Uint8Array(CHUNK_BYTES)
    for (const index of indices) {
      xorInto(combined, chunks[index])
    }

    const header = FOUNTAIN_PREFIX + ':' + chunkCount + ':' + payloadLength + ':' + seed + ':'
    return header + bytesToBase64(combined)
  }

  return { nextFrame, chunkCount }
}

function parseFrame(frameText) {
  if (!frameText.startsWith(FOUNTAIN_PREFIX + ':')) {
    return { success: false, error: 'Not a fountain frame' }
  }
  const body = frameText.slice(FOUNTAIN_PREFIX.length + 1)
  const firstColon = body.indexOf(':')
  const secondColon = body.indexOf(':', firstColon + 1)
  const thirdColon = body.indexOf(':', secondColon + 1)

  const chunkCount = parseInt(body.slice(0, firstColon), 10)
  const payloadLength = parseInt(body.slice(firstColon + 1, secondColon), 10)
  const seed = parseInt(body.slice(secondColon + 1, thirdColon), 10)
  const data = base64ToBytes(body.slice(thirdColon + 1))

  return { success: true, chunkCount, payloadLength, seed, data }
}

function createDecoder() {
  const solved = new Map()
  const pending = []
  let chunkCount = null
  let payloadLength = null

  function reduce(indices, data) {
    let workingIndices = indices.slice()
    let workingData = new Uint8Array(data)

    let changed = true
    while (changed) {
      changed = false
      const remaining = []
      for (const index of workingIndices) {
        if (solved.has(index)) {
          xorInto(workingData, solved.get(index))
          changed = true
        } else {
          remaining.push(index)
        }
      }
      workingIndices = remaining
    }
    return { indices: workingIndices, data: workingData }
  }

  function propagate() {
    let progress = true
    while (progress) {
      progress = false
      for (let i = pending.length - 1; i >= 0; i--) {
        const reduced = reduce(pending[i].indices, pending[i].data)
        pending[i].indices = reduced.indices
        pending[i].data = reduced.data
        if (reduced.indices.length === 1) {
          const index = reduced.indices[0]
          if (!solved.has(index)) {
            solved.set(index, reduced.data)
            progress = true
          }
          pending.splice(i, 1)
        } else if (reduced.indices.length === 0) {
          pending.splice(i, 1)
        }
      }
    }
  }

  function addFrame(frameText) {
    const parsed = parseFrame(frameText)
    if (!parsed.success) return { success: false, error: parsed.error }

    if (chunkCount === null) {
      chunkCount = parsed.chunkCount
      payloadLength = parsed.payloadLength
    }

    const rng = makeRng(parsed.seed)
    const degree = solitonDegree(rng, chunkCount)
    const indices = pickChunks(rng, chunkCount, degree)

    pending.push({ indices, data: parsed.data })
    propagate()

    return { success: true, complete: solved.size === chunkCount, solved: solved.size, total: chunkCount }
  }

  function assemble() {
    if (chunkCount === null || solved.size !== chunkCount) {
      return { success: false, error: 'Incomplete' }
    }
    const full = new Uint8Array(chunkCount * CHUNK_BYTES)
    for (let i = 0; i < chunkCount; i++) {
      full.set(solved.get(i), i * CHUNK_BYTES)
    }
    return { success: true, payload: bytesToString(full.slice(0, payloadLength)) }
  }

  return { addFrame, assemble }
}

export { createEncoder, createDecoder, CHUNK_BYTES }
