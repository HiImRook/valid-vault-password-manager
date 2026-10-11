import QRCode from './qrcode.js'

const CAMERA_IDEAL_WIDTH = 1280
const CAMERA_IDEAL_HEIGHT = 720
const MAX_SCAN_SIDE = 960
const QUIET_MODULES = 4
const QR_ECL = 'M'

function qrSvg(text) {
  const modules = new QRCode({ content: text, padding: 0, ecl: QR_ECL }).qrcode.modules
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

function readCode(video, canvas, ctx) {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return null
  const side = Math.min(width, height)
  const out = Math.min(side, MAX_SCAN_SIDE)
  if (canvas.width !== out) canvas.width = out
  if (canvas.height !== out) canvas.height = out
  ctx.drawImage(video, (width - side) / 2, (height - side) / 2, side, side, 0, 0, out, out)
  const img = ctx.getImageData(0, 0, out, out)
  const code = window.jsQR(img.data, out, out, { inversionAttempts: 'dontInvert' })
  return code && code.data ? code.data : null
}

export { qrSvg, openCamera, readCode }
