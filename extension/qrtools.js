import QRCode from './qrcode.js'

const CAMERA_IDEAL_WIDTH = 1280
const CAMERA_IDEAL_HEIGHT = 720
const MAX_SCAN_SIDE = 960
const QUIET_MODULES = 4
const QR_ECL = 'M'
const READER_MAX_WORKERS = 3
const READER_WINDOW_MS = 3000
const READER_WHOLE_EVERY = 2

function qrSvg(frame) {
  const options = frame instanceof Uint8Array ? { bytes: frame, padding: 0, ecl: QR_ECL } : { content: frame, padding: 0, ecl: QR_ECL }
  const modules = new QRCode(options).qrcode.modules
  const count = modules.length
  let path = ''
  for (let row = 0; row < count; row++) {
    let col = 0
    while (col < count) {
      if (!modules[row][col]) { col++; continue }
      let end = col
      while (end < count && modules[row][end]) end++
      path += 'M' + col + ' ' + row + 'h' + (end - col) + 'v1h-' + (end - col) + 'z'
      col = end
    }
  }
  const size = count + QUIET_MODULES * 2
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (-QUIET_MODULES) + ' ' + (-QUIET_MODULES) + ' ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
    '<rect x="' + (-QUIET_MODULES) + '" y="' + (-QUIET_MODULES) + '" width="' + size + '" height="' + size + '" fill="#ffffff"/>' +
    '<path d="' + path + '" fill="#000000"/></svg>'
}

async function openCamera() {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: CAMERA_IDEAL_WIDTH }, height: { ideal: CAMERA_IDEAL_HEIGHT } }
    })
  } catch (e) {
    if (!e || (e.name !== 'OverconstrainedError' && e.name !== 'ConstraintNotSatisfiedError')) throw e
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  }
  try {
    const track = stream.getVideoTracks()[0]
    const caps = track && track.getCapabilities ? track.getCapabilities() : null
    if (caps && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
    }
  } catch (e) {}
  return stream
}

function grabFrame(video, canvas, ctx, whole) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return null
  const sw = whole ? width : Math.min(width, height)
  const sh = whole ? height : Math.min(width, height)
  const scale = Math.min(1, Math.sqrt(MAX_SCAN_SIDE * MAX_SCAN_SIDE / (sw * sh)))
  const ow = Math.round(sw * scale)
  const oh = Math.round(sh * scale)
  if (canvas.width !== ow) canvas.width = ow
  if (canvas.height !== oh) canvas.height = oh
  ctx.drawImage(video, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, ow, oh)
  return ctx.getImageData(0, 0, ow, oh)
}

function readBytes(img) {
  const code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
  return code && code.binaryData && code.binaryData.length ? Uint8Array.from(code.binaryData) : null
}

function workerCount() {
  const cores = navigator.hardwareConcurrency || 2
  return Math.max(1, Math.min(READER_MAX_WORKERS, cores - 1))
}

function scanStream(video, makeWorker, onFrame) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const workers = []
  const pending = new Map()
  const recent = []
  let stopped = false
  let handle = null
  let byVideo = false
  let nextId = 1
  let lastFrame = -1
  let turn = 0
  if (typeof makeWorker === 'function' && typeof Worker === 'function') {
    for (let i = 0; i < workerCount(); i++) {
      try {
        const worker = makeWorker()
        const slot = { worker, busy: false }
        worker.onmessage = (event) => {
          slot.busy = false
          const result = event.data || {}
          pending.delete(result.id)
          if (!stopped && result.bytes) onFrame(result.bytes)
        }
        worker.onerror = () => { slot.busy = false }
        workers.push(slot)
      } catch (e) {}
    }
  }

  function note() {
    const now = performance.now()
    recent.push(now)
    while (recent.length && now - recent[0] > READER_WINDOW_MS) recent.shift()
  }

  function attempt() {
    if (stopped || video.readyState < video.HAVE_CURRENT_DATA) return
    if (workers.length) {
      const slot = workers.find((w) => !w.busy)
      if (!slot) return
      const img = grabFrame(video, canvas, ctx, turn++ % READER_WHOLE_EVERY === READER_WHOLE_EVERY - 1)
      if (!img) return
      const id = nextId++
      slot.busy = true
      pending.set(id, slot)
      note()
      slot.worker.postMessage({ id, buffer: img.data.buffer, width: img.width, height: img.height }, [img.data.buffer])
      return
    }
    if (typeof window.jsQR !== 'function') return
    const img = grabFrame(video, canvas, ctx, turn++ % READER_WHOLE_EVERY === READER_WHOLE_EVERY - 1)
    if (!img) return
    note()
    let bytes = null
    try { bytes = readBytes(img) } catch (e) {}
    if (bytes) onFrame(bytes)
  }

  function schedule() {
    if (stopped) return
    if (typeof video.requestVideoFrameCallback === 'function') {
      byVideo = true
      handle = video.requestVideoFrameCallback((now, meta) => {
        const frame = meta && typeof meta.presentedFrames === 'number' ? meta.presentedFrames : -1
        if (frame === -1 || frame !== lastFrame) {
          lastFrame = frame
          attempt()
        }
        schedule()
      })
    } else {
      byVideo = false
      handle = requestAnimationFrame(() => {
        attempt()
        schedule()
      })
    }
  }

  schedule()

  return {
    rate() {
      const now = performance.now()
      while (recent.length && now - recent[0] > READER_WINDOW_MS) recent.shift()
      return recent.length * 1000 / READER_WINDOW_MS
    },
    workers: workers.length,
    stop() {
      stopped = true
      try {
        if (handle !== null && byVideo) video.cancelVideoFrameCallback(handle)
        else if (handle !== null) cancelAnimationFrame(handle)
      } catch (e) {}
      for (const slot of workers) {
        try { slot.worker.terminate() } catch (e) {}
      }
      workers.length = 0
      pending.clear()
    }
  }
}

function scanReadout(outcome, reader) {
  const parts = ['Receiving ' + outcome.solved + ' of ' + outcome.total]
  if (outcome.span > 1) parts.push('catching ' + Math.round(100 * outcome.caught / outcome.span) + '%')
  if (reader) parts.push(Math.round(reader.rate()) + ' reads/s')
  return parts.join(' \u00b7 ')
}

export { qrSvg, openCamera, scanStream, scanReadout }
