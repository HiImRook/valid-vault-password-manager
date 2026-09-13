\# Valid Vault - Development Roadmap



\*\*Current Version:\*\* v0.5.4 (phone) / v0.5.3 (extension)

\*\*Status:\*\* Both surfaces in de-drift parity (Pre-1.0 development, phone in Play closed testing)



\---



\## Version History (Completed)



\### v0.5.4 - Phone De-Drift to Extension Parity (Sep 2026)

\- ✅ About section synced to match the extension exactly, version and website link included

\- ✅ Website credentials rebuilt: collapsible domain list, show/hide password, delete only — matches the extension, old Add/Load flow removed

\- ✅ Inline unlock overlay inside the settings menu on session timeout, in place of booting to the root lock screen

\- ✅ Overlay visibility tracked by an explicit in-menu flag rather than inferred page state

\- ✅ Password rule unified to 12+ characters with letter, number, and symbol on both phone and extension, including a gap in the extension's re-enroll path

\- ✅ Locking clears the shared session key on the phone, matching the extension

\- ✅ Fixed a CSS bug where an inline style kept the new overlay permanently visible regardless of its class



\### v0.5.3 - Extension De-Drift to Phone Parity (Sep 2026)

\- ✅ Custom app PIN removed from the extension; device unlock via fingerprint or the device's own PIN

\- ✅ Sync tab rebuilt to Share Vault/Key, Export/Import Vault/Key, in-box jsQR scan

\- ✅ Inline unlock overlay and background lock monitor introduced on the extension's manage page

\- ✅ Fixed lockAll() not clearing the shared session key, a real lock-bypass



\### v0.5.2 - Sovereign QR Scanner and Settings Persistence (Sep 2026)

\- ✅ Replaced ML Kit with getUserMedia + vendored jsQR on the phone

\- ✅ Settings persist across app restart; auto-lock as a real inactivity timer in seconds



\### v0.5.1 - Phone Sync and Encrypted Offline Backup (Sep 2026)

\- ✅ Phone QR sync wired end to end; encrypted vault and key backup/restore



\### v0.5.0 - Native Biometric Auth and Internal-Testing Hardening (Sep 2026)

\- ✅ Native Android biometric unlock via BiometricPrompt + hardware Keystore



\### v0.4.0 and earlier

\- ✅ Terminal-green rebrand, stateless fountain-QR sync, credential merge engine, WebAuthn PRF fingerprint binding, vault foundation — see CHANGELOG.md for full detail



\---



\## Upcoming After v0.5.4



\### v0.6.x - Web Credentials

Extend the vault to store and sync general web credentials, building on the same local encryption and sync model already in place for logins.



\## Future Considerations (Post-1.0)



\### Personal Info

\- Store addresses, cards, IDs under the same local encryption and sync model

\- Deferred until after the v1.0 release and a security audit; currently a placeholder on both surfaces



\### Vault Schema Hardening

\- Single-blob vault encryption so the site list is not readable at rest



\### Platform Hardening

\- Per-method auth edit and delete on the phone Manage tab

\- Native background-lifecycle lock guarantees on Android

\- Styled Export/Import Key modals on the extension (currently plain browser prompts)

\- Floating-button autofill fallback for login pages without a traditional form



\---



\## Known Limitations



⚠️ \*\*The v0.5.4 unlock-overlay fix needs on-device confirmation\*\*

⚠️ \*\*Sync, backup, and scanner still need on-device field testing\*\* across Android versions

⚠️ \*\*Auto-lock is a foreground inactivity timer\*\* on the phone — exact timing while backgrounded is subject to OS suspension

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



\*\*Last Updated:\*\* Sep 13, 2026

