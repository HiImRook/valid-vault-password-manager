\# Valid Vault - Development Roadmap



\*\*Current Version:\*\* v0.6.3 - \*\*Status: Active Testing\*\*



\---



\## Version History (Completed)



\### v0.6.3 - Single-Blob Vault Encryption and Migration Hardening (Sep 2026)



\- ✅ Website Credentials moved from per-credential encryption to a single AES-GCM vault blob - domain names, credential IDs, timestamps, login types, usernames, passwords, and per-site extra fields are no longer readable from the Website Credentials database row at rest

\- ✅ Legacy vaults migrate automatically on first unlock: the old row is decrypted into a plaintext tree, backed up encrypted under a short-lived migration journal, re-encrypted as the new blob, and verified against a full-tree fingerprint before the journal clears

\- ✅ Unsupported or malformed vault rows now fail closed instead of being misread - an unrecognized `schemaVersion` or a `schemaVersion: 2` row missing its blob throws rather than being treated as an empty legacy vault

\- ✅ Decrypted vault-tree validation deepened to check every domain's credential list, not just the top-level shape, so a malformed blob is caught immediately instead of crashing later

\- ✅ Unknown fields on a legacy credential now survive migration into the new tree instead of being silently dropped

\- ✅ Pairing and sync now require both devices to already share the same master key - a mismatched key fails clearly instead of being silently reconciled

\- ✅ `loginType` field (username/email/phone) on Website Credentials for more reliable autofill matching



\### v0.6.2 - Website Credentials Save Fix and Autofill Hardening (Sep 2026)



\- ✅ Website Credentials save regression resolved at the root - `detectLoginForm()`/`matchSignupFieldType()` now use per-form closures instead of shared mutable globals, fixing the multi-form state collision that caused the v0.6.1 rollback

\- ✅ Submit-triggered navigation losing the save prompt - captured credentials now stage in `background.js` synchronously and are recovered on whatever page loads next in the same tab, surviving cross-domain SSO/MFA redirects and multi-hop flows, with a stage/resolve ordering race closed via per-tab serialization

\- ✅ False-positive personal-info classification fixed - bare single-word keywords (state, city, zip) now only match against structured signals (name/id/autocomplete), never free text

\- ✅ Autofill now compatible with React/Vue-style controlled inputs via the native value-property setter

\- ✅ Duplicate save prompts from one submission collapsed via an in-flight capture guard

\- ✅ Fields reclassified when a framework sets their identifying attributes after insertion, instead of staying unrecognized

\- ✅ Detached SPA forms and personal-info field tags no longer leak listeners indefinitely after removal

\- ✅ Formless (no wrapping `<form>`) login widgets no longer cross-trigger each other's capture on a single click

\- ✅ Personal Info autofill and per-site extra fields extended to `<select>` and `<textarea>`

\- ✅ Activity tracking extended to ordinary typing, passive autofill, dropdown opens, and pending-save recovery, closing gaps that could lock the vault mid-use

\- ⚠️ Pending-save recovery remains tab-scoped with a 45s TTL (deliberate tradeoff for surviving cross-domain redirects); the formless-widget heuristic can still misattribute on unusually flattened markup; custom comboboxes/contenteditable remain unsupported - see CHANGELOG.md



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



\## Upcoming After v0.6.3



\### Autofill Hardening



\- Custom div-based combobox and `contenteditable` field support - no standard attribute signal exists for either, so this needs its own approach rather than an extension of the current classifier

\- Broader real-world testing of the heuristic field matcher across more sites



\## Future Considerations (Post-1.0)



\### Extended Personal Info



\- Social Security number and credit/debit card storage - deliberately held back for now, pending additional security work



\### Platform Hardening



\- Per-method auth edit and delete on the phone Manage tab

\- Native background-lifecycle lock guarantees on Android

\- Styled Export/Import Key modals on the extension (currently plain browser prompts)

\- A desktop app to own the vault file directly and sync it across browser extensions (Chrome, Firefox, Edge) without manual export/import - browser extensions can't watch or write an arbitrary file continuously, so this is the real fix for seamless cross-browser sync



\---



\## Known Limitations



⚠️ \*\*This build is under active testing\*\* - expect frequent changes



⚠️ \*\*Autofill matching quality varies site to site\*\* - this is something I am very aware of. The foundation works, polish is ongoing



⚠️ \*\*Save prompts are matched to your browser tab, not the exact page\*\* - so they survive a login redirect (like SSO or MFA) instead of getting lost. In rare cases, navigating elsewhere in that same tab within the 45-second window could bring the prompt up there too - a minor UX quirk, not a credential leak.



⚠️ \*\*Custom div-based comboboxes and `contenteditable` fields are not supported\*\* by autofill - no standard attribute signal exists to classify them



⚠️ \*\*Auto-lock is a foreground inactivity timer\*\* on the phone - exact timing while backgrounded is subject to OS suspension



⚠️ \*\*Per-method auth edit and delete deferred on the phone\*\*



⚠️ \*\*SSN and card storage deliberately deferred\*\*, pending security work



⚠️ \*\*WebAuthn RP name remains "Local Vault" in code\*\* to preserve enrollments



⚠️ \*\*A lost key-file passphrase and answers cannot be recovered. Writing these down and storing them safely is highly recommended.\*\*



\*\*These are intentional staging decisions or known open bugs, not oversights or knowledge gaps.\*\*



\---



\## Contributing



Valid Vault is currently in solo development by Rook.



\---



\## License



MIT License - See LICENSE file for details



\---



\*\*Last Updated:\*\* Sep 22, 2026

