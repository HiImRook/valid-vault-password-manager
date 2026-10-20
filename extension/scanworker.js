if (typeof self.jsQR !== 'function') importScripts('jsqr.js')

self.onmessage = (event) => {
  const job = event.data || {}
  let bytes = null
  try {
    const code = self.jsQR(new Uint8ClampedArray(job.buffer), job.width, job.height, { inversionAttempts: 'dontInvert' })
    bytes = code && code.binaryData && code.binaryData.length ? Uint8Array.from(code.binaryData) : null
  } catch (e) {
    bytes = null
  }
  self.postMessage({ id: job.id, bytes }, bytes ? [bytes.buffer] : [])
}
