# Valid Vault Password Manager

A local, encrypted, QR code portable password manager. No cloud, no accounts, no sync servers. Your credentials live on your device, encrypted under keys only you can produce, and move between devices over a fully local QR stream or an encrypted backup file.

---

> ✅ **Phone De-Drift Notice - v0.5.4**
>
> The phone app now matches the browser extension: the same About text, a collapsible credentials list with show/hide and delete only, a 12+ character password rule with a letter, number, and symbol, and an inline unlock overlay inside the settings menu on session timeout instead of booting back to the root lock screen. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Extension De-Drift Notice - v0.5.3**
>
> The browser extension matches the phone app's auth and sync model: no custom app PIN, the same Share/Backup/Scan sync flow, and a vendored jsQR scanner. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Sovereign Scanner and Settings Notice - v0.5.2**
>
> The QR scanner uses the standard web camera plus a vendored jsQR decoder that runs entirely on device, no Google dependency. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Native Biometric Auth Notice - v0.5.0**
>
> On Android, unlocking uses the device's own authentication through BiometricPrompt and a hardware-backed Keystore. On the extension, fingerprint unlock is the platform authenticator. See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## What is Valid Vault?

Valid Vault is a self-hosted password manager built on a master key wrap architecture. One random 256-bit master key encrypts your vault. That key is never stored raw, it's wrapped independently under each unlock method you set up, and unwrapping it is the act of authentication itself.

**How unlock works:**
- Password - wrapping key derived via PBKDF2-SHA256 at 600,000 iterations with a per-wrap salt, minimum 12 characters with a letter, a number, and a symbol
- Device unlock (Android) - the master key is wrapped by a hardware-backed Android Keystore key that requires device authentication (fingerprint or system PIN) to use
- Device unlock (extension) - the platform authenticator via WebAuthn, covering fingerprint and the device's own PIN
- Wrong credential means the unwrap fails. There is no stored hash to attack, no shortcut, no oracle.

No cloud service holds your data. No company can be subpoenaed for it or breached for it, and there is never any data for anyone to sell. You cannot leak what you never sent anywhere.

---

## Core Features

**Key Protection:**
- Master key wrap architecture - one key, independently wrapped per unlock method
- Verify-by-unwrap - the GCM auth tag is the verifier, nothing cheaper exists in storage
- Android: hardware-backed Keystore key gated by device authentication
- Extension: platform authenticator (fingerprint / device PIN) via WebAuthn
- Fresh salt on every credential change

**Unlock and Locking:**
- Fingerprint, device PIN, and password all fully unlock the vault
- Auto-lock inactivity timer in seconds, locks the vault and returns to the lock screen
- Both surfaces show an inline unlock overlay on session timeout instead of a dead end

**Sync and Backup:**
- Live QR sync - stream your vault or your key as a one-way fountain QR, scan it on the other device
- Sovereign scanner - the standard web camera plus a vendored jsQR decoder, no Google dependency
- QR stream timeout - shares auto-close after a set number of seconds, with a countdown and manual close
- Encrypted vault backup - export the encrypted vault to a file, inert without the matching master key
- Encrypted key backup - export the master key wrapped under a passphrase and three security questions, high-iteration KDF, never stored
- Nameable master key, reflected in the exported backup filename

**Vault:**
- Per-credential AES-GCM encryption of usernames and passwords
- IndexedDB persistence - no external database or server, settings persist here too
- Collapsible, view-and-delete-only credential list on both surfaces

**Platform:**
- Single-file web bundle - modules assembled by build.js into one self-contained HTML file
- Android via Capacitor, with a native biometric plugin (BiometricPrompt + Keystore)
- Vendored, self-contained code only, no Google SDKs in the scan path

## Current Status: v0.5.4 (phone) / v0.5.3 (extension)

**Completed:**
* ✅ Master key wrap architecture - one random 256-bit key, wrapped per method
* ✅ Verify-by-unwrap - stored verification hashes removed entirely
* ✅ Native Android biometric unlock via BiometricPrompt + hardware Keystore
* ✅ Fingerprint/PIN via the platform authenticator on the extension
* ✅ 12+ character password rule with letter, number, and symbol enforced everywhere
* ✅ Phone QR sync and encrypted vault/key backup and restore
* ✅ Sovereign in-square/in-box QR scanner via getUserMedia + vendored jsQR on both surfaces
* ✅ Nameable master key, reflected in the exported backup filename
* ✅ Auto-lock inactivity timer and QR stream timeout, both persisted
* ✅ Inline unlock overlay on session timeout, on both the phone and the extension
* ✅ Collapsible, view-and-delete-only credentials list on both surfaces
* ✅ Credential merge engine - username-keyed, newest password wins
* ✅ Terminal-green rebrand and Valid globe logo

**In Development:**
* 📋 On-device confirmation of the v0.5.4 unlock-overlay fix
* 📋 On-device field testing of sync, backup, and scanner across Android versions
* 📋 Per-method auth edit and delete on the phone Manage tab
* 📋 Vault blob encryption - domain names currently plaintext object keys

## Sync and Backup Model

Master key transport is deliberate. The primary path is a live QR stream: one device shows its key or vault as a fountain QR, the other scans it. The security is the ceremony, do it somewhere private, since anyone who sees the code can capture it. Shares auto-close after the QR stream timeout.

For disaster recovery there is an offline path. Export Vault writes the already-encrypted vault to a file, which stays useless on any device without the matching master key. Export Key writes the master key wrapped under a passphrase of at least twelve characters plus three security questions, combined into one secret and stretched with a high-iteration KDF. Nothing is stored, so a stolen file cannot be opened without the passphrase and answers, and a lost passphrase means the file is gone by design. The master key can be given a nickname for reference, which is reflected in the exported filename.

## Security Model

**Encryption at rest:**
- Passwords are wrapped with PBKDF2-SHA256 at 600,000 iterations
- On Android, the master key is additionally wrapped by a hardware Keystore key gated on device authentication
- Exported key files are wrapped at a higher iteration count, gated by a passphrase and security questions that are never stored
- No verification hashes are stored; the AES-GCM auth tag is the only verifier

**No Google in the scan path.** The scanner uses the web camera and a vendored jsQR decoder, which runs entirely on device.

**Locking is enforced end to end.** A manual or timeout lock clears the shared session key everywhere it was stored, not just from local memory, so a locked session cannot silently resume.

**Unlock methods stay local.** Fingerprint, device PIN, and password open the vault on one specific device. They never enter a sync.

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

**Native Biometric (Android):**
A custom Capacitor plugin bridges JavaScript to Android's BiometricPrompt. It creates a hardware-backed Keystore key that requires user authentication, then uses it to wrap the master key.

**Sovereign QR Scanner:**
Scanning uses the web camera through getUserMedia, drawing frames to a canvas that a vendored jsQR decoder reads. No native scanning plugin, no Google SDK.

**Fountain QR Sync:**
A vault or key streams as an endless loop of coded fountain frames. The receiver collects across loops and reconstructs the exact payload, then merges or restores it.

**Encrypted Backup Files:**
Export writes an encrypted file. The vault file stays under the master key. The key file is wrapped by a passphrase and security questions, combined and stretched with a high-iteration KDF.

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
Pre-1.0. Community review welcome. auth.js, crypto.js, session.js, and the native biometric plugin are the surfaces that matter.

## License

MIT License - See LICENSE file

Copyright (c) 2025-2026 by Rook

## Acknowledgements

Built and maintained by Rook.

---

**"Your passwords. Your device. Your keys. Nothing given is nothing leaked."**