(function () {
  const b64 = (buf) => { const a = new Uint8Array(buf); let s = ''; for (const x of a) s += String.fromCharCode(x); return btoa(s) }
  const unb64 = (t) => { const s = atob(t); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a }
  const LEGACY = 'valid_vault_biometric_key'
  const store = () => JSON.parse(localStorage.getItem('__bioKeys') || '{}')
  const save = (k) => localStorage.setItem('__bioKeys', JSON.stringify(k))
  window.__bio = { available: localStorage.getItem('__bioAvailable') !== 'no', next: 'ok', calls: [] }
  window.__downloads = {}
  window.__shared = []
  window.__deleted = []
  const fail = (code, message) => { const e = new Error(message); e.code = code; throw e }
  const BiometricVault = {
    isAvailable: async () => ({ available: window.__bio.available }),
    enroll: async ({ masterKey, alias }) => {
      window.__bio.calls.push('enroll:' + alias)
      if (window.__bio.next === 'cancel') { window.__bio.next = 'ok'; fail('cancelled', 'Fingerprint was cancelled') }
      const raw = crypto.getRandomValues(new Uint8Array(32))
      const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, unb64(masterKey))
      const keys = store(); keys[alias] = b64(raw); save(keys)
      return { wrapped: b64(ct), iv: b64(iv), alias }
    },
    unlock: async ({ wrapped, iv, alias }) => {
      const a = alias || LEGACY
      window.__bio.calls.push('unlock:' + a)
      if (window.__bio.next === 'cancel') { window.__bio.next = 'ok'; fail('cancelled', 'Fingerprint was cancelled') }
      if (window.__bio.next === 'invalidated') { window.__bio.next = 'ok'; fail('invalidated', 'Fingerprints on this device changed') }
      const keys = store()
      if (!keys[a]) fail('missing', 'No fingerprint is enrolled on this device')
      const k = await crypto.subtle.importKey('raw', unb64(keys[a]), 'AES-GCM', false, ['decrypt'])
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, k, unb64(wrapped))
      return { masterKey: b64(pt) }
    },
    remove: async ({ alias } = {}) => {
      window.__bio.calls.push('remove:' + (alias || 'all'))
      const keys = store()
      if (alias) delete keys[alias]
      else for (const k of Object.keys(keys)) delete keys[k]
      save(keys)
    }
  }
  const NativeDownloader = { saveToDownloads: async ({ filename, data }) => { window.__downloads[filename] = data; return { uri: 'content://downloads/' + filename } } }
  const Filesystem = {
    writeFile: async ({ path, data }) => { window.__fsFiles = window.__fsFiles || {}; window.__fsFiles[path] = data; return { uri: 'file:///cache/' + path } },
    deleteFile: async ({ path }) => { window.__deleted.push(path); delete window.__fsFiles[path] }
  }
  const Share = { share: async (opts) => { window.__shared.push(opts.url) } }
  window.Capacitor = { isNativePlatform: () => true, Plugins: { BiometricVault, NativeDownloader, Filesystem, Share } }
})()
