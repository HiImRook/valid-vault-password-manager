# Valid Vault Password Manager

A local, encrypted, QR code portable password manager. No cloud, no accounts, no sync servers. Your credentials live on your device, encrypted under keys only you can produce, and move between devices over a fully local QR stream or an encrypted backup file.

---

> ✅ **Sync and Backup Notice - v0.5.1**
>
> Phone sync is wired end to end. Sync Vault and Get Sync Key display one-way fountain QR streams, and a scanner reads a key or vault streamed from another device. Encrypted offline backup is added: Export Vault saves the encrypted vault to a file, and Export Key saves the master key wrapped under a passphrase plus three security questions, stretched with a high-iteration KDF and never stored. A stolen file is useless without the master key or, for the key file, the passphrase and answers. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Native Biometric Auth Notice - v0.5.0**
>
> On Android, unlocking uses the device's own authentication through BiometricPrompt and a hardware-backed Keystore. Fingerprint and the system PIN both unlock the vault. On the browser extension, fingerprint unlock is Windows Hello. Password remains available everywhere and is used for syncing. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Rebrand and Lock Model Notice - v0.4.0**
>
> The extension and phone share a terminal-green identity with an Orbitron wordmark and the Valid globe logo. See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## What is Valid Vault?

Valid Vault is a self-hosted password manager built on a master key wrap architecture. One random 256-bit master key encrypts your vault. That key is never stored raw, it's wrapped independently under each unlock method you set up, and unwrapping it is the act of authentication itself.

**How unlock works:**
- Password - wrapping key derived via PBKDF2-SHA256 at 600,000 iterations with a per-wrap salt
- Device unlock (Android) - the master key is wrapped by a hardware-backed Android Keystore key that requires device authentication (fingerprint or system PIN) to use
- Device unlock (extension) - Windows Hello via WebAuthn, covering fingerprint, face, and the Hello PIN
- Wrong credential means the unwrap fails. There is no stored hash to attack, no shortcut, no oracle.

No cloud service holds your data. No company can be subpoenaed for it or breached for it, and there is never any data for anyone to sell. You cannot leak what you never sent anywhere.

---

## Core Features

**Key Protection:**
- Master key wrap architecture - one key, independently wrapped per unlock method
- Verify-by-unwrap - the GCM auth tag is the verifier, nothing cheaper exists in storage
- Android: hardware-backed Keystore key gated by device authentication
- Extension: WebAuthn (Windows Hello) fingerprint binding
- Fresh salt on every credential change

**Unlock Methods:**
- Fingerprint, system PIN, and password all fully unlock the vault
- On Android, fingerprint and the system PIN run through the native BiometricPrompt
- On the extension, fingerprint unlock is Windows Hello
- Password is the universal fallback

**Sync and Backup:**
- Live QR sync - stream your vault or your key as a one-way fountain QR, scan it on the other device
- Encrypted vault backup - export the encrypted vault to a file, inert without the matching master key
- Encrypted key backup - export the master key wrapped under a passphrase and three security questions, high-iteration KDF, never stored
- Nameable master key - a nickname for reference, stored only in file metadata

**Vault:**
- Per-credential AES-GCM encryption of usernames and passwords
- IndexedDB persistence - no external database or server
- Session timeout with automatic lock

**Platform:**
- Single-file web bundle - modules assembled by build.js into one self-contained HTML file
- Android via Capacitor, with a native biometric plugin (BiometricPrompt + Keystore)
- Zero runtime dependencies beyond WebCrypto, IndexedDB, the native biometric bridge, and the barcode scanner

## Current Status: v0.5.1

**Completed:**
* ✅ Master key wrap architecture - one random 256-bit key, wrapped per method
* ✅ Verify-by-unwrap - stored verification hashes removed entirely
* ✅ Native Android biometric unlock via BiometricPrompt + hardware Keystore
* ✅ System PIN accepted as a hard unlock via device credential
* ✅ WebAuthn (Windows Hello) fingerprint on the extension
* ✅ Masked secret fields with show/hide eye toggle everywhere
* ✅ Phone QR sync - stream and scan a key or vault
* ✅ Encrypted vault backup and restore to a file
* ✅ Encrypted master key backup - passphrase plus security questions, high-iteration KDF
* ✅ Nameable master key
* ✅ Credential merge engine - username-keyed, newest password wins
* ✅ Terminal-green rebrand and Valid globe logo

**In Development:**
* 📋 On-device field testing of sync and backup across Android versions
* 📋 Per-method auth edit and delete on the phone Manage tab
* 📋 Vault blob encryption - domain names currently plaintext object keys

## Sync and Backup Model

Master key transport is deliberate. The primary path is a live QR stream: one device shows its key or vault as a fountain QR, the other scans it. The security is the ceremony, do it somewhere private, since anyone who sees the code can capture it, the same trust as typing a password in the open.

For disaster recovery there is an offline path. Export Vault writes the already-encrypted vault to a file, which stays useless on any device without the matching master key. Export Key writes the master key wrapped under a passphrase of at least twelve characters plus three security questions, combined into one secret and stretched with a high-iteration KDF. Nothing is stored, so a stolen file cannot be opened without the passphrase and answers, and a lost passphrase means the file is gone by design.

Credential merge uses the newest update time. Within a site the username is the identity. Matching usernames resolve to the newest password. Different usernames stay separate. Convergence is guaranteed regardless of order.

## Security Model

**Encryption at rest:**
- Passwords are wrapped with PBKDF2-SHA256 at 600,000 iterations
- On Android, the master key is additionally wrapped by a hardware Keystore key gated on device authentication
- Exported key files are wrapped at a higher iteration count, gated by a passphrase and security questions that are never stored
- No verification hashes are stored; the AES-GCM auth tag is the only verifier

**Unlock methods stay local.** Fingerprint, system PIN, and password open the vault on one specific device. They never enter a sync. Only stored website credentials move between devices.

**Design boundaries:**
- Domain names are currently stored as plaintext object keys. Single-blob vault encryption is planned.
- Physical access to an unlocked device is outside the threat model, as it is for any password manager.
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

**Fountain QR Sync:**
A vault or key of any size streams as an endless loop of coded fountain frames. The receiver collects across loops and reconstructs the exact payload, then merges or restores it.

**Encrypted Backup Files:**
Export writes an encrypted file. The vault file stays under the master key. The key file is wrapped by a passphrase and security questions, combined and stretched with a high-iteration KDF, so the file is worthless without the owner's secrets.

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
Pre-1.0. Community review welcome. auth.js, crypto.js, and the native biometric plugin are the surfaces that matter.

## License

MIT License - See LICENSE file

Copyright (c) 2025-2026 by Rook

## Acknowledgements

Built and maintained by Rook.

---

**"Your passwords. Your device. Your keys. Nothing given is nothing leaked."**