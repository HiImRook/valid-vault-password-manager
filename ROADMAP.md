# Valid Vault - Development Roadmap

**Current Version:** v0.7.3 - **Status: Active Testing**

---

## Version History (Completed)

### v0.7.3 - Uni-Vault and User Guide (Sep 2026)

- ✅ Uni-Vault: every browser on one computer linked to one encrypted vault file and kept in sync automatically
- ✅ Uni-Vault refuses damaged, replaced, or wrong-key files and never overwrites them; Reconnect and Unlink in Sync, Reconnect in the popup
- ✅ Brave detection with a User Guide section explaining the one Brave setting Uni-Vault needs
- ✅ Searchable User Guide opened from the popup menu, covering setup, every setting, security, transport, backups, and recommended setups
- ✅ Key import offers fingerprint or device PIN first, with a password as the fallback
- ✅ Changing unlock methods and Clear Vault require re-authentication; remaining password prompts masked
- ✅ Discord link in About, and About links open in a new tab

### v0.7.2 - Password Generator (Sep 2026)

- ✅ Inverted V on new password and change password fields generates a random password and fills both the new and confirm boxes
- ✅ Generated passwords always mix upper, lower, digits, and symbols, and follow any length, pattern, or password rules the site declares
- ✅ Password Generator settings: minimum 16 or 20, maximum 24, 32, 48, or 64, each maximum with its own range (minimum to 24, 25 to 32, 33 to 48, 49 to 64)
- ✅ Change password forms: the current password field fills the saved login, and the save prompt updates the right account
- ✅ Previous password kept after a change, shown as a labeled second choice with one-click restore, dropped after 3 uses and 14 days
- ✅ Settings shows auto-lock as hours, minutes, and seconds and QR stream timeout as minutes and seconds; auto-lock limit raised to 2 hours
- ✅ Revealed passwords in Manage no longer run under the edit and delete buttons, up to 64 characters
- ✅ Popup border on the sides and bottom with rounded bottom corners

### v0.7.1 - Protected Master Key Transfer (Sep 2026)

- ✅ Share Master Key and Export Key carry the master key wrapped under a passphrase and three security questions (PBKDF2-SHA256, 1,000,000 iterations); the raw key never leaves the device
- ✅ The receiving device must enter the passphrase and all three answers before a scanned key or key file is accepted; wrong answers change nothing
- ✅ Users pick their three questions; the protection is set once and reused, so sharing stays one click; Change Key Passphrase replaces it
- ✅ Common passwords refused as a key passphrase, with a four-random-words recommendation
- ✅ Raw key QR codes from older versions refused
- ✅ Every password prompt in Manage moved to masked Valid Vault dialogs; Personal Info edits try fingerprint or device PIN first
- ✅ Crypto Wallets locks itself on Manage or browser tab switch and after the auto-lock time
- ✅ Auto-lock resets on real activity anywhere in the browser, and an open Manage tab no longer locks the vault while you work elsewhere
- ✅ About shows the version from the extension manifest

### v0.7.0 - Crypto Wallets and Encrypted Bookmarks (Sep 2026)

- ✅ Crypto Wallets tab: seed phrases organized by wallet and account, 1 to 24 numbered words per account plus one optional note
- ✅ Offline seed word checking against the bundled 2048-word BIP-39 English list (SHA-256 verified against the official list), with suggestions, unknown-word warnings, and a full-phrase checksum check
- ✅ Seed words only render while shown, and hide on window blur, browser tab switch, Manage tab switch, lock, or the auto-lock timer
- ✅ Encrypted bookmarks: popup bookmark icon (hollow or filled), side panel list with search, rename, remove, and drag reorder
- ✅ Wallets and bookmarks each sealed as one compressed AES-GCM blob; nothing about them readable at rest
- ✅ Both travel in the encrypted vault file with deterministic merges: permanent IDs, newest edit wins, tombstoned deletes, no duplicates, and the same account labels on every device
- ✅ On-page unlocks open a Valid Vault window with Windows Hello or password, handled in the extension's own origin
- ✅ Popup lock button fixed, and the popup picks up an unlock done anywhere else
- ✅ Globe-in-a-V extension icons, centered Manage layout, and the login email picker keeps saved logins when the form loads late

### v0.6.4 - Extension Hotfix for v0.6.3 (Sep 2026)

- ✅ Master key import (file and QR) warns when the browser's vault uses a different key, clears it on confirmation, and saves the imported key under the browser's unlock methods so it survives lock and unlock
- ✅ Key file import no longer always reports a wrong passphrase
- ✅ Deletes now propagate through sync - merges keep tombstones for logins and Web Credentials
- ✅ Migration journal stores a SHA-256 fingerprint instead of a plaintext copy of the vault
- ✅ Manage lists Website Credentials again under single-blob storage
- ✅ Background auto-lock follows the seconds setting; a fresh unlock and Manage activity count as activity
- ✅ Click-to-fill V tags on Personal Info, login email/username, and password fields; no fill on page load and no focus popup
- ✅ Locked save prompt unlocks in place with a masked password box and show/hide toggle; clicking outside no longer discards the capture
- ⚠️ Extension-only - the phone app still needs the same key import, QR, and whole-vault fixes

### v0.6.3 - Single-Blob Vault Encryption and Migration Hardening (Sep 2026)

- ✅ Website Credentials sealed as a single AES-GCM vault blob - domain names, credential IDs, timestamps, login types, usernames, passwords, and per-site extra fields all stay encrypted at rest
- ✅ Vaults migrate automatically on first unlock: backed up encrypted under a short-lived migration journal, converted to the blob, and verified against a full-tree fingerprint before the journal clears
- ✅ Unsupported or malformed vault rows now fail closed instead of being misread - an unrecognized `schemaVersion` or a `schemaVersion: 2` row missing its blob throws rather than being treated as an empty legacy vault
- ✅ Decrypted vault-tree validation deepened to check every domain's credential list, not just the top-level shape, so a malformed blob is caught immediately instead of crashing later
- ✅ Unknown fields on a legacy credential now survive migration into the new tree instead of being silently dropped
- ✅ Pairing and sync require both devices to share the same master key - a mismatched key fails with a clear error
- ✅ `loginType` field (username/email/phone) on Website Credentials for more reliable autofill matching

### v0.6.2 - Website Credentials Save Fix and Autofill Hardening (Sep 2026)

- ✅ Website Credentials save regression resolved at the root - `detectLoginForm()`/`matchSignupFieldType()` now use per-form closures instead of shared mutable globals, fixing the multi-form state collision that caused the v0.6.1 rollback
- ✅ Submit-triggered navigation losing the save prompt - captured credentials now stage in `background.js` synchronously and are recovered on whatever page loads next in the same tab, surviving cross-domain SSO/MFA redirects and multi-hop flows, with a stage/resolve ordering race closed via per-tab serialization
- ✅ False-positive personal-info classification fixed - bare single-word keywords (state, city, zip) now only match against structured signals (name/id/autocomplete), never free text
- ✅ Autofill now compatible with React/Vue-style controlled inputs via the native value-property setter
- ✅ Duplicate save prompts from one submission collapsed via an in-flight capture guard
- ✅ Fields reclassified when a framework sets their identifying attributes after insertion, instead of staying unrecognized
- ✅ Detached SPA forms and personal-info field tags no longer leak listeners indefinitely after removal
- ✅ Formless (no wrapping `<form>`) login widgets no longer cross-trigger each other's capture on a single click
- ✅ Personal Info autofill and per-site extra fields extended to `<select>` and `<textarea>`
- ✅ Activity tracking extended to ordinary typing, passive autofill, dropdown opens, and pending-save recovery, closing gaps that could lock the vault mid-use
- ✅ Pending-save recovery is tab-scoped with a 45s window, so a save survives cross-domain SSO/MFA redirects

### v0.6.1 - Autofill Injection Foundation (Sep 2026)

- ✅ Personal Info autofill on page load: empty, matched fields populate via a three-tier heuristic (autocomplete match, then keyword match, then nearby label text)
- ✅ Email fields are click-to-pick from a small on-field picker listing every saved, ranked email - never auto-filled silently
- ✅ Website Credentials autofill shows a picker of saved usernames for the current site; injection only, no password reveal
- ✅ Visible field tag marks anything Valid Vault has matched, repositioning on scroll/resize
- ✅ Inline unlock directly on a locked page when a tagged field is clicked - password-only, since a WebAuthn platform credential can't be triggered from a page's own origin
- ✅ Fixed a `VersionError` bug: background.js had `indexedDB.open('ValidVault', 1)` hardcoded in three places, silently breaking background vault access once the database reached version 3
- ✅ Fixed a popup/background race condition that could drop the session key on a fast tab switch, by delegating the session-key write to background.js
- ⚠️ Website Credentials still does not reliably save new logins captured from a real signup flow - a fix was built, caused a regression, and was rolled back; root cause understood, not yet resolved

### v0.6.0 - Web Credentials, Personal Info, Uni-Vault Key Fix (Sep 2026)

- ✅ Personal Info tab: name, phone, address, ranked/reorderable emails; view unlocks normally, edit requires the master password specifically
- ✅ Web Credentials gained a working Edit (previously add/delete only)
- ✅ Website Credentials and Web Credentials both require their own explicit re-unlock inside Manage
- ✅ Personal Info, Web Credentials, and logins all now travel together through Share/Export/Import/QR sync
- ✅ Fixed persistent key import - an imported master key now re-wraps under the browser's own unlock methods, so it genuinely becomes the browser's key going forward instead of silently reverting on next unlock. This was the real gap in using one vault file across multiple browsers with a shared master key.
- ✅ Save-on-submit prompt now checks existing saved state first - silent on an unchanged login, a save prompt for a new username, an update prompt for a changed password
- ✅ Tracked down and resolved a Windows Hello / passkey chooser issue during this cycle, confirmed via actual commit history to be Windows account state, not the extension's code

### v0.5.5 - Export Fix and Native File Saving (Sep 2026)

- ✅ Fixed Export Vault appearing to silently fail; added native Filesystem/Share-based file saving

### v0.5.4 - Phone De-Drift to Extension Parity (Sep 2026)

- ✅ About synced to match the extension; collapsible view/delete-only credentials list; inline unlock overlay

### v0.5.3 - Extension De-Drift to Phone Parity (Sep 2026)

- ✅ Custom app PIN removed from the extension; Sync tab rebuilt to Share/Backup/Scan model

### v0.5.0-v0.5.2 and earlier

- ✅ Native biometric auth, phone QR sync and encrypted backup, sovereign QR scanner, terminal-green rebrand - see CHANGELOG.md for full detail

---

## Upcoming After v0.7.3

### v0.8.x - Phone De-Drift (Next)

- Key import that survives lock and unlock with the same warning flow, working key file import, and visible scan results
- The protected key format on the phone, so phone and extension key transfer over QR works again with the passphrase and questions
- Whole-vault carry on the phone: Web Credentials, Personal Info, bookmarks, and Crypto Wallets
- Personal Info tab on the phone

This is feature work. The vault stays encrypted throughout, and nothing about it changes how data is protected.

### v0.8.2 - Scanner Reliability

- QR scanner reliability on real devices and cameras, including scans that stall before completing
- Bookmarks QR share
- Unlock behavior quirks reported by community testing

### Autofill Hardening

- Custom div-based combobox and `contenteditable` field support - no standard attribute signal exists for either, so this needs its own approach rather than an extension of the current classifier
- Broader real-world testing of the heuristic field matcher across more sites

## Future Considerations (Post-1.0)

### Extended Personal Info

- Social Security number and credit/debit card storage - deliberately held back for now, pending additional security work

### Platform Hardening

- Per-method auth edit and delete on the phone Manage tab
- Native background-lifecycle lock guarantees on Android

---

## Known Limitations

⚠️ **This build is under active testing** - expect frequent changes

⚠️ **Autofill matching quality varies site to site** - this is something I am very aware of. The foundation works, polish is ongoing

⚠️ **Save prompts are matched to your browser tab, not the exact page** - so they survive a login redirect (like SSO or MFA) instead of getting lost. In rare cases, navigating elsewhere in that same tab within the 45-second window could bring the prompt up there too - a minor UX quirk, not a credential leak.

⚠️ **Auto-lock is a foreground inactivity timer** on the phone - exact timing while backgrounded is subject to OS suspension

⚠️ **Per-method auth edit and delete deferred on the phone**

⚠️ **SSN and card storage deliberately deferred**, pending security work

⚠️ **Phone and extension key transfer over QR waits for the phone de-drift** - the extension now refuses unprotected key QRs, and the phone learns the protected format in v0.8.x; the key file path works between them in the meantime

⚠️ **The password generator and the 2 hour auto-lock limit are extension-only for now** - the phone keeps its 1 hour limit until the v0.8.x de-drift

⚠️ **Uni-Vault needs a browser setting in Brave** - Brave ships the File System Access API switched off; Chrome and Edge work out of the box, and Brave users can switch it on or keep using Export and Import

⚠️ **Uni-Vault syncs browsers on one computer** - moving the vault between devices is still Export and Import or QR

⚠️ **Crypto Wallets and bookmarks are extension-only for now** - the phone app receives them in the v0.8.x de-drift; both stay encrypted in the vault file in the meantime

⚠️ **A lost key-file passphrase and answers cannot be recovered. Writing these down and storing them safely is highly recommended.**

**These are intentional staging decisions or known open bugs, not oversights or knowledge gaps.**

---

## Contributing

Valid Vault is currently in solo development by Rook.

---

## License

MIT License - See LICENSE file for details

---

**Last Updated:** Sep 30, 2026