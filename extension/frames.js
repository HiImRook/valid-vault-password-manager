const FRAME_PREFIX = 'LVF'
const MAX_FRAME_CHARS = 1200

function splitIntoFrames(payload) {
  const total = Math.ceil(payload.length / MAX_FRAME_CHARS)
  const frames = []
  for (let i = 0; i < total; i++) {
    const chunk = payload.slice(i * MAX_FRAME_CHARS, (i + 1) * MAX_FRAME_CHARS)
    frames.push(FRAME_PREFIX + ':' + (i + 1) + ':' + total + ':' + chunk)
  }
  return frames
}

function createFrameCollector() {
  const received = new Map()
  let expectedTotal = null

  function addFrame(frameText) {
    if (!frameText.startsWith(FRAME_PREFIX + ':')) {
      return { success: false, error: 'Not a Local Vault frame' }
    }
    const withoutPrefix = frameText.slice(FRAME_PREFIX.length + 1)
    const firstColon = withoutPrefix.indexOf(':')
    const secondColon = withoutPrefix.indexOf(':', firstColon + 1)
    const index = parseInt(withoutPrefix.slice(0, firstColon), 10)
    const total = parseInt(withoutPrefix.slice(firstColon + 1, secondColon), 10)
    const chunk = withoutPrefix.slice(secondColon + 1)

    if (expectedTotal === null) expectedTotal = total
    if (total !== expectedTotal) {
      return { success: false, error: 'Frame set mismatch' }
    }

    received.set(index, chunk)

    return {
      success: true,
      complete: received.size === expectedTotal,
      received: received.size,
      total: expectedTotal
    }
  }

  function assemble() {
    if (expectedTotal === null || received.size !== expectedTotal) {
      return { success: false, error: 'Incomplete frame set' }
    }
    let payload = ''
    for (let i = 1; i <= expectedTotal; i++) {
      if (!received.has(i)) return { success: false, error: 'Missing frame ' + i }
      payload += received.get(i)
    }
    return { success: true, payload }
  }

  return { addFrame, assemble }
}

export { splitIntoFrames, createFrameCollector, MAX_FRAME_CHARS }
