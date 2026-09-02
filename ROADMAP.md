# Valid Vault - Development Roadmap

**Current Version:** v0.4.0
**Status:** v0.4.0 released (Pre-1.0 development)

---

## Version History (Completed)

### v0.4.0 - Terminal-Green Rebrand and Reworked Lock Model (Sep 2026)
- ✅ Terminal-green identity across extension and phone — Orbitron wordmark, monospace UI, off-black background
- ✅ Valid globe logo — rotating wireframe globe with a sliced V, live in the phone header and animated on the sites
- ✅ PIN redefined as a permanent credential that only resumes a soft-locked idle session, never a hard unlock
- ✅ Soft-lock and hard-lock split — Lock soft-locks when a PIN is set, otherwise hard-locks; browser close always hard-locks
- ✅ Configurable Soft-lock and Hard-lock timers in Settings, defaulting to 5 and 20 minutes
- ✅ Fingerprint and password are the two hard unlocks; the hard-lock screen shows them only, not the PIN
- ✅ Enroll and Re-enroll controls — green to enroll, red to re-enroll — on extension setup and manage
- ✅ Extension hamburger dropdown with Settings Menu and Website
- ✅ Phone enroll/re-enroll setup with routing across setup, hard-lock, soft-lock, and unlocked views
- ✅ Developer log removed from the phone's user-facing screen
- ✅ Fixed a phone bundle crash caused by module function lists drifting from the reworked session and auth modules
- ⚠️ Phone sync surface present but not yet wired end to end
- ⚠️ Per-method auth edit and delete still deferred on the phone
- ⚠️ Personal Info still a placeholder on both surfaces
- ⚠️ WebAuthn RP name stays "Local Vault" in code to preserve enrolled fingerprints

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
- ✅ Session PIN system (later redefined in v0.4.0)

### v0.2.0-alpha - Vault Foundation (Nov 2025)
- ✅ WebCrypto + IndexedDB local encrypted vault
- ✅ Fingerprint, PIN, and password unlock methods
- ✅ Local-only, no cloud, no accounts

---

## Upcoming Releases

### v0.4.1 - Phone Lock and Auth Parity (Target: Q3 2026)

**Primary goal:** Bring the phone's lock model and auth management to parity with the extension.

**In scope:**
- Verify soft-lock and hard-lock timer enforcement on the phone across Capacitor WebView
- Per-method auth edit and delete on the phone Manage tab
- Confirm enroll/re-enroll parity and the hard-lock vs soft-lock screens on device

**Out of scope:**
- Any change to the sync payload format or security model

**Completion criteria:**
- Phone soft-locks and hard-locks on their configured timers
- Phone Manage can edit and delete each auth method
- Hard-lock requires fingerprint or password on the phone, PIN resumes soft-lock only

### v0.4.2 - Phone Sync Functional (Target: Q3 2026)

**Primary goal:** Wire the phone's sync surface end to end so it reaches the extension's send and receive parity.

**In scope:**
- Fountain codec and QR display driven on the phone for Sync Vault and Get Sync Key
- Import wired to the mlkit camera scanner feeding the fountain decoder
- End-to-end browser-to-phone and phone-to-browser verification on real hardware
- A visible cancel path during any active phone scan

**Out of scope:**
- Any redesign of the merge or transport model

**Completion criteria:**
- Phone Sync Vault streams a cycling fountain QR
- Phone Import scans a stream and completes a merge
- A full round trip converges both devices to the same vault

---

## Future Considerations (v0.5.0+)

### Personal Info
- Store addresses, credit cards, IDs, and other personal information
- Same local encryption and sync model as credentials
- Currently a placeholder on both surfaces

### Vault Schema Hardening
- Single-blob vault encryption so the site list is not readable at rest
- Vault format version bump with migration
- Fresh IV discipline audit across all encrypt paths

### Platform Hardening
- Android hardware keystore binding via Capacitor plugin
- PRF fallback strategy per device capability
- Web build parity decisions

### Onboarding and Discovery
- Play Store prompt when a generic scanner reads a Valid Vault frame without the app installed
- Guided first-sync flow that explains Get Sync Key before Sync Vault

---

## Known Limitations

⚠️ **Phone sync not wired end to end yet** — the sync surface is present but not functional
⚠️ **Phone lock timers need on-device verification** across Capacitor WebView versions
⚠️ **Phone auth management is enroll/re-enroll only** — per-method edit and delete deferred
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

**Last Updated:** Sep 1, 2026
