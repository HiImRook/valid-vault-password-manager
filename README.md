
# Valid Vault Password Manager

A local, encrypted, QR code portable password manager. No cloud, no accounts, no sync servers. Your credentials live on your device, encrypted under keys only you can produce, and move between devices over a fully local QR stream.

---

> ✅ **Native Biometric Auth Notice - v0.5.0**
>
> On Android, unlocking now uses the device's own authentication through BiometricPrompt and a hardware-backed Keystore, rather than web WebAuthn (which does not work inside an app WebView). Fingerprint and the system PIN both unlock the vault. The custom app PIN has been retired in favor of native device auth. On the browser extension, fingerprint unlock is Windows Hello, which already includes the Hello PIN. Password remains available everywhere and is used for syncing between devices. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Rebrand and Lock Model Notice - v0.4.0**
>
> The extension and phone share a terminal-green identity with an Orbitron wordmark and the Valid globe logo. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Stateless Sync Notice - v0.3.5**
>
> Sync is stateless and universal. A device shows a fountain QR carrying its key and vault, another device scans it and writes its own identical vault. See [CHANGELOG.md](CHANGELOG.md) for full details.

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
- Android: hardware-backed Keystore key gated by device authentication wraps the master key
- Extension: WebAuthn (Windows Hello) fingerprint binding
- Fresh salt on every credential change

**Unlock Methods:**
- Fingerprint, system PIN, and password all fully unlock the vault
- On Android, fingerprint and the system PIN run through the native BiometricPrompt
- On the extension, fingerprint unlock is Windows Hello
- Password is the universal fallback and the method used for device-to-device sync

**Vault:**
- Per-credential AES-GCM encryption of usernames and passwords
- IndexedDB persistence - no external database or server
- Session timeout with automatic lock

**Credential Sync:**
- Stateless fountain QR stream - a device shows its key and vault, another scans and writes its own identical vault
- Devices merge credentials on sync, they do not overwrite each other
- Username is the identity within a site, newest password wins, different usernames coexist
- Deletions propagate to both devices through tombstones
- Unlock methods stay local to each device and never sync

**Platform:**
- Single-file web bundle - modules assembled by build.js into one self-contained HTML file
- Android via Capacitor, with a native biometric plugin (BiometricPrompt + Keystore)
- Zero runtime dependencies beyond WebCrypto, IndexedDB, and the native biometric bridge

## Current Status: v0.5.0

**Completed:**
* ✅ Master key wrap architecture - one random 256-bit key, wrapped per method
* ✅ Verify-by-unwrap - stored verification hashes removed entirely
* ✅ Native Android biometric unlock via BiometricPrompt + hardware Keystore
* ✅ System PIN accepted as a hard unlock via device credential
* ✅ Custom app PIN retired in favor of native device auth
* ✅ WebAuthn (Windows Hello) fingerprint on the extension
* ✅ PBKDF2-SHA256 at 600k iterations for password wraps
* ✅ Masked secret fields with show/hide eye toggle everywhere
* ✅ Clear Vault fully wipes vault, credentials, and native Keystore key, returns to clean setup
* ✅ Fresh salts on every credential set
* ✅ Credential merge engine - username-keyed, newest password wins
* ✅ Stateless sync - Sync Vault, Get Sync Key, and Import across the extension
* ✅ Terminal-green rebrand and Valid globe logo across extension and phone

**In Development:**
* 📋 Phone sync wired end to end - fountain codec, QR display, and mlkit scanning in the phone bundle
* 📋 Per-method auth edit and delete on the phone Manage tab
* 📋 Vault blob encryption - domain names currently plaintext object keys

## Unlock Model

Fingerprint, system PIN, and password are all full unlocks. On Android, fingerprint and the system PIN are handled by the native BiometricPrompt, which uses a hardware-backed Keystore key to wrap and unwrap the master key. On the browser extension, fingerprint unlock is Windows Hello, which itself offers fingerprint, face, and the Hello PIN. Password works on both surfaces, is the fallback where device auth is unavailable, and is the method that authorizes device-to-device sync.

The master key is never stored raw. At rest on Android it is encrypted by a Keystore key that only a successful device authentication can use, so the protection lives in device hardware rather than in the database.

## Sync Model

**Two independent rules govern sync, and they never interact.**

Master key selection uses the oldest creation time. When two devices sync, the vault with the oldest creation time supplies the shared master key, and the other device re-encrypts its credentials under it. The master key is internal and never shown.

Credential merge uses the newest update time. Within a site the username is the identity. Matching usernames resolve to the newest password. Different usernames on the same site remain separate logins. A credential on only one device is kept.

Deletion uses tombstones that propagate on the next sync. Convergence is guaranteed regardless of sync order.

## Security Model

**Encryption at rest:**
- Passwords are wrapped with PBKDF2-SHA256 at 600,000 iterations
- On Android, the master key is additionally wrapped by a hardware Keystore key gated on device authentication
- No verification hashes are stored; the AES-GCM auth tag is the only verifier

**Unlock methods stay local.** Fingerprint, system PIN, and password open the vault on one specific device. They are per device and never enter a sync. Only stored website credentials move between devices.

**Design boundaries:**
- Domain names are currently stored as plaintext object keys. Single-blob vault encryption is planned so the site list is not readable at rest.
- Physical access to an unlocked device is outside the threat model, as it is for any password manager.
- The master key is handled in memory during enrollment, inherent to key management without exposing raw hardware keys.

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
A custom Capacitor plugin bridges JavaScript to Android's BiometricPrompt. It creates a hardware-backed Keystore key that requires user authentication, then uses it to wrap the master key. Unlock triggers the native prompt, which accepts fingerprint or the system PIN, and returns the master key only after success.

**Windows Hello (Extension):**
On the browser extension, fingerprint unlock uses WebAuthn, which on Windows is Windows Hello, covering fingerprint, face, and the Hello PIN.

**Credential Merge:**
Two devices reconcile their vaults credential by credential on decrypted usernames inside the unlocked session, then re-encrypt under the shared key. The app and the extension run the same merge code.

**Single-File Bundle:**
build.js assembles the source modules into one self-contained HTML file. No module loader, no CDN, no external requests at runtime.

**Stateless QR Sync:**
Sync moves the key and vault in a fountain QR stream. A device shows an endless loop of coded frames, the receiver collects across loops and reconstructs the exact vault, then writes its own identical merged vault. No relay, server, or account needed.

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