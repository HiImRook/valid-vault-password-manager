# Valid Vault - Development Roadmap

**Current Version:** v0.3.5
**Status:** v0.3.5 released (Pre-1.0 development)

---

## Version History (Completed)

### v0.3.5 - Stateless Sync (Aug 2026)
- ✅ Pairing/handshake/key-exchange model removed entirely
- ✅ Stateless model — a device shows a fountain QR carrying its key and vault, another scans it and writes its own identical vault
- ✅ Three sync actions — Sync Vault (stream logins), Get Sync Key (give a new device the key), Import (scan to receive either)
- ✅ Extension Sync tab rebuilt around the three actions with a cycling fountain QR
- ✅ Extension Import uses native BarcodeDetector — no vendored decoder
- ✅ Extension popup Expand replaced with a hamburger opening the full settings page
- ✅ Back up with Secure Sync promoted to a primary action that jumps to the Sync tab
- ✅ Phone front screen reduced to login only
- ✅ Phone Settings Menu behind a hamburger — opens on Manage, with Manage, Personal Info, Sync, Settings, and About tabs
- ✅ Clear Vault moved into a guarded Settings tab
- ✅ About sections updated to Valid Vault branding and current repository
- ✅ Versions aligned across app and extension
- ⚠️ Phone sync buttons stubbed — fountain codec, QR display, and mlkit scanning not yet wired into the phone bundle
- ⚠️ Browser Import depends on BarcodeDetector — inconsistent on Windows desktop, no decoder fallback yet
- ⚠️ Phone auth management exposes enroll/set only — per-method edit and delete deferred
- ⚠️ WebAuthn RP name stays "Local Vault" in code to preserve enrolled fingerprints

### v0.3.4 - Streaming Sync (Aug 2026)
- ✅ fountain.js — plain LT fountain codec, byte-exact reconstruction under dropped, shuffled, and duplicate frames
- ✅ Seeded RNG and robust soliton degree distribution, written from the published Luby Transform method
- ✅ No dependencies — pure XOR and array math
- ✅ Animated fountain QR display in the extension Sync tab, verified cycling in a real browser
- ✅ Validated in Node up to 100 credentials — a 14-block vault decodes in roughly 22 frames
- ✅ Plain LT only, not the patented Raptor or RaptorQ variants

### v0.3.3 - Sync Transport (Aug 2026)
- ✅ qrcode.js — vendored QR generator, MIT, fully local with no network calls
- ✅ frames.js — frame batching for any vault size, out-of-order and duplicate safe
- ✅ Incomplete frame sets rejected so a partial scan cannot produce a corrupt vault
- ✅ Animated frame display in the extension Sync tab
- ✅ Frame batching validated in Node — 50-credential vault splits to 17 frames and reassembles exactly

### v0.3.2 - Credential Sync Engine (Aug 2026)
- ✅ mergeVaults() — deterministic merge, newest updatedAt per username wins
- ✅ reEncryptVault() — re-encrypt to a shared key on convergence
- ✅ Tombstone deletes — newer tombstone deletes on both devices
- ✅ Username-dedup on save, tombstone filtering in getCredentials and getAllDomains
- ✅ Merge cases tested in Node

### v0.3.1 - Extension Security Parity (Aug 2026)
- ✅ Extension brought to security parity with the app
- ✅ Working autofill dropdown restored after document_start and stale-worker regressions
- ✅ Popup control renamed and reworked toward the settings model

### v0.3.0 - Security Overhaul (Aug 2026)
- ✅ WebAuthn PRF fingerprint binding
- ✅ Verify-by-unwrap — no stored password or PIN hashes
- ✅ PBKDF2 600k iterations
- ✅ Ephemeral session PIN

### v0.2.0-alpha - Vault Foundation (Nov 2025)
- ✅ WebCrypto + IndexedDB local encrypted vault
- ✅ Fingerprint, PIN, and password unlock methods
- ✅ Local-only, no cloud, no accounts

---

## Upcoming Releases

### v0.3.6 - Phone Sync Functional (Target: Aug 2026)

**Primary goal:** Make the phone's three sync buttons actually work, bringing the phone to sync parity with the extension's send side.

**In scope:**
- Inject the fountain codec and a QR generator into the phone bundle
- Add a QR display surface to the phone for Sync Vault and Get Sync Key
- Wire Import to the mlkit camera scanner feeding the fountain decoder
- Auto-detect key vs vault payloads on Import and route each correctly
- Verify browser-to-phone and phone-to-browser sync end to end on real hardware
- A visible cancel path during any active phone scan

**Out of scope until phone sync is stable:**
- Phone auth-method edit and delete
- Personal Info implementation
- Any redesign of the merge or transport model

**Completion criteria:**
- Phone Sync Vault streams a cycling fountain QR
- Phone Import scans a stream and completes a merge
- A full round trip converges both devices to the same vault
- Cancel exits any scan cleanly without killing the app

### v0.3.7 - Browser Receive Fallback (Target: Q3 2026)

**Primary goal:** Make the browser able to receive on machines where the native BarcodeDetector is unavailable or unreliable.

**In scope:**
- Detect when BarcodeDetector is missing or returns no supported formats
- Vendored inline QR decoder fallback that runs without a worker under MV3 CSP
- Keep native BarcodeDetector as the default path when it works
- Clear send-only messaging on devices with no camera

**Out of scope:**
- Any change to the sync payload format or security model

**Completion criteria:**
- Browser Import works on Windows desktop regardless of BarcodeDetector state
- Native path still used where available
- Camera-less devices clearly fall back to send-only

---

## Future Considerations (v0.4.0+)

### Phone Feature Parity
- Per-method auth edit and delete on the phone Manage tab
- Auto-lock timeout enforcement wired to the setting
- Phone reaching full parity with the extension's manage surface

### Personal Info
- Store addresses, credit cards, IDs, and other personal information
- Same local encryption and sync model as credentials
- Currently a placeholder on both surfaces

### Onboarding and Discovery
- Play Store prompt when a generic scanner reads a Valid Vault frame without the app installed
- Guided first-sync flow that explains Get Sync Key before Sync Vault

### Additional Surfaces
- Tablet and other devices brought to parity using the same stateless method
- Each surface shows and scans identically, no surface is special

### Optional Bulk Transport
- USB or local-file transfer as a deep-setting option for very large first syncs
- Visual sync remains the default; bulk is opt-in for power users

---

## Known Limitations

⚠️ **Phone sync not functional yet** — buttons stubbed; fountain codec, QR display, and mlkit scanning not wired into the phone bundle
⚠️ **Browser Import depends on BarcodeDetector** — inconsistent on Windows desktop; no vendored decoder fallback yet
⚠️ **Phone auth management is enroll/set only** — per-method edit and delete deferred
⚠️ **Personal Info is a placeholder** on both surfaces
⚠️ **WebAuthn RP name remains "Local Vault" in code** — changing it would invalidate enrolled fingerprints, so it is deliberately left unchanged
⚠️ **Sync security is physical** — the key and vault travel in the stream; sync in a private area, the same trust as typing a password

**These are intentional staging decisions, not bugs, oversights, or knowledge gaps.**

---

## Contributing

Valid Vault is currently in solo development by Rook.

---

## License

MIT License - See LICENSE file for details

---

**Last Updated:** Aug 15, 2026
