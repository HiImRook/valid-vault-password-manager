\# Valid Vault - Development Roadmap



\*\*Current Version:\*\* v0.5.5 — \*\*Status: Active Testing\*\*



\---



\## Version History (Completed)



\### v0.5.5 - Export Fix and Native File Saving (Sep 2026)

\- ✅ Fixed Export Vault appearing to silently fail — its feedback wrote to a page element that never existed

\- ✅ Exported vault filename now includes the master key nickname, matching the key file

\- ✅ File saving moved off the unreliable browser-download trick onto Capacitor's native Filesystem and Share APIs

\- ✅ Export Vault now offers a direct save to the Downloads folder or the native share sheet from one button

\- ✅ Added a small native plugin for direct Downloads saves via Android's MediaStore, no extra permission required



\### v0.5.4 - Phone De-Drift to Extension Parity (Sep 2026)

\- ✅ About section synced to match the extension; collapsible view/delete-only credentials list

\- ✅ Inline unlock overlay inside the settings menu on session timeout

\- ✅ Password rule unified to 12+ characters with letter, number, and symbol on both surfaces

\- ✅ Fixed a CSS bug that could leave the unlock overlay permanently visible



\### v0.5.3 - Extension De-Drift to Phone Parity (Sep 2026)

\- ✅ Custom app PIN removed from the extension; Sync tab rebuilt to Share/Backup/Scan model

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



\## Upcoming After v0.5.5



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



⚠️ \*\*This build is under active testing\*\* — expect rough edges as sync, backup, and native file saving are field-tested on real devices

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

