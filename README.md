# Valid Vault Password Manager

A local, encrypted, QR code portable password manager. No cloud, no accounts, no sync servers. Your credentials live on your device, encrypted under keys only you can produce, and move between devices over a fully local QR stream or an encrypted backup file.

**Status: Active testing.** Core functionality works end to end, and the project is being hardened through real device use before a wider release. See [ROADMAP.md](ROADMAP.md) for what's tested and what's still in progress.

---

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
- Auto-lock inactivity timer in seconds, locks the vault and returns to the lock screen
- Both surfaces show an inline unlock overlay on session timeout instead of a dead end
- Website Credentials, Web Credentials, and Personal Info each require their own explicit re-unlock inside Manage; editing Personal Info specifically requires the master password, never fingerprint
- The extension can also be unlocked inline, directly on a page, when a tagged field is clicked while locked - password-only, since a WebAuthn platform credential can't be triggered from a page's own origin

**Autofill (Extension):**
- Personal Info fields (name, phone, address) auto-populate matched, empty fields on page load
- Email fields are click-to-pick from a small on-field picker listing every saved, ranked email, never auto-filled silently
- Website Credentials show a picker of saved usernames for the current site; injection only, no password reveal - that's the site's own UI if it has one
- A visible field tag marks anything Valid Vault has matched
- Foundation is working end to end; matching quality and reliably saving new logins from real signup flows are still being hardened

**Sync and Backup:**
- Live QR sync - stream your vault or your key as a one-way fountain QR, scan it on the other device
- Sovereign scanner - the standard web camera plus a vendored jsQR decoder, no Google dependency
- Encrypted vault backup - save directly to Downloads or share the file, inert without the matching master key
- Encrypted key backup - export the master key wrapped under a passphrase and three security questions, high-iteration KDF, never stored
- Logins, Web Credentials, and Personal Info all travel together through the same export/import/QR flow, merged by timestamp with tombstoned deletes

**Vault:**
- Per-credential AES-GCM encryption
- Website Credentials - logins grouped by site, multiple usernames per site supported, matched by username on merge
- Web Credentials - category-organized secrets like Wi-Fi passwords or license keys, view/edit/delete
- Personal Info - one profile per vault: name, phone, address, and ranked emails, used as an autofill source only, never stored per-site
- IndexedDB persistence - no external database or server

**Platform:**
- Single-file web bundle - modules assembled by build.js into one self-contained HTML file
- Android via Capacitor, with native plugins for biometric auth and file saving
- Vendored, self-contained code only, no Google SDKs in the scan path

## Current Status: v0.6.1 - Active Testing

**Completed:**
* ✅ Master key wrap architecture, verify-by-unwrap, no stored hashes
* ✅ Native Android biometric unlock; extension fingerprint/PIN via WebAuthn
* ✅ 12+ character password rule with letter, number, and symbol enforced everywhere
* ✅ Persistent key import - the real fix behind using one vault across multiple browsers
* ✅ Phone and extension QR sync, encrypted vault/key backup and restore, native file saving
* ✅ Website Credentials, Web Credentials, and Personal Info, all encrypted, all synced together
* ✅ Sovereign QR scanner, inline unlock overlays, seconds-based auto-lock
* ✅ Autofill injection foundation - Personal Info and Website Credentials autofill working end to end

**In Development:**
* 📋 Website Credentials reliably saving new logins captured from real signup flows - a known regression is currently rolled back and unresolved
* 📋 `loginType` field (username/email/phone) on Website Credentials for more reliable matching
* 📋 Continued field testing of sync, backup, and native file saving across Android versions
* 📋 Per-method auth edit and delete on the phone Manage tab

## Sync and Backup Model

Master key transport is deliberate. The primary path is a live QR stream: one device shows its key or vault as a fountain QR, the other scans it. For disaster recovery there is an offline path: Export Vault saves the encrypted vault directly to Downloads or through the native share sheet, and Export Key writes the master key wrapped under a passphrase plus three security questions, stretched with a high-iteration KDF, never stored.

Because importing a key now persists, the same vault file genuinely works the same way everywhere: set a password in Chrome, export the vault, import the key and the vault into Firefox with the same password, add a credential there, export again, and Chrome picks up the change on its next import. No server, no account, just timestamp-based merge.

## Security Model

**Encryption at rest:**
- Passwords are wrapped with PBKDF2-SHA256 at 600,000 iterations
- On Android, the master key is additionally wrapped by a hardware Keystore key gated on device authentication
- Exported key files are wrapped at a higher iteration count, gated by a passphrase and security questions that are never stored
- No verification hashes are stored; the AES-GCM auth tag is the only verifier

**No Google in the scan path.** The scanner uses the web camera and a vendored jsQR decoder, which runs entirely on device.

**Locking is enforced end to end.** A manual or timeout lock clears the shared session key everywhere it was stored, so a locked session cannot silently resume.

**Personal Info gets a stricter gate.** Viewing it requires a normal unlock; adding or editing any field requires the master password specifically, not fingerprint.

**Autofill never exposes the master key.** background.js is the only place the session key lives; content.js, running in the page's own context, only ever receives specific plaintext values it explicitly requested for injection. Inline unlock is password-only for the same reason a content script can't trigger a WebAuthn platform credential bound to the extension's own origin.

**No competitor-targeting logic exists or is planned.** Autofill competes on being fully local and already-unlocked in memory, not on hiding another password manager's UI.

**Design boundaries:**
- Domain names are currently stored as plaintext object keys. Single-blob vault encryption is planned.
- Physical access to an unlocked device is outside the threat model.
- Auto-lock is a foreground inactivity timer; exact timing while backgrounded is subject to OS suspension.
- Live QR transport is protected by physical privacy, not by a handshake.

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

**Safe Autofill Injection:**
background.js holds the session key and does all decryption; content.js, running in the visited page's own origin, only ever receives the specific plaintext value it asked for (a name, a saved login) and never the master key itself. Inline unlock on a locked page is password-only, since a WebAuthn platform credential is bound to the extension's own origin and can't be triggered from a page's origin.

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
Pre-1.0, under active testing. Community review welcome. auth.js, crypto.js, session.js, and the native plugins are the surfaces that matter.

## License

MIT License - See LICENSE file

Copyright (c) 2025-2026 by Rook

## Acknowledgements

Built and maintained by Rook.

---

**"Your passwords. Your device. Your keys. Nothing given is nothing leaked."**