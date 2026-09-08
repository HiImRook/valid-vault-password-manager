\# Valid Vault - Development Roadmap



\*\*Current Version:\*\* v0.5.2

\*\*Status:\*\* v0.5.2 released (Pre-1.0 development, in Play closed testing)



\---



\## Version History (Completed)



\### v0.5.2 - Sovereign QR Scanner and Settings Persistence (Sep 2026)

\- ✅ Replaced the ML Kit barcode scanner (scaffolding) with getUserMedia plus a vendored jsQR decoder

\- ✅ Camera renders inside the scan square, no Google or Play Services dependency, ML Kit plugin removed

\- ✅ Fixed the scanner Cancel button, which was re-triggering via event bubbling from the scan box

\- ✅ Settings now persist across app restart via IndexedDB (QR stream timeout and auto-lock)

\- ✅ Auto-lock is a real inactivity timer in seconds, default 60, locks the vault and returns to the lock screen

\- ✅ QR stream timeout in seconds, default 30, with countdown and manual close, governs all QR shares



\### v0.5.1 - Phone Sync and Encrypted Offline Backup (Sep 2026)

\- ✅ Phone QR sync wired end to end, fountain.js and qrcode.js bundled into the phone

\- ✅ Encrypted offline vault backup and restore

\- ✅ Master key export/import as an encrypted file, passphrase plus security questions, high-iteration KDF

\- ✅ Nameable master key



\### v0.5.0 - Native Biometric Auth and Internal-Testing Hardening (Sep 2026)

\- ✅ Native Android biometric unlock via BiometricPrompt + hardware Keystore

\- ✅ System PIN as a hard unlock via device credential, custom app PIN removed

\- ✅ Masked secret fields with eye toggle, Clear Vault fully wipes and returns to setup



\### v0.4.0 - Terminal-Green Rebrand and Reworked Lock Model (Sep 2026)

\- ✅ Terminal-green identity, Orbitron wordmark, Valid globe logo, reworked lock model



\### v0.3.5 - Stateless Sync (Aug 2026)

\- ✅ Fountain-QR sync, phone Settings Menu



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



\### v0.5.3 - Field Testing and Manage Parity (Target: Q4 2026)



\*\*Primary goal:\*\* Verify the sync, backup, scanner, and lock paths on real devices and close remaining phone gaps.



\*\*In scope:\*\*

\- On-device verification of the jsQR scanner across Android versions and lighting

\- Confirm Export/Import Vault and Key round trips and file saving on target devices

\- Confirm auto-lock inactivity behavior, including background/resume edge cases

\- Per-method auth edit and delete on the phone Manage tab



\*\*Completion criteria:\*\*

\- The in-square scanner reads a fountain stream reliably

\- Backup files save and restore

\- Auto-lock locks after the set inactivity period and returns to the lock screen



\---



\## Future Considerations (v0.6.0+)



\### Personal Info

\- Store addresses, cards, IDs under the same local encryption and sync model

\- Currently a placeholder on both surfaces



\### Vault Schema Hardening

\- Single-blob vault encryption so the site list is not readable at rest



\### Platform Hardening

\- Native background-lifecycle lock guarantees on Android

\- PRF fallback strategy per device capability on the extension



\---



\## Known Limitations



⚠️ \*\*Sync, backup, and scanner need on-device field testing\*\* across Android versions

⚠️ \*\*Auto-lock is a foreground inactivity timer\*\* — exact timing while backgrounded is subject to OS suspension

⚠️ \*\*Per-method auth edit and delete deferred on the phone\*\*

⚠️ \*\*Personal Info is a placeholder\*\* on both surfaces

⚠️ \*\*WebAuthn RP name remains "Local Vault" in code\*\* to preserve enrollments

⚠️ \*\*Live QR security is physical\*\* — do it in private

⚠️ \*\*A lost key-file passphrase or answers cannot be recovered\*\* — by design



\*\*These are intentional staging decisions, not bugs, oversights, or knowledge gaps.\*\*



\---



\## Contributing



Valid Vault is currently in solo development by Rook.



\---



\## License



MIT License - See LICENSE file for details



\---



\*\*Last Updated:\*\* Sep 8, 2026

