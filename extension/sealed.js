const IV_LENGTH = 12
const BASE64_CHUNK = 32768

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(text) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function streamBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function sealJson(value, key) {
  const plain = new TextEncoder().encode(JSON.stringify(value))
  const compressed = await streamBytes(plain, new CompressionStream('deflate'))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed))
  return { iv: bytesToBase64(iv), data: bytesToBase64(ciphertext) }
}

async function openJson(blob, key) {
  const iv = base64ToBytes(blob.iv)
  const ciphertext = base64ToBytes(blob.data)
  const compressed = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext))
  const plain = await streamBytes(compressed, new DecompressionStream('deflate'))
  return JSON.parse(new TextDecoder().decode(plain))
}

export { sealJson, openJson }
