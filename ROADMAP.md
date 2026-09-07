\# Valid Vault - Development Roadmap



\*\*Current Version:\*\* v0.5.1

\*\*Status:\*\* v0.5.1 released (Pre-1.0 development, in Play closed testing)



\---



\## Version History (Completed)



\### v0.5.1 - Phone Sync and Encrypted Offline Backup (Sep 2026)

\- ✅ Phone QR sync wired end to end — Sync Vault and Get Sync Key display one-way fountain QR streams, QR scanner reads a streamed key or vault

\- ✅ fountain.js and qrcode.js bundled into the phone build

\- ✅ Encrypted offline backup — Export/Import Vault, stays encrypted and inert without the master key

\- ✅ Master key export/import as an encrypted file, wrapped by a 12+ character passphrase plus three random security questions, PBKDF2 at 1,000,000 iterations, never stored

\- ✅ Nameable master key — default "My Master Key", renamable in Settings, stored as file metadata only, not required to import

\- ✅ "QR sync not enabled. Import master key first" shown when scanning a vault without the key

\- ✅ Settings no longer re-enrolls fingerprint/PIN (device-managed); auth section renamed "Password"



\### v0.5.0 - Native Biometric Auth and Internal-Testing Hardening (Sep 2026)

\- ✅ Native Android biometric unlock via BiometricPrompt + hardware Keystore

\- ✅ System PIN accepted as a hard unlock via device credential

\- ✅ Custom app PIN removed in favor of native device auth

\- ✅ Masked secret fields with show/hide eye toggle

\- ✅ Clear Vault fully wipes and returns to a clean setup screen



\### v0.4.0 - Terminal-Green Rebrand and Reworked Lock Model (Sep 2026)

\- ✅ Terminal-green identity, Orbitron wordmark, Valid globe logo

\- ✅ Reworked lock model, enroll/re-enroll controls, hamburger dropdown



\### v0.3.5 - Stateless Sync (Aug 2026)

\- ✅ Fountain-QR sync with three actions, phone Settings Menu



\### v0.3.4 - Streaming Sync (Aug 2026)

\- ✅ LT fountain codec for byte-exact streaming QR reconstruction



\### v0.3.3 - Sync Transport (Aug 2026)

\- ✅ Vendored local QR generator and frame batching



\### v0.3.2 - Credential Sync Engine (Aug 2026)

\- ✅ Deterministic merge, oldest-key-wins, tombstone deletes



\### v0.3.1 - Extension Security Parity (Aug 2026)

\- ✅ Extension security parity, autofill dropdown fixed



\### v0.3.0 - Security Overhaul (Aug 2026)

\- ✅ WebAuthn PRF fingerprint binding, verify-by-unwrap, PBKDF2 600k



\### v0.2.0-alpha - Vault Foundation (Nov 2025)

\- ✅ WebCrypto + IndexedDB local encrypted vault, local-only



\---



\## Upcoming Releases



\### v0.5.2 - Sync and Backup Field Testing (Target: Q4 2026)



\*\*Primary goal:\*\* Verify the sync and backup paths on real devices and fix what surfaces.



\*\*In scope:\*\*

\- On-device verification of Export/Import Vault and Export/Import Key round trips

\- Confirm QR scanner reads a streamed key and vault reliably

\- If in-page file save proves unreliable on Android, add a native file path

\- Per-method auth edit and delete on the phone Manage tab



\*\*Completion criteria:\*\*

\- A key file exports and re-imports with the passphrase and answers

\- A vault streams device-to-device and merges

\- Backup files save and load on the target Android versions



\---



\## Future Considerations (v0.6.0+)



\### Personal Info

\- Store addresses, cards, IDs under the same local encryption and sync model

\- Currently a placeholder on both surfaces



\### Vault Schema Hardening

\- Single-blob vault encryption so the site list is not readable at rest

\- Vault format version bump with migration



\### Platform Hardening

\- PRF fallback strategy per device capability on the extension



\---



\## Known Limitations



⚠️ \*\*Sync and backup need on-device field testing\*\* across Android versions

⚠️ \*\*Per-method auth edit and delete deferred on the phone\*\*

⚠️ \*\*Personal Info is a placeholder\*\* on both surfaces

⚠️ \*\*WebAuthn RP name remains "Local Vault" in code\*\* to preserve enrollments

⚠️ \*\*Live QR security is physical\*\* — the key and vault travel in the stream; do it in private

⚠️ \*\*A lost key-file passphrase or answers cannot be recovered\*\* — by design



\*\*These are intentional staging decisions, not bugs, oversights, or knowledge gaps.\*\*



\---



\## Contributing



Valid Vault is currently in solo development by Rook.



\---



\## License



MIT License - See LICENSE file for details



\---



\*\*Last Updated:\*\* Sep 7, 2026

