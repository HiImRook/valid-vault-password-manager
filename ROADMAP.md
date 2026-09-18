\# Valid Vault - Development Roadmap



\*\*Current Version:\*\* v0.6.1 - \*\*Status: Active Testing\*\*



\---



\## Version History (Completed)



\### v0.6.1 - Autofill Injection Foundation (Sep 2026)

\- ✅ Personal Info autofill on page load: empty, matched fields populate via a three-tier heuristic (autocomplete match, then keyword match, then nearby label text)

\- ✅ Email fields are click-to-pick from a small on-field picker listing every saved, ranked email - never auto-filled silently

\- ✅ Website Credentials autofill shows a picker of saved usernames for the current site; injection only, no password reveal

\- ✅ Visible field tag marks anything Valid Vault has matched, repositioning on scroll/resize

\- ✅ Inline unlock directly on a locked page when a tagged field is clicked - password-only, since a WebAuthn platform credential can't be triggered from a page's own origin

\- ✅ Fixed a `VersionError` bug: background.js had `indexedDB.open('ValidVault', 1)` hardcoded in three places, silently breaking background vault access once the database reached version 3

\- ✅ Fixed a popup/background race condition that could drop the session key on a fast tab switch, by delegating the session-key write to background.js

\- ⚠️ Website Credentials still does not reliably save new logins captured from a real signup flow - a fix was built, caused a regression, and was rolled back; root cause understood, not yet resolved



\### v0.6.0 - Web Credentials, Personal Info, Uni-Vault Key Fix (Sep 2026)

\- ✅ Personal Info tab: name, phone, address, ranked/reorderable emails; view unlocks normally, edit requires the master password specifically

\- ✅ Web Credentials gained a working Edit (previously add/delete only)

\- ✅ Website Credentials and Web Credentials both require their own explicit re-unlock inside Manage

\- ✅ Personal Info, Web Credentials, and logins all now travel together through Share/Export/Import/QR sync

\- ✅ Fixed persistent key import - an imported master key now re-wraps under the browser's own unlock methods, so it genuinely becomes the browser's key going forward instead of silently reverting on next unlock. This was the real gap in using one vault file across multiple browsers with a shared master key.

\- ✅ Save-on-submit prompt now checks existing saved state first - silent on an unchanged login, a save prompt for a new username, an update prompt for a changed password

\- ✅ Tracked down and resolved a Windows Hello / passkey chooser issue during this cycle, confirmed via actual commit history to be Windows account state, not the extension's code



\### v0.5.5 - Export Fix and Native File Saving (Sep 2026)

\- ✅ Fixed Export Vault appearing to silently fail; added native Filesystem/Share-based file saving



\### v0.5.4 - Phone De-Drift to Extension Parity (Sep 2026)

\- ✅ About synced to match the extension; collapsible view/delete-only credentials list; inline unlock overlay



\### v0.5.3 - Extension De-Drift to Phone Parity (Sep 2026)

\- ✅ Custom app PIN removed from the extension; Sync tab rebuilt to Share/Backup/Scan model



\### v0.5.0-v0.5.2 and earlier

\- ✅ Native biometric auth, phone QR sync and encrypted backup, sovereign QR scanner, terminal-green rebrand - see CHANGELOG.md for full detail



\---



\## Upcoming After v0.6.1



\### Website Credentials Save Fix (top priority)

\- Re-attempt a fix for `detectLoginForm()` colliding with Personal Info's field targeting on the same signup form, without repeating the regression from the rolled-back attempt

\- Needs careful testing against the real-world forms that exposed the bug (e.g. Tubi's signup flow) before it ships again



\### Autofill Hardening

\- `loginType` field (username/email/phone) on Website Credentials so the correct field type is targeted on injection and in the credential picker

\- Broader real-world testing of the heuristic field matcher across more sites



\## Future Considerations (Post-1.0)



\### Extended Personal Info

\- Social Security number and credit/debit card storage - deliberately held back for now, pending additional security work



\### Vault Schema Hardening

\- Single-blob vault encryption so the site list is not readable at rest



\### Platform Hardening

\- Per-method auth edit and delete on the phone Manage tab

\- Native background-lifecycle lock guarantees on Android

\- Styled Export/Import Key modals on the extension (currently plain browser prompts)

\- A desktop app to own the vault file directly and sync it across browser extensions (Chrome, Firefox, Edge) without manual export/import - browser extensions can't watch or write an arbitrary file continuously, so this is the real fix for seamless cross-browser sync



\---



\## Known Limitations



⚠️ \*\*This build is under active testing\*\* - expect rough edges

⚠️ \*\*Website Credentials doesn't reliably save new logins from real signup flows\*\* - the fix attempted this cycle regressed and was rolled back; known, not yet resolved

⚠️ \*\*Autofill matching quality varies site to site\*\* - the foundation works, polish is ongoing

⚠️ \*\*`loginType` tracking is scoped but not implemented\*\* - Website Credentials still store a generic login string

⚠️ \*\*Auto-lock is a foreground inactivity timer\*\* on the phone - exact timing while backgrounded is subject to OS suspension

⚠️ \*\*Per-method auth edit and delete deferred on the phone\*\*

⚠️ \*\*SSN and card storage deliberately deferred\*\*, pending security work

⚠️ \*\*WebAuthn RP name remains "Local Vault" in code\*\* to preserve enrollments

⚠️ \*\*Live QR security is physical\*\* - do it in private

⚠️ \*\*A lost key-file passphrase or answers cannot be recovered\*\* - by design



\*\*These are intentional staging decisions or known open bugs, not oversights or knowledge gaps.\*\*



\---



\## Contributing



Valid Vault is currently in solo development by Rook.



\---



\## License



MIT License - See LICENSE file for details



\---



\*\*Last Updated:\*\* Sep 18, 2026

