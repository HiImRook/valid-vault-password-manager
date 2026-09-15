\# Valid Vault - Development Roadmap



\*\*Current Version:\*\* v0.6.0 — \*\*Status: Active Testing\*\*



\---



\## Version History (Completed)



\### v0.6.0 - Web Credentials, Personal Info, Uni-Vault Key Fix (Sep 2026)

\- ✅ Personal Info tab: name, phone, address, ranked/reorderable emails; view unlocks normally, edit requires the master password specifically

\- ✅ Web Credentials gained a working Edit (previously add/delete only)

\- ✅ Website Credentials and Web Credentials both require their own explicit re-unlock inside Manage

\- ✅ Personal Info, Web Credentials, and logins all now travel together through Share/Export/Import/QR sync

\- ✅ Fixed persistent key import — an imported master key now re-wraps under the browser's own unlock methods, so it genuinely becomes the browser's key going forward instead of silently reverting on next unlock. This was the real gap in using one vault file across multiple browsers with a shared master key.

\- ✅ Save-on-submit prompt now checks existing saved state first — silent on an unchanged login, a save prompt for a new username, an update prompt for a changed password

\- ✅ Tracked down and resolved a Windows Hello / passkey chooser issue during this cycle, confirmed via actual commit history to be Windows account state, not the extension's code



\### v0.5.5 - Export Fix and Native File Saving (Sep 2026)

\- ✅ Fixed Export Vault appearing to silently fail; added native Filesystem/Share-based file saving



\### v0.5.4 - Phone De-Drift to Extension Parity (Sep 2026)

\- ✅ About synced to match the extension; collapsible view/delete-only credentials list; inline unlock overlay



\### v0.5.3 - Extension De-Drift to Phone Parity (Sep 2026)

\- ✅ Custom app PIN removed from the extension; Sync tab rebuilt to Share/Backup/Scan model



\### v0.5.0–v0.5.2 and earlier

\- ✅ Native biometric auth, phone QR sync and encrypted backup, sovereign QR scanner, terminal-green rebrand — see CHANGELOG.md for full detail



\---



\## Upcoming After v0.6.0



\### Autofill Injection (scoped, not yet built)

\- Website Credentials needs a `loginType` field (username/email/phone) so the correct field type gets targeted on injection

\- Personal Info autofill for signup and profile forms

\- Must be built the safe way: background.js decrypts with its own session key and sends only plaintext to content.js for injection — the raw master key itself never reaches the page context



\## Future Considerations (Post-1.0)



\### Extended Personal Info

\- Social Security number and credit/debit card storage — deliberately held back for now, pending additional security work



\### Vault Schema Hardening

\- Single-blob vault encryption so the site list is not readable at rest



\### Platform Hardening

\- Per-method auth edit and delete on the phone Manage tab

\- Native background-lifecycle lock guarantees on Android

\- Styled Export/Import Key modals on the extension (currently plain browser prompts)

\- A desktop app to own the vault file directly and sync it across browser extensions (Chrome, Firefox, Edge) without manual export/import — browser extensions can't watch or write an arbitrary file continuously, so this is the real fix for seamless cross-browser sync



\---



\## Known Limitations



⚠️ \*\*This build is under active testing\*\* — expect rough edges

⚠️ \*\*Autofill injection is scoped but not implemented\*\* — Personal Info and login-type tracking exist as storage only for now

⚠️ \*\*Auto-lock is a foreground inactivity timer\*\* on the phone — exact timing while backgrounded is subject to OS suspension

⚠️ \*\*Per-method auth edit and delete deferred on the phone\*\*

⚠️ \*\*SSN and card storage deliberately deferred\*\*, pending security work

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



\*\*Last Updated:\*\* Sep 14, 2026

