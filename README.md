# Valid Vault Password Manager

A local, encrypted, QR code portable password manager. No cloud, no accounts, no sync servers. Your credentials live on your device, encrypted under keys only you can produce, and move between devices over a fully local QR stream or an encrypted backup file.

**Status: Active testing.** Core functionality works end to end, and the project is being hardened through real device use before a wider release. See [ROADMAP.md](ROADMAP.md) for what's tested and what's still in progress.

---

> ✅ **Password Generator - v0.7.2**
>
> New password and change password fields now get an inverted V that generates a strong random password and fills both the new and confirm boxes. It uses the browser's cryptographic random source, always mixes upper, lower, digits, and symbols, and follows any length or character rules the site declares. Length is set in Settings, from 16 up to 64 characters in four ranges. Changing a password keeps the old one as a labeled previous password with one-click restore, in case the site never accepted the change. Settings also shows timeouts as readable time, and the auto-lock limit is now 2 hours. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Protected Master Key Transfer - v0.7.1**
>
> The master key no longer travels as a raw key. Share Master Key and Export Key now carry it wrapped under a passphrase and three security questions you pick, stretched with 1,000,000 PBKDF2 rounds, and the receiving device must enter all of them before it can use the key. A captured key QR or a stolen key file is useless without them. Sharing stays one click after a one-time setup, common passwords are refused, and every password prompt in Manage is now a masked Valid Vault dialog. Personal Info edits try fingerprint or device PIN first. Also fixes Crypto Wallets locking on tab switch and the auto-lock timer ignoring activity outside the Manage page. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Crypto Wallets and Encrypted Bookmarks - v0.7.0**
>
> The extension now stores crypto wallet seed phrases and bookmarks inside the same encrypted vault as your logins. Seed phrases are organized by wallet and account, checked word by word against the standard 2048-word seed phrase list, and only visible while you choose to show them. Bookmarks are saved from a new icon in the popup and listed in a side panel with search and drag reorder. Both sections are sealed as single AES-GCM blobs, nothing about them is readable at rest, and they travel between browsers through the encrypted vault file. On-page unlocks now open a Valid Vault window with Windows Hello, and the popup lock button is fixed. See [Crypto Wallet and Bookmark Security](#crypto-wallet-and-bookmark-security) and [CHANGELOG.md](CHANGELOG.md) for full details.

> 🔧 **Phone app and QR transport: in active development**
>
> The phone app is being brought up to the extension's feature set (v0.8.x), and live QR scanning is getting its next round of refinement (v0.8.2). Your data stays encrypted through all of it; this is feature work, and nothing about it changes how the vault is protected. Until it lands, Export Vault and Import Vault move the complete vault between browsers.

> ✅ **Extension Hotfix for v0.6.3 - v0.6.4**
>
> Fixes key import, sync, migration, and autofill problems found after v0.6.3. Importing a master key now warns when this browser's vault was made with a different key and then saves the imported key for good, deletes now sync correctly, the migration journal no longer holds a plaintext copy of the vault, and Manage lists your logins again. Autofill moved to click-to-fill V tags on every matched field, including login email and password fields, and a locked save prompt now unlocks in place. Extension-only; the phone app gets the same key and transport fixes next. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Single-Blob Vault Encryption and Migration Hardening - v0.6.3**
>
> Website Credentials now live behind one AES-GCM encrypted blob instead of per-credential encryption, so domain names, credential IDs, timestamps, login types, usernames, passwords, and per-site extra fields are no longer readable from the Website Credentials database row at rest. Existing vaults migrate automatically on first unlock, backed by an encrypted short-lived recovery journal and a full-tree fingerprint check after conversion, with automatic rollback if anything doesn't match. Devices must now import the same master key before syncing; a mismatched key fails clearly instead of being silently reconciled. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Website Credentials Save Fix and Autofill Hardening - v0.6.2**
>
> Resolves v0.6.1's top-priority gap: Website Credentials now reliably saves new logins from real signup flows, fixed at the root (per-form state instead of shared globals). Also closes out a long list of autofill correctness issues found across several rounds of independent code review - the submit/navigation save race, false-positive field classification, React/framework compatibility, duplicate save prompts, detached-form listener leaks, formless-widget button ownership, and `<select>`/`<textarea>` support. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Autofill Injection Foundation - v0.6.1**
>
> The extension now reads Personal Info and Website Credentials to autofill page forms - Personal Info fields populate on load, email fields are click-to-pick since a profile can hold several ranked emails, and a visible field tag marks anything matched. Fixed a `VersionError` bug that had silently broken background vault access, and a popup/background race that could drop the session key on a fast tab switch. Website Credentials still doesn't reliably save new logins from a real signup flow - see [CHANGELOG.md](CHANGELOG.md) for the known gap.

> ✅ **Web Credentials, Personal Info, and Uni-Vault Key Fix - v0.6.0**
>
> The extension gained a Personal Info tab (name, phone, address, ranked emails) and a working Edit for Web Credentials. Fixed a real gap where an imported master key didn't persist past a lock/unlock, which is what makes the same vault file usable across multiple browsers with one shared key. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Export Fix and Native File Saving Notice - v0.5.5**
>
> Export Vault now gives real feedback instead of silently doing nothing, and saves through Capacitor's native Filesystem and Share APIs. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Phone De-Drift Notice - v0.5.4**
>
> The phone app matches the browser extension's auth model and interface. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Extension De-Drift Notice - v0.5.3**
>
> The browser extension matches the phone app's auth and sync model. See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## What is Valid Vault?

Valid Vault is a self-hosted password manager built on a master key wrap architecture. One random 256-bit master key encrypts your vault. That key is never stored raw, it's wrapped independently under each unlock method you set up, and unwrapping it is the act of authentication itself.

**How unlock works:**
- Password - wrapping key derived via PBKDF2-SHA256 at 600,000 iterations with a per-wrap salt, minimum 12 characters with a letter, a number, and a symbol
- Device unlock (Android) - the master key is wrapped by a hardware-backed Android Keystore key that requires device authentication (fingerprint or system PIN) to use
- Device unlock (extension) - the platform authenticator via WebAuthn, covering fingerprint and the device's own PIN
- Wrong credential means the unwrap fails. There is no stored hash to attack, no shortcut, no oracle.

No cloud service holds your data. No company can be subpoenaed for it or breached for it, and there is never any data for anyone to sell. You cannot leak what you never sent anywhere.

**One vault, many surfaces.** The same master key that unlocks your vault on one browser unlocks the same vault file on another browser, or on the phone. Import a key once and it becomes that browser's key going forward, export the vault, import it elsewhere, and every surface stays in sync through the same timestamp-based merge logic, no server involved.

---

## Core Features

**Key Protection:**
- Master key wrap architecture - one key, independently wrapped per unlock method
- Verify-by-unwrap - the GCM auth tag is the verifier, nothing cheaper exists in storage
- Android: hardware-backed Keystore key gated by device authentication
- Extension: platform authenticator (fingerprint / device PIN) via WebAuthn
- Importing a key re-wraps it under the browser's own unlock methods, so it persists across lock and unlock rather than silently reverting

**Unlock and Locking:**
- Fingerprint, device PIN, and password all fully unlock the vault
- Auto-lock inactivity timer in seconds, up to 2 hours on the extension, shown next to the setting as hours, minutes, and seconds; locks the vault and returns to the lock screen
- Both surfaces show an inline unlock overlay on session timeout instead of a dead end
- Website Credentials, Web Credentials, and Personal Info each require their own explicit re-unlock inside Manage; every unlock and Personal Info edit tries fingerprint or device PIN first, with the master password as the fallback in a masked dialog
- Clicking a tagged field or a save prompt while locked opens a small Valid Vault unlock window with Windows Hello (fingerprint or device PIN) or password; the unlock runs in the extension's own origin, never in the visited page
- Crypto Wallets requires its own explicit unlock inside Manage, and locks itself again when you switch Manage tabs or browser tabs, or after the auto-lock time
- Mouse movement, scrolling, clicks, and typing anywhere in the browser count as activity for auto-lock; only real input counts, so a page cannot fake activity to keep the vault open

**Autofill (Extension):**
- Personal Info fields (name, phone, address) get a V tag; clicking it opens a picker with the saved value and fills only on click, including `<select>` and `<textarea>` fields (a state/country dropdown is matched by its actual option, never a blind value assignment)
- Email fields are click-to-pick from a small on-field picker listing every saved, ranked email, never auto-filled silently
- Login email/username and password fields get a V tag listing saved logins for the current site (and saved emails on email fields); injection only, no password reveal - that's the site's own UI if it has one
- New password and change password fields get an inverted V that generates a random password and fills both the new and confirm boxes; the current password field on a change form keeps the normal V and fills the saved login
- Generated passwords always include upper, lower, digit, and symbol, follow any `maxlength`, `minlength`, `pattern`, or `passwordrules` the site declares, and land in the length range chosen in Settings (minimum to 24, 25 to 32, 33 to 48, or 49 to 64)
- Changing a password keeps the old one as a previous password, shown as a labeled second choice in the login picker with one-click restore; it is dropped only after the new password has been used 3 times and 14 days have passed
- A save prompt shown while the vault is locked offers Unlock and Save, which opens the Valid Vault unlock window and saves once unlocked
- A visible field tag marks anything Valid Vault has matched
- Website Credentials reliably saves new logins from real signup flows, including submit-triggered navigation, cross-domain SSO/MFA redirects, and multi-form pages
- Each saved login now classifies its `loginType` (username, email, or phone) for more reliable matching
- Custom div-based comboboxes and `contenteditable` fields remain unsupported; matching quality on unusual sites is still being hardened

**Sync and Backup:**
- Live QR sync - stream your vault or your protected key as a one-way fountain QR, scan it on the other device
- Sovereign scanner - the standard web camera plus a vendored jsQR decoder, no Google dependency
- Encrypted vault backup - save directly to Downloads or share the file, inert without the matching master key
- Protected key transfer - the master key only leaves a device wrapped under a passphrase and three security questions you pick, stretched with 1,000,000 PBKDF2 rounds; the same package goes into the key QR and the key file, and the receiving device must enter all of them to accept it
- Set once, reused after - the protection is set on the first key share or export, then Share Master Key and Export Key are one click; Change Key Passphrase replaces it
- Common passwords are refused as a key passphrase, and the form recommends four or more random words
- Logins, Web Credentials, and Personal Info all travel together through the same export/import/QR flow, merged by timestamp with tombstoned deletes
- Bookmarks and Crypto Wallets travel inside the encrypted vault file (Export Vault / Import Vault) with the same tombstoned-delete merge; seed phrases are kept out of the live QR share, and a bookmarks QR share is planned for v0.8.2
- Syncing now requires both devices to already share the same master key; a mismatched key fails with a clear error instead of being silently reconciled
- Importing a master key onto a browser whose vault uses a different key warns first, clears that vault on confirmation, and saves the imported key under the browser's unlock methods (extension; phone follows next release)
- Raw key QR codes from older versions are refused; phone and extension key transfer over QR resumes when the phone learns the protected format in the phone de-drift, and the key file path works in the meantime

**Vault:**
- Website Credentials are encrypted as one AES-GCM vault blob rather than per-credential, so domain names, credential IDs, and login types are no longer readable at rest
- Web Credentials and Personal Info remain individually AES-GCM encrypted, per credential
- Website Credentials - logins grouped by site, multiple usernames per site supported, matched by username on merge
- Web Credentials - category-organized secrets like Wi-Fi passwords or license keys, view/edit/delete
- Personal Info - one profile per vault: name, phone, address, and ranked emails, used as an autofill source only, never stored per-site
- Crypto Wallets - seed phrases organized by wallet and account, 1 to 24 numbered words per account plus one optional note (for example a wallet password), stored as one sealed AES-GCM blob
- Bookmarks - saved from the popup's bookmark icon, listed in a side panel with search, rename, remove, and drag reorder, stored as one sealed AES-GCM blob
- IndexedDB persistence - no external database or server

**Platform:**
- Single-file web bundle - modules assembled by build.js into one self-contained HTML file
- Android via Capacitor, with native plugins for biometric auth and file saving
- Vendored, self-contained code only, no Google SDKs in the scan path

## Current Status: v0.7.2 - Active Testing

**Completed:**
* ✅ Master key wrap architecture, verify-by-unwrap, no stored hashes
* ✅ Native Android biometric unlock; extension fingerprint/PIN via WebAuthn
* ✅ 12+ character password rule with letter, number, and symbol enforced everywhere
* ✅ Persistent key import - the real fix behind using one vault across multiple browsers
* ✅ Phone and extension QR sync, encrypted vault/key backup and restore, native file saving
* ✅ Website Credentials, Web Credentials, and Personal Info, all encrypted, all synced together
* ✅ Sovereign QR scanner, inline unlock overlays, seconds-based auto-lock
* ✅ Autofill injection foundation - Personal Info and Website Credentials autofill working end to end
* ✅ Website Credentials reliably saves new logins from real signup flows, including cross-domain and multi-step ones
* ✅ Personal Info autofill and per-site extra fields extended to `<select>` and `<textarea>`
* ✅ `loginType` field (username/email/phone) on Website Credentials for more reliable matching
* ✅ Website Credentials encrypted as a single AES-GCM vault blob, with automatic migration, an encrypted recovery journal, and full-tree fingerprint verification for existing vaults
* ✅ Extension key import that survives lock and unlock, deletes that sync, and click-to-fill V tags on every matched field
* ✅ Crypto Wallets: encrypted seed phrase storage by wallet and account, with on-device seed word and checksum checking
* ✅ Encrypted bookmarks with a popup bookmark icon and a searchable, reorderable side panel
* ✅ Windows Hello unlock window for on-page unlocks; popup lock button fixed
* ✅ Protected master key transfer: passphrase and three chosen security questions required on the receiving device for both the key QR and the key file
* ✅ Masked Valid Vault dialogs for every password prompt in Manage, and fingerprint first for Personal Info edits
* ✅ Password generator on new and change password fields, with length ranges set in Settings
* ✅ Previous password safety net with one-click restore after a password change

**In Development:**
* 📋 Phone de-drift (v0.8.x): key import, whole-vault carry including bookmarks and wallets, and Personal Info on the phone
* 📋 QR scanner reliability on real devices and a bookmarks QR share (v0.8.2)
* 📋 Custom div-based combobox and `contenteditable` field support
* 📋 Continued field testing of sync, backup, and native file saving across Android versions
* 📋 Per-method auth edit and delete on the phone Manage tab

## Sync and Backup Model

Master key transport is deliberate. The primary path is a live QR stream: one device shows its vault or its protected key as a fountain QR, the other scans it. The key is always wrapped under a passphrase plus three security questions the owner picks, stretched with 1,000,000 PBKDF2 rounds, and the receiving device has to enter all of them before the key can be used, so a captured QR is as useless as a stolen file. For disaster recovery there is an offline path: Export Vault saves the encrypted vault directly to Downloads or through the native share sheet, and Export Key saves the same protected key package as a file.

Because importing a key now persists, the same vault file genuinely works the same way everywhere: set a password in Chrome, export the vault, import the key and the vault into Firefox with the same password, add a credential there, export again, and Chrome picks up the change on its next import. No server, no account, just timestamp-based merge.

Since Website Credentials moved to single-blob encryption, merging requires both devices to already hold the same master key. If the local and incoming keys don't match, sync now fails with a clear error rather than silently picking one key or reconciling the difference.

## Security Model

**Encryption at rest:**
- Passwords are wrapped with PBKDF2-SHA256 at 600,000 iterations
- On Android, the master key is additionally wrapped by a hardware Keystore key gated on device authentication
- The master key only leaves a device wrapped at 1,000,000 PBKDF2 iterations under a passphrase and three security answers, in both the key QR and the key file; the passphrase and answers are never stored
- No verification hashes are stored; the AES-GCM auth tag is the only verifier
- Website Credentials are stored as a single encrypted blob, so no domain name, credential ID, timestamp, login type, username, password, or extra field is readable from the raw database row

**No Google in the scan path.** The scanner uses the web camera and a vendored jsQR decoder, which runs entirely on device.

**Locking is enforced end to end.** A manual or timeout lock clears the shared session key everywhere it was stored, so a locked session cannot silently resume.

**Fingerprint first, password as the fallback.** Unlocking a section in Manage and editing Personal Info try fingerprint or device PIN first, the strongest local method, and fall back to the master password in a masked dialog. Importing a key still asks for the browser's password directly, because the imported key is re-locked under that password.

**Autofill never exposes the master key.** background.js is the only place the session key lives; content.js, running in the page's own context, only ever receives specific plaintext values it explicitly requested for injection. Unlocking from a page opens a separate extension window, so the password and the WebAuthn credential are only ever handled in the extension's own origin, never typed into or triggered from the visited page.

**Seed phrases and bookmarks never reach web pages.** No background message handler serves wallet or bookmark data to a content script. They are decrypted only inside extension pages (Manage, the popup, and the bookmarks side panel).

**No competitor-targeting logic exists or is planned.** Autofill competes on being fully local and already-unlocked in memory, not on hiding another password manager's UI.

**Design boundaries:**
- Website Credentials migrate to single-blob encryption automatically on first unlock; older vaults are read once, converted, verified, and backed up under an encrypted recovery journal during that migration
- Physical access to an unlocked device is outside the threat model
- Auto-lock is a foreground inactivity timer; exact timing while backgrounded is subject to OS suspension
- A captured save-prompt is tracked per browser tab, not per destination page, for up to 45 seconds - deliberately, so it survives a cross-domain SSO/MFA redirect. The tradeoff is a narrow window where an unrelated page loaded in that same tab could recover the same prompt
- Live QR transport has no handshake. A captured vault stream is ciphertext under the master key, and a captured key stream is wrapped under the passphrase and three security answers, so neither is usable on its own. Someone who both captures the key QR and watches the passphrase and answers being typed could still take the key

## Crypto Wallet and Bookmark Security

Seed phrases are the highest-value secret most people own, and the common places they end up (a notes app, a screenshot in a photo library, a cloud document, an email to yourself) are either unencrypted or readable by the provider that syncs them. Crypto Wallets gives them the same protection as the rest of the vault: encrypted at rest under a key only the owner can unwrap, never sent to any server, and portable between devices only as ciphertext.

**What is stored, and how:**
- The entire Crypto Wallets section (wallet names, account names, seed words, notes, timestamps, and ordering) is serialized once, deflate-compressed, and encrypted as a single AES-256-GCM blob under the vault master key, with a fresh random 96-bit IV on every write. The IndexedDB row holds only `{schemaVersion, blob: {iv, data}}`.
- Nothing about the contents is readable at rest: no wallet names, no account names, no count of wallets or accounts, no word counts. The ciphertext length does reveal the approximate total size of the section, as with any encryption.
- Bookmarks use the identical construction in their own row, so saved addresses and titles are not readable at rest either, unlike browser bookmarks, which sit in plain text in the browser profile.
- AES-GCM authenticates every blob. Any modification fails decryption. A row with an unrecognized `schemaVersion` or an unexpected shape throws instead of being treated as empty, so bad data can never be silently written over real data.
- Compression happens before encryption, entirely on the user's own data. Compression side channels (CRIME/BREACH) need an attacker to inject chosen content alongside the secret and watch ciphertext sizes across many requests; here there is no attacker-controlled input and no network channel, so that class of attack does not apply.

**Who can decrypt it:**
- The same master key wrap architecture as the rest of the vault: one random 256-bit master key, wrapped separately under the password (PBKDF2-SHA256, 600,000 iterations) and Windows Hello (WebAuthn PRF), with verify-by-unwrap and no stored hashes.
- While unlocked, the session key lives only in `chrome.storage.session`, which is memory-only and cleared when the browser closes. Locking, manually or by the inactivity timer, clears it everywhere.
- Crypto Wallets asks for its own unlock inside Manage even when the vault is already open.
- Seed words are never autofilled, never injected into a page, and never passed to a content script. No background message handler returns wallet data at all.

**On screen:**
- Words exist in the page only while Show is on. They are removed, and an open editor is covered, when the window loses focus, when you switch browser tabs, when you switch Manage tabs, when the vault locks, or when the auto-lock time runs out. This keeps seed words from sitting on screen during screen sharing, streaming, or walking away.
- Word boxes turn off browser autocomplete and spellcheck, so typed words are not kept in form history or sent to an online spelling service.

**Word checking, fully offline:**
- The standard 2048-word BIP-39 English list is bundled in the extension. Its SHA-256 (`2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda`) matches the official `english.txt`.
- Suggestions, unknown-word warnings, and the full-phrase checksum (computed with WebCrypto SHA-256) all run locally. Nothing is looked up online, and no dependency was added.
- An unknown word or a failed checksum warns and lets the owner decide, since some wallets use their own word lists. Editing saved words shows an explicit warning first.

**Moving between devices:**
- Wallets and bookmarks travel only inside the encrypted vault file, which is useless without the matching master key. Seed phrases are deliberately kept out of the live QR share.
- Merging is deterministic and never silently overwrites. Each account carries a permanent random ID, the newest edit wins per account, and deletes carry across as tombstones. The same seed saved twice in one wallet keeps the older copy. When two different accounts share a name, the older one keeps it and newer ones become `.1`, `.2`, computed the same way on every device, so any number of devices merged in any order reach the same result. Re-importing a file that was already merged changes nothing.
- Wallet names match exactly, so `Metamask` and `metamask` stay separate.

**Honest limits:**
- Malware running on a machine while the vault is unlocked can read whatever the vault can read. This is true of every password manager, and it is why auto-lock and hide-on-blur exist.
- Physical access to an already-unlocked device is outside the threat model.
- Losing the master key, and every backup of it, means losing the seed phrases stored here. Keep your wallet's own recovery backup as well.

## Quick Start - Forks and Experimentation Highly Encouraged!

### Prerequisites
- Node.js 18+
- Android Studio for device builds (optional)

### Build from Source
```bash
git clone https://github.com/HiImRook/valid-vault-password-manager.git
cd valid-vault-password-manager
node build.js
```

Open test.html in a browser, or build for Android:

```bash
npm install
npx cap sync
npx cap open android
```

## Architecture Highlights

**Verify-by-Unwrap:**
There are no stored password hashes. Authentication is the act of deriving a wrapping key and attempting the AES-GCM unwrap. The auth tag rejects wrong keys, so the cheapest offline attack is the full KDF.

**Persistent Key Import:**
Importing a master key re-wraps it under the browser's existing password (and fingerprint, if enrolled), so it becomes that browser's key going forward instead of reverting on the next unlock. This is the piece that makes the same vault file usable across Chrome, Firefox, and other browsers with one shared master key.

**Single-Blob Vault Encryption:**
The Website Credentials tree (meta plus every domain's credentials) is serialized once and encrypted as one AES-GCM blob, instead of encrypting each field independently. A legacy vault converts on first unlock: the old row is decrypted into a plaintext tree, backed up encrypted under a short-lived migration journal, re-encrypted as the new blob, and verified by comparing a full-tree fingerprint of what was converted against what was written back, with automatic rollback from the encrypted backup if anything doesn't match.

**Safe Autofill Injection:**
background.js holds the session key and does all decryption; content.js, running in the visited page's own origin, only ever receives the specific plaintext value it asked for (a name, a saved login) and never the master key itself. Unlocking from a locked page opens a small extension window, so Windows Hello and the password are handled in the extension's own origin, where the WebAuthn credential is bound.

**Password Generator:**
Passwords are drawn from `crypto.getRandomValues` with rejection sampling, so every character is equally likely, and shuffled with a Fisher-Yates pass after the required character classes are placed. Generation runs in the content script and needs no vault access; only saving the new login goes through background.js.

**Protected Key Transport:**
The master key is wrapped once under a passphrase and three chosen security answers (PBKDF2-SHA256, 1,000,000 iterations, AES-GCM), and that package is what the key QR and the key file carry. The package is saved on the device alongside a SHA-256 key identifier so it is reused only while it matches the current key. A receiving device verifies the answers by unwrapping, the same verify-by-unwrap rule as every other unlock, and keeps the package so it can share onward.

**Sealed Sections:**
Crypto Wallets and Bookmarks share one small module, sealed.js, that serializes a section, deflate-compresses it, and encrypts it as one AES-GCM blob with a fresh IV per write. Each section merges by permanent record IDs with tombstoned deletes, so the same vault file converges on every device.

**Native Biometric (Android):**
A custom Capacitor plugin bridges JavaScript to Android's BiometricPrompt. It creates a hardware-backed Keystore key that requires user authentication, then uses it to wrap the master key.

**Native File Saving (Android):**
A custom Capacitor plugin writes exported files directly to the Downloads folder through Android's MediaStore API, and Capacitor's Filesystem and Share plugins back the native share option.

**Sovereign QR Scanner:**
Scanning uses the web camera through getUserMedia, drawing frames to a canvas that a vendored jsQR decoder reads. No native scanning plugin, no Google SDK.

**Single-File Bundle:**
build.js assembles the source modules into one self-contained HTML file. No module loader, no CDN, no external requests at runtime.

## Related Projects

- **Valid Blockchain:** https://github.com/HiImRook/accessible-tpi-chain
- **Anonymous Memer Bot:** https://github.com/HiImRook/Anonymous-Memer-Bot

## Contributing

Contributions welcome. This project maintains a compact, readable codebase with strict architectural principles.

**Guidelines:**
- Open issue for large changes first
- Follow existing code style:
  - Zero comments (self-documenting names)
  - In-memory state management (Maps/Sets/objects)
  - Constants in SCREAMING_SNAKE_CASE
  - Complete file implementations (no fragments)
  - No new dependencies without discussion

## Security

**Vulnerability Reporting:**
Report security issues via GitHub Security Advisories.

**Audit Status:**
Pre-1.0, under active testing. Community review welcome. auth.js, crypto.js, session.js, keypackage.js, sealed.js, wallets.js, and the native plugins are the surfaces that matter.

## License

MIT License - See LICENSE file

Copyright (c) 2025-2026 by Rook

## Acknowledgements

Built and maintained by Rook.