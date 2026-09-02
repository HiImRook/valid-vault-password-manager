# Valid Vault Password Manager

A local, encrypted, QR code portable password manager. No cloud, no accounts, no sync servers. Your credentials live on your device, encrypted under keys only you can produce, and move between devices over a fully local QR stream.

---

> ✅ **Rebrand and Lock Model Notice - v0.4.0**
>
> The extension and phone now share a terminal-green identity with an Orbitron wordmark and the Valid globe logo. The lock model has been reworked. Fingerprint and password are hard unlocks that open the vault from any state. The PIN is now a permanent credential that only resumes a soft-locked idle session, it never opens a vault from a hard lock. Lock soft-locks when a PIN is set, otherwise hard-locks, and closing the browser always hard-locks. Soft-lock and hard-lock inactivity timers are configurable in Settings. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Stateless Sync Notice - v0.3.5**
>
> Sync is stateless and universal, with no pairing ceremony and no key exchange. A device shows a fountain QR carrying its key and vault, another device scans it and writes its own identical vault. Three actions separate the flow: Sync Vault streams your logins, Get Sync Key gives a new device the key it needs, and Import scans another device to receive either. See [CHANGELOG.md](CHANGELOG.md) for full details.

> ✅ **Security Overhaul Notice - v0.3.0**
>
> The key protection layer was reworked. Fingerprint unlock is cryptographically bound to the device authenticator via WebAuthn PRF. Stored verification hashes are gone, wrong credentials fail at the AES-GCM unwrap, so every offline guess pays the full key derivation cost. PBKDF2 raised to 600k iterations with silent migration on unlock. See [CHANGELOG.md](CHANGELOG.md) for full details.

---

## What is Valid Vault?

Valid Vault is a self-hosted password manager built on a master key wrap architecture. One random 256-bit master key encrypts your vault. That key is never stored raw, it's wrapped independently under each unlock method you enroll, and unwrapping it is the act of authentication itself.

**How unlock works:**
- Password - wrapping key derived via PBKDF2-SHA256 at 600,000 iterations with a per-wrap salt
- Fingerprint - wrapping key derived via HKDF from WebAuthn PRF output, secret material only your device authenticator can produce
- PIN - a permanent quick-resume credential that unlocks a soft-locked idle session only, never a hard lock
- Wrong credential means the AES-GCM unwrap fails. There is no stored hash to attack, no shortcut, no oracle.

No cloud service holds your data. No company can be subpoenaed for it or breached for it, and there is never any data for anyone to sell. You cannot leak what you never sent anywhere.

---

## Core Features

**Key Protection:**
- Master key wrap architecture - one key, independently wrapped per unlock method
- Verify-by-unwrap - the GCM auth tag is the verifier, nothing cheaper exists in storage
- WebAuthn PRF fingerprint binding - no PRF support means no fake biometric gate, refused honestly
- Fresh salt on every credential change
- Silent KDF migration - legacy wraps upgrade to current cost on first successful unlock

**Lock Model:**
- Fingerprint and password are hard unlocks - either one opens the vault from any state
- The PIN is a permanent credential that resumes a soft-locked idle session only, never a hard lock
- Lock soft-locks when a PIN is set, otherwise hard-locks
- Inactivity soft-locks at the soft timer when a PIN exists, and hard-locks at the hard timer
- Closing the browser always hard-locks
- Soft-lock and hard-lock timers are configurable in Settings, defaulting to 5 and 20 minutes

**Vault:**
- Per-credential AES-GCM encryption of usernames and passwords
- IndexedDB persistence - no external database or server
- Session timeout with automatic lock

**Credential Sync:**
- Stateless fountain QR stream - a device shows its key and vault, another scans and writes its own identical vault
- Devices merge credentials on sync, they do not overwrite each other
- Username is the identity within a site, newest password wins, different usernames coexist
- Deletions propagate to both devices through tombstones
- Oldest creation time supplies the shared master key, other devices re-encrypt under it
- Unlock methods stay local to each device and never sync

**Platform:**
- Single-file web bundle - modules assembled by build.js into one self-contained HTML file
- Android via Capacitor
- Zero runtime dependencies beyond WebCrypto and IndexedDB

## Current Status: v0.4.0

**Completed:**
* ✅ Master key wrap architecture - one random 256-bit key, wrapped per method
* ✅ Verify-by-unwrap - stored verification hashes removed entirely
* ✅ WebAuthn PRF fingerprint binding - wrapping key from authenticator secret material
* ✅ PRF-less devices refused honestly - no decorative biometric gate
* ✅ PBKDF2-SHA256 at 600k iterations - per-method iteration count persisted
* ✅ Silent rewrap migration - legacy 100k wraps upgrade on first unlock with fresh salt
* ✅ Fingerprint and password as hard unlocks - either opens the vault from any state
* ✅ PIN as a permanent soft-lock resume credential - never opens a hard lock
* ✅ Soft-lock and hard-lock split with configurable timers in Settings
* ✅ Enroll and re-enroll auth controls on the extension setup and manage surfaces
* ✅ Removal guards - each wrap method requires another as backup before removal
* ✅ Fresh salts on every credential set
* ✅ Crypto flows validated in Node against WebCrypto
* ✅ Credential merge engine - username-keyed, newest password wins, different usernames coexist
* ✅ Oldest-key-wins shared master key with re-encryption on adopt
* ✅ Tombstone deletes that propagate across devices
* ✅ Browser extension shares the same merge engine as the app
* ✅ LT fountain codec for streaming QR, byte-exact reconstruction under dropped, shuffled, and duplicate frames
* ✅ Stateless sync - Sync Vault, Get Sync Key, and Import across the extension
* ✅ Terminal-green rebrand and Valid globe logo across extension and phone

**In Development:**
* 📋 Phone lock timer enforcement verified across Capacitor WebView
* 📋 Per-method auth edit and delete on the phone Manage tab
* 📋 Phone sync wired end to end - fountain codec, QR display, and mlkit scanning in the phone bundle
* 📋 Vault blob encryption - domain names currently plaintext object keys

## Lock Model

**Two lock types, and a PIN that only bridges one of them.**

Fingerprint and password are hard unlocks. Either one opens the vault from any state, a fresh start, a manual lock, or an expired session. They are the only way to open a hard lock.

The PIN is a permanent credential with a deliberately narrow power. It resumes a session that is soft-locked, meaning the session was open and went idle. It cannot open a vault from a hard lock, and it cannot substitute for fingerprint or password.

Locking splits accordingly. Hitting Lock soft-locks the session when a PIN is set, so a quick PIN brings you back. With no PIN set, Lock hard-locks. Inactivity soft-locks at the soft timer when a PIN exists and hard-locks at the hard timer. Closing the browser always hard-locks. Both timers are configurable in Settings, defaulting to 5 minutes soft and 20 minutes hard.

## Sync Model

**Two independent rules govern sync, and they never interact.**

Master key selection uses the oldest creation time. Every device starts with its own master key. When two devices sync, the vault with the oldest creation time supplies the shared master key, and the other device re-encrypts its credentials under it. The master key is internal and never shown, so this convergence is invisible during normal use.

Credential merge uses the newest update time. Within a site the username is the identity. Matching usernames resolve to the newest password and the older one is discarded. Different usernames on the same site remain as separate logins. A credential on only one device is kept.

Deletion uses tombstones. Deleting a credential writes a tombstone carrying a timestamp. On the next sync the tombstone propagates and the credential is removed from both devices. A credential re-added after a deletion carries a newer timestamp, so it survives.

Convergence is guaranteed. If every device eventually syncs with the group, all devices arrive at the same master key and the same set of credentials. Sync order does not matter.

## Security Model

**Encryption at rest:**
- Passwords are wrapped with PBKDF2-SHA256 at 600,000 iterations per credential
- Fingerprint wraps derive their key material from the device authenticator, so the wrapping secret lives in hardware rather than in the database
- The PIN wrap exists to resume a soft-locked session and never grants a hard unlock

**The PIN is deliberately the weakest credential.** It resumes an already-open idle session and nothing more. A manual lock or a closed browser always requires fingerprint or password, so a short PIN can never stand in for real authentication.

**Unlock methods stay local.** Fingerprint, PIN, and password are how you open the vault on one specific device. They are per device and never enter a sync. Your phone can use fingerprint while your browser uses a password. Only stored website credentials move between devices.

**Design boundaries:**
- Domain names are currently stored as plaintext object keys. Encrypting the vault as a single blob is planned so the site list is not readable at rest.
- Physical access to an unlocked or in-session device is outside the threat model, as it is for any password manager.
- The master key is handled in memory during multi-method enrollment, which is inherent to key management in the browser without a hardware keystore. Hardware keystore binding on Android is planned.
- Fingerprint unlock requires an authenticator with WebAuthn PRF support. Devices without it use password unlock. There is no fake biometric path.

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
There are no stored password or PIN hashes. Authentication is the act of deriving a wrapping key from your credential and attempting the AES-GCM unwrap. The auth tag rejects wrong keys. This means the cheapest possible offline attack is the full KDF, by construction.

**PRF-Bound Fingerprint:**
The fingerprint wrapping key is derived via HKDF from the WebAuthn PRF extension output. That output requires the physical authenticator and user verification to produce. The database contains a wrapped key and a salt, the secret ingredient is in the hardware, not the data.

**Soft Lock and the PIN:**
A soft lock nulls the raw master key while the session is otherwise intact, and the PIN resumes it. A hard lock requires a full unlock. The PIN's reach ends at the soft lock by design, which is what keeps a short PIN from ever being a substitute for a real credential.

**Credential Merge:**
Two devices reconcile their vaults credential by credential. The username identifies a login within a site, so matching usernames resolve to the newest password while different usernames coexist. The merge runs on decrypted usernames inside the unlocked session, then re-encrypts under the shared key. The app and the browser extension run the exact same merge code.

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
Pre-1.0. The v0.3.0 key protection layer was reworked against identified weaknesses in the alpha. Community review welcome. auth.js and crypto.js are the surfaces that matter.

## License

MIT License - See LICENSE file

Copyright (c) 2025-2026 Rook

## Acknowledgements

Built and maintained by Rook.

---

**"Your passwords. Your device. Your keys. Nothing given is nothing leaked."**
