\# Valid Vault - Development Roadmap



\*\*Current Version:\*\* v0.5.3 (extension) / v0.5.2 (phone)

\*\*Status:\*\* v0.5.3 released, extension-only (Pre-1.0 development, phone in Play closed testing)



\---



\## Version History (Completed)



\### v0.5.3 - Extension De-Drift to Phone Parity (Sep 2026)

\- ✅ Custom app PIN removed from the extension; device unlock is fingerprint or the device's own PIN

\- ✅ Password strengthened to 12+ characters with a letter, number, and symbol

\- ✅ Sync tab rebuilt to match the phone: Share Vault/Share Master Key (one-way QR), Export/Import Vault/Key (encrypted files), and an in-box scan using getUserMedia + vendored jsQR

\- ✅ Front popup no longer manages credentials; that lives only in the manage page

\- ✅ About section updated with current version, description, and a website link

\- ✅ Settings moved to seconds-based auto-lock (default 60) and QR stream timeout (default 30)

\- ✅ Master key rename in Settings; vault export filename includes the name, capitalization preserved

\- ✅ Fixed a settings-menu-halting syntax error (unclosed loop, malformed duplicate init)

\- ✅ Null-guarded all sync button handlers so a missing element can't halt the script

\- ✅ Manage page restores the unlocked session from shared storage instead of showing falsely locked

\- ✅ Inline "UNLOCK VAULT" overlay on session timeout, with a background monitor that shows or hides it on any tab

\- ✅ Fixed `lockAll()` not clearing the shared session key (a real lock-bypass) and fixed activity tracking missing the sidebar tabs

\- ⚠️ Phone app not yet updated with this release's unlock-overlay, lock-monitor, and timer fixes



\### v0.5.2 - Sovereign QR Scanner and Settings Persistence (Sep 2026)

\- ✅ Replaced ML Kit (Google/Play Services) with getUserMedia + vendored jsQR on the phone

\- ✅ Fixed the scanner Cancel button re-triggering via event bubbling

\- ✅ Settings persist across app restart via IndexedDB

\- ✅ Auto-lock as a real inactivity timer in seconds, default 60



\### v0.5.1 - Phone Sync and Encrypted Offline Backup (Sep 2026)

\- ✅ Phone QR sync wired end to end; encrypted vault and key backup/restore

\- ✅ Master key export protected by a passphrase plus three security questions

\- ✅ Nameable master key



\### v0.5.0 - Native Biometric Auth and Internal-Testing Hardening (Sep 2026)

\- ✅ Native Android biometric unlock via BiometricPrompt + hardware Keystore

\- ✅ System PIN as a hard unlock via device credential; custom app PIN removed on phone



\### v0.4.0 - Terminal-Green Rebrand and Reworked Lock Model (Sep 2026)

\- ✅ Terminal-green identity, Orbitron wordmark, Valid globe logo, reworked lock model



\### v0.3.5 and earlier

\- ✅ Stateless fountain-QR sync, credential merge engine, WebAuthn PRF fingerprint binding, vault foundation — see CHANGELOG.md for full detail



\---



\## Upcoming Releases



\### v0.5.4 - Phone De-Drift (Target: Q4 2026)



\*\*Primary goal:\*\* Port the v0.5.3 extension fixes to the phone app so both surfaces share the same corrected auth/lock logic.



\*\*In scope:\*\*

\- Inline unlock overlay and background lock monitor on the phone, matching the extension

\- Confirm the phone's `lockAll()` clears any shared session key the same way

\- Confirm the phone's activity tracking covers every interactive surface, using touchstart/touchmove as the phone's activity signal in place of mouse movement

\- Auto-lock timer reading the real persisted seconds setting, no stale defaults



\*\*Completion criteria:\*\*

\- A timed-out phone session shows an inline unlock path with no dead end

\- Auto-lock only fires on genuine inactivity, verified by active use across every tab and screen



\---



\## Upcoming After v0.5.4



\### v0.6.x - Web Credentials

\- Extend the vault to store and sync general web credentials, building on the same local encryption and sync model already in place for logins.



\## Future Considerations (Post-1.0)



\### Personal Info

\- Store addresses, cards, IDs under the same local encryption and sync model

\- Deferred until after the v1.0 release and a security audit; currently a placeholder on both surfaces



\### Vault Schema Hardening

\- Single-blob vault encryption so the site list is not readable at rest



\### Platform Hardening

\- Per-method auth edit and delete on the phone Manage tab

\- Native background-lifecycle lock guarantees on Android



\---



\## Known Limitations



⚠️ \*\*Phone app has not received the v0.5.3 extension fixes yet\*\* — tracked for v0.5.4

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



\*\*Last Updated:\*\* Sep 12, 2026

