# Valid Vault - Development Roadmap

**Current Version:** v0.5.0
**Status:** v0.5.0 released (Pre-1.0 development, in Play closed testing)

---

## Version History (Completed)

### v0.5.0 - Native Biometric Auth and Internal-Testing Hardening (Sep 2026)
- ✅ Native Android biometric unlock via BiometricPrompt + hardware-backed Keystore (replaces web WebAuthn, which does not work in the Capacitor WebView)
- ✅ System PIN accepted as a hard unlock via device credential, alongside fingerprint, both drive the same Keystore-wrapped master key
- ✅ Custom app PIN removed on the phone in favor of native device auth
- ✅ Show/hide eye toggle on all PIN and password fields; secret fields mask by default
- ✅ Front screen no longer shows credential management; it points to the menu
- ✅ Clear Vault fully wipes vault, credentials, and native Keystore key, then returns to a clean setup screen
- ✅ Settings-page enroll buttons wired to the working enroll flow with Enroll/Re-enroll states
- ✅ Fixed phone bundle module wiring and enroll/unlock issues found in testing
- ⚠️ Phone sync still a work in progress
- ⚠️ Personal Info still a placeholder
- ⚠️ WebAuthn RP name stays "Local Vault" in code to preserve enrollments

### v0.4.0 - Terminal-Green Rebrand and Reworked Lock Model (Sep 2026)
- ✅ Terminal-green identity across extension and phone, Orbitron wordmark, monospace UI
- ✅ Valid globe logo, rotating wireframe globe with a sliced V
- ✅ Reworked lock model with soft/hard lock and configurable timers
- ✅ Enroll/re-enroll controls, extension hamburger dropdown with Settings Menu and Website

### v0.3.5 - Stateless Sync (Aug 2026)
- ✅ Stateless fountain-QR sync, three actions (Sync Vault, Get Sync Key, Import)
- ✅ Extension Sync tab rebuilt, phone Settings Menu behind a hamburger

### v0.3.4 - Streaming Sync (Aug 2026)
- ✅ LT fountain codec for byte-exact streaming QR reconstruction

### v0.3.3 - Sync Transport (Aug 2026)
- ✅ Vendored local QR generator and frame batching for any vault size

### v0.3.2 - Credential Sync Engine (Aug 2026)
- ✅ Deterministic merge, oldest-key-wins shared master key, tombstone deletes

### v0.3.1 - Extension Security Parity (Aug 2026)
- ✅ Extension brought to security parity with the app, autofill dropdown fixed

### v0.3.0 - Security Overhaul (Aug 2026)
- ✅ WebAuthn PRF fingerprint binding, verify-by-unwrap, PBKDF2 600k

### v0.2.0-alpha - Vault Foundation (Nov 2025)
- ✅ WebCrypto + IndexedDB local encrypted vault, local-only, no cloud

---

## Upcoming Releases

### v0.5.1 - Phone Sync and Manage Parity (Target: Q4 2026)

**Primary goal:** Bring the phone's sync and manage surfaces to parity with the extension.

**In scope:**
- Wire the phone sync surface end to end (fountain codec, QR display, mlkit scanning)
- Per-method auth edit and delete on the phone Manage tab
- On-device verification of lock behavior across Capacitor WebView versions

**Completion criteria:**
- Phone can Sync Vault and Import end to end with a browser
- Phone Manage can edit and remove each auth method

---

## Future Considerations (v0.6.0+)

### Personal Info
- Store addresses, cards, IDs under the same local encryption and sync model
- Currently a placeholder on both surfaces

### Vault Schema Hardening
- Single-blob vault encryption so the site list is not readable at rest
- Vault format version bump with migration

### Platform Hardening
- PRF fallback strategy per device capability on the extension
- Web build parity decisions

---

## Known Limitations

⚠️ **Phone sync not wired end to end yet**
⚠️ **Per-method auth edit and delete deferred on the phone**
⚠️ **Personal Info is a placeholder** on both surfaces
⚠️ **WebAuthn RP name remains "Local Vault" in code** to preserve enrollments
⚠️ **Sync security is physical**, the key and vault travel in the stream; sync in private

**These are intentional staging decisions, not bugs, oversights, or knowledge gaps.**

---

## Contributing

Valid Vault is currently in solo development by Rook.

---

## License

MIT License - See LICENSE file for details

---

**Last Updated:** Sep 6, 2026