# Changelog

All notable changes to Local Vault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.3] - 2026-09-22

This release replaces per-credential encryption for Website Credentials with single-blob vault encryption, closing the last major gap in what's readable from the raw database at rest. It also closes out three real migration-safety gaps found across independent code review before shipping, and completes the `loginType` classification work scoped since v0.6.0.

### Added
- **`loginType` field on Website Credentials.** Each saved login now classifies as username, email, or phone, so autofill and the credential picker can target the right field type reliably instead of guessing from a generic login string.
- **Single-blob vault encryption for Website Credentials.** The vault row is now `{schemaVersion: 2, blob: {iv, ciphertext}}`, encrypting the whole `{meta, credentials}` tree as one AES-GCM ciphertext. Domain names, credential IDs, timestamps, login types, usernames, passwords, and per-site extra fields are no longer readable as plaintext from the Website Credentials IndexedDB row.
- **Automatic migration on first unlock.** A legacy row is decrypted, backed up encrypted (not plaintext) in a short-lived `vaultMigration` journal, converted to the new tree, and verified before the journal clears. An interrupted migration is detected and rolled back from that encrypted backup on the next unlock instead of being silently treated as done.

### Fixed
- **Unsupported or malformed vault rows could be misread as an empty legacy vault.** `decryptAnyRowToTree()` and `migrateLegacyVault()` now throw on any `schemaVersion` other than `2` or `undefined`, and a `schemaVersion: 2` row missing its `blob` now throws instead of passing `undefined` into decrypt. Previously either case could fall through to the legacy path and, on a later write, silently overwrite real data with an empty tree.
- **Decrypted vault-tree validation only checked the top-level shape.** `isValidVaultTree()` now validates every domain's credential list: each entry needs a string `id`, `deleted` (if present) must actually be a boolean rather than any truthy value, and live (non-tombstoned) credentials need string `username`/`password`. A malformed blob now fails validation immediately instead of crashing later in `getAllDomains()`, `saveCredential()`, or `mergeVaults()`.
- **Legacy migration discarded unknown credential fields.** `decryptLegacyTree()` now spreads the original record before overwriting only the fields it actually decrypts (`username`, `password`, `extraFields`, `loginType`, `createdAt`, `updatedAt`, `id`), so a future or unrecognized field on an old credential survives conversion instead of being silently dropped.
- **Migration verification only proved the blob could decrypt, not that conversion preserved the data.** `finalizeMigration()` now compares a full-tree fingerprint of the plaintext tree, computed right after conversion, against the same fingerprint of the tree decrypted back from the written blob, rolling back on any mismatch the same way it already does for a decrypt/shape failure. The expected fingerprint is stored in the migration journal, so this check also covers a migration resumed after an interrupted run, not just the happy path.

### Changed
- **Pairing and sync no longer reconcile two different master keys.** Importing the same master key on both devices before syncing was already the intended behavior; the old reconciliation path was leftover early-stage logic and is removed. A mismatched key now fails clearly instead of one device's key silently winning.
- **`mergeVaults()` operates on already-decrypted plaintext trees** and no longer needs a master key itself.
- **`getAllDomains()` now returns `{success: false, locked: true}` when called with no key**, instead of assuming it can list domains unencrypted.

### Known Gaps
- Custom div-based comboboxes and `contenteditable` fields remain unsupported by autofill. I feel like this is too rare of an edge case, but will consider any feedback on the matter.
- Every credential read now decrypts the full Website Credentials tree. This is the accepted tradeoff of single-blob storage; a decrypted-tree cache has not been added, since it hasn't been needed in real use yet.

### Notes
- Every hardening fix in this release was verified across multiple rounds of independent code review before shipping, following the same practice established in v0.6.2.
- test.html and www/index.html were rebuilt from build.js to include all of the above.

## [0.6.2] - 2026-09-20
 
This release resolves the top-priority gap left open by v0.6.1: Website Credentials now reliably saves new logins from real signup flows. It also closes out a long list of correctness and robustness issues in the autofill/injection layer found across several rounds of independent code review, each one verified against the actual code and against real browser behavior (Playwright + Chromium) before shipping.
 
### Fixed
- **Website Credentials save regression, resolved.** Root cause was `detectLoginForm()`/`matchSignupFieldType()` sharing mutable global state (`usernameField`/`passwordField`) across forms. Wiring a second form - via the page's own dynamic content, or the extension's MutationObserver picking up a form added after load - could silently repoint a first, already-wired form's listeners at the wrong fields. Both now use per-form closures instead of shared globals; verified against a real two-form page.
- **Submit-triggered navigation losing the save prompt.** A real form submit can navigate away (or tear the content script down) before the async "is this already saved" check resolves. Captured credentials are now staged in `background.js` synchronously and recovered on whatever page loads next in the same tab - including across cross-domain SSO/MFA redirects and multi-hop flows (consent screens, MFA steps) that used to lose the prompt partway through. A race between staging and resolving that record is closed via per-tab serialization.
- **False-positive personal-info classification.** A bare keyword like "state" could match inside unrelated free text ("please state your case"). Bare single-word keywords (state, city, zip, etc.) are now only checked against structured signals (`name`/`id`/`autocomplete`), never free text (labels, placeholders, `aria-label`).
- **Autofill silently failing on React/Vue-style controlled inputs.** Filling a field now calls the native `value` property setter before dispatching `input`, so a framework's own value tracker actually picks up the change instead of the DOM and the framework's state disagreeing.
- **Duplicate save prompts from one submission.** A form's own submit event, Enter in the password field, and a nearby-button-click heuristic could each independently trigger capture for the same login. An in-flight guard now collapses overlapping triggers into a single capture.
- **Fields that gain their identifying attributes after insertion** (a framework setting `name`/`id`/`autocomplete`/`aria-label`/`placeholder`/`type` once hydration or a multi-step form advances) are now reclassified when that happens, instead of staying unrecognized for the life of the page.
- **Detached SPA forms and personal-info fields no longer leak.** An unmounted login step or a closed modal used to leave its listeners - including a document-level click listener - and its floating field-tag icon alive indefinitely. Both are now torn down within one debounce cycle of the field leaving the DOM.
- **Two separate formless login widgets on one page no longer both react to one click.** A password field with no wrapping `<form>` had no natural boundary for the "nearby button" heuristic, so every formless widget treated the whole page as its own. Button ownership is now scoped to the smallest containing element that already holds a button.
- **Personal Info autofill and per-site extra-field capture now support `<select>` and `<textarea>`,** not just `<input>`. A state/country dropdown is filled by matching its actual option value or visible text, never a blind value assignment that would silently clear the selection on a mismatch.
- **Activity tracking was incomplete.** Ordinary typing, passive autofill, opening the credential dropdown, and recovering a pending save across a redirect didn't reset the inactivity timer, so the vault could lock mid-use while someone was clearly still there. All four now count as activity, throttled to one ping every few seconds to avoid message spam.

### Known Gaps
- Pending-save recovery is scoped to the browser tab, not the destination page or domain, and expires after 45 seconds. This is a deliberate tradeoff, not an oversight: it's what lets the save prompt survive a cross-domain SSO/MFA redirect at all, at the cost of a narrow window where an unrelated page in the same tab could read a stale entry. Not planned to change without an actual page-identity signal to key off of instead.
- The formless-widget button-ownership heuristic can still misattribute a button on unusually flattened markup where two unrelated widgets happen to share their nearest button-containing ancestor. A narrow edge case, not the general multi-widget bug from v0.6.1, which is fixed.
- Custom div-based comboboxes and `contenteditable` fields remain unsupported - there's no standard attribute signal to classify them the way `<input>`/`<textarea>`/`<select>` are.
- `loginType` (username vs. email vs. phone) on Website Credentials remains scoped but not built.

### Notes
- Every fix in this release was verified with Playwright-in-Chromium tests and/or direct unit tests of the storage logic - following directly from the lesson of the v0.6.1 regression, which shipped without that level of verification.

## [0.6.1] - 2026-09-18

This release adds real autofill injection to the extension - reading Personal Info and Website Credentials to populate page forms - built the safe way, with background.js holding the session key and content.js only ever receiving plaintext values it explicitly asked for.

### Added
- **Personal Info autofill on page load.** Empty, matched fields (name, phone, address) are auto-populated using a three-tier heuristic: `autocomplete` attribute match first, keyword match against field `id`/`name`/`placeholder` second, nearby `<label>` text as a fallback. This replaces exact-selector matching, which failed on real signup forms (e.g. a field with `id="firstName-field"` never matched `id="firstName"`).
- **Email fields are click-to-pick, never auto-filled.** A profile can hold several ranked emails, so an email field is never silently populated on page load. Clicking the field's tag opens a small picker listing every saved email by rank, and only the one selected gets injected.
- **Visible field tag.** A small circular badge marks any field Valid Vault has matched, repositioning correctly on scroll and resize.
- **Inline unlock, directly on the page.** Clicking a tagged field while the vault is locked prompts for the master password right there, no popup required. This is password-only by design - see Notes.

### Fixed
- `background.js` had `indexedDB.open('ValidVault', 1)` hardcoded in three places. With the database now at version 3 after v0.6.0's new stores, this threw a `VersionError` and silently broke background vault access. Opens with no explicit version now.
- The popup could lose the session key on a fast tab switch: `popup.js` wrote it to `chrome.storage.session` itself, and Manifest V3 destroys a popup instantly on losing focus, which could interrupt that write mid-flight. The write is now delegated to `background.js` via message-passing, which has a longer lifecycle.

### Known Gaps
- **Website Credentials does not reliably save new logins captured from a real signup flow.** Root cause: `detectLoginForm()`'s field-selection can collide with Personal Info's autofill targeting the same field on a form (grabbing a first-name field instead of the actual login/email field). A fix was built and shipped internally, caused a separate regression, and was rolled back. Still open, and the clear next priority on content.js.
- Autofill matching quality varies site to site. This release is a working foundation, not a finished feature.
- `loginType` (username vs. email vs. phone as the site's actual identity field) remains scoped but not built; Website Credentials still store a generic login string.

### Notes
- Fingerprint/PIN unlock is intentionally unavailable from the inline, on-page prompt. A WebAuthn platform credential is bound to the origin that created it (`chrome-extension://...`), and a content script running in a visited page's own origin can never trigger that credential. Password-only inline unlock is expected behavior, not a bug.
- No competitor-targeting logic was added, and none is planned. Autofill wins on being fully local and already-unlocked in memory, not on hiding another extension's UI.

## [0.6.0] - 2026-09-14

This release adds two new pieces of storage to the extension, Web Credentials and Personal Info, and fixes a real correctness bug that would have broken syncing the same vault across multiple browsers.

### Added
- **Personal Info**, a new tab under Manage for first name, last name, phone, address, and multiple ranked emails (reorder with up/down, the top one is marked Primary). Viewing requires a normal unlock, but adding or editing any field requires the master password specifically, never fingerprint, a deliberately stricter gate for this category of data.
- **Web Credentials** gained a working Edit. It previously supported add and delete only.
- Both Website Credentials (logins) and Web Credentials now require their own explicit re-unlock inside Manage, separate from simply having the extension open, and re-lock when the extension itself locks.
- Personal Info, Web Credentials, and login credentials are all now included in Share Vault, Export Vault, Import Vault, and QR sync, so they travel together as one vault.

### Fixed
- Importing a master key only ever changed the session in memory. It never re-wrapped the browser's own password or fingerprint around the imported key, so after a lock and unlock, the browser silently reverted to its original key, and anything saved since the import became unreadable. Importing a key now re-wraps it under the browser's existing unlock methods, so it genuinely becomes the browser's key going forward. This was the key gap standing between "export and import a file" and the same vault file staying usable across Chrome, Firefox, and other browsers with one shared master key.
- The save-on-submit prompt fired on every login, even to a site already saved with an unchanged password. It now checks first: silent if nothing changed, a save prompt for a genuinely new username, and an update prompt only when the password for an existing username has changed.
- A fingerprint enrollment issue was tracked down during this cycle: Windows began showing its cross-device/security-key chooser with no local Windows Hello option. Traced through the actual commit history rather than guessed at; the extension's code was confirmed unchanged since v0.3.1. The cause was Windows account passkey state, not the extension, resolved by removing the existing passkey in Windows Settings and re-enrolling.

### Notes
- Extra fields on login credentials (recovery email, notes, and similar) were deliberately left out. A future native autofill feature will handle that separately rather than storing it on the credential record.
- Autofill injection itself, and login-type tracking (username vs. email vs. phone) on Website Credentials, are scoped but not yet built.
- Version bumped to 0.6.0 across the phone and the extension.

## [0.5.5] - 2026-09-13

This release fixes a real export bug that made Export Vault appear to do nothing, and replaces the browser-based file download with a proper native implementation.

### Fixed
- Export Vault reported nothing at all when tapped: success, an empty vault, and a save failure all routed through a log function that wrote to a page element that does not exist anywhere in the phone UI, so every outcome was silently swallowed. A real, visible message area was added for the backup and sync section, and Export Vault, Import Vault, and the shared unlock check now write to it.
- The exported vault file never included the master key's nickname, unlike the key file, which already did. Both now include it, filesystem-safe, with the user's capitalization preserved.
- File saving no longer relies on triggering a browser download inside the Android WebView, which does not reliably work there. Saving now goes through Capacitor's native Filesystem and Share APIs, giving a real native save or share action rather than a silent no-op.

### Changed
- Export Vault is a single button. Tapping it opens a small choice between saving directly to the device's Downloads folder or opening the native share sheet, rather than exposing two separate buttons for the same file.
- A direct-to-Downloads save path was added using Android's MediaStore API through a small native plugin, requiring no extra storage permission on modern Android.

### Notes
- This build remains under active testing; see the About section in both the app and the extension.
- Version bumped to 0.5.5 across the phone and the extension.

## [0.5.4] - 2026-09-13

This release brings the phone app back into parity with the browser extension's v0.5.3 auth and interface work, and fixes a real bug in the process.

### Changed
- The About section on the phone now matches the extension exactly, including the current version and a website link alongside the repository link.
- Website credentials on the phone were rebuilt to match the extension: a collapsible list grouped by domain, with a show/hide toggle for the password and delete only. The old Add and Load-by-domain flow is gone; credentials are added through normal browsing and autofill, not typed in here.
- When a session times out while inside the settings menu, the phone now shows an inline unlock overlay in place, with fingerprint and password options, instead of booting all the way back to the root lock screen. Whether the overlay should show is tracked by an explicit flag set when the menu opens and closes, rather than inferred from page state, which could get stranded across a backgrounded app.
- Password requirements are now enforced consistently at 12 or more characters with a letter, a number, and a symbol, on both the phone and the extension. The extension's underlying validation and its manage-page re-enroll path had quietly kept the old 8-character floor even after the setup screen was tightened; both are now closed.
- Locking now clears the shared session key on the phone the same way it does on the extension, so a completed lock cannot be silently bypassed by state left over from before it.

### Fixed
- The new unlock overlay could become permanently stuck open with no way to dismiss it. The cause was a CSS conflict: the overlay's inline style set it visible, and an inline style always overrides a class-based rule, so hiding it by toggling a class had no effect. The overlay's visibility is now controlled directly rather than through a class that inline styles could override.

### Notes
- Version bumped to 0.5.4 for the phone app; the extension remains at 0.5.3 pending its own next release.

## [0.5.3] - 2026-09-12

This release brings the browser extension into parity with the phone app's auth and sync model. Extension-only; the phone app is unchanged in this release.

### Changed
- Removed the custom app PIN from the extension's setup and manage screens. Device unlock is now fingerprint or the device's own PIN, the same model as the phone.
- Password requirements strengthened to at least 12 characters with a letter, a number, and a symbol.
- The Sync tab was rebuilt to match the phone: Share Vault and Share Master Key display one-way fountain QR streams, Export/Import Vault and Export/Import Key handle encrypted file backup, and a dedicated scan box reads a streamed key or vault using getUserMedia and a vendored jsQR decoder. The old pairing-handshake sync and its webcam flow are gone.
- The front popup no longer shows credential management. It confirms the vault is unlocked and points to the menu, where management now lives exclusively.
- The About section was updated with the current version, a rewritten description, and a website link alongside the repository link.
- Settings replaced the old minutes-based soft/hard lock timers with a single auto-lock timeout in seconds (default 60) and a QR stream timeout in seconds (default 30), matching the phone.
- The master key can now be renamed from Settings, and the exported vault backup filename includes that name, with the user's capitalization preserved.

### Fixed
- The settings menu could go completely unresponsive after certain edits: a missing closing brace on a loop and a malformed duplicate `init()` were silently halting the whole script. Both are corrected.
- Several sync button handlers were unguarded against a missing element, which could halt the rest of the script if one was absent. All are now null-guarded.
- The manage page and the popup run in separate script contexts and were not sharing the unlocked session, so opening the manage page after unlocking in the popup could show it as locked. The manage page now restores the key from the shared session storage on load.
- When a session timed out, the manage page had no way back in short of closing the tab. It now shows an inline unlock overlay with fingerprint and password options, and a background check shows or hides that overlay automatically on any tab if the lock state changes.
- The auto-lock timer was firing on a fixed schedule rather than on true inactivity. Two causes: `lockAll()` was not clearing the shared session key, which could let a locked session quietly resume, and the activity listeners were attached to a container that did not include the sidebar tabs, so switching tabs never reset the idle clock. Activity tracking now covers the whole page, including mouse movement and, for a future touch interface, touch start and touch move.

### Security model
- Fixing `lockAll()` matters beyond convenience: without it, the shared session key could persist after a timeout was supposed to end it, which is a real lock-bypass, now closed.

### Notes
- This release is scoped to the browser extension. The phone app has not yet received the unlock-overlay, lock-monitor, or corrected timer logic from this release; that port is tracked for a future update.
- Version bumped to 0.5.3 in the extension only.

## [0.5.2] - 2026-09-08

This release replaces the barcode-scanning scaffolding with a sovereign implementation, fixes settings persistence, and makes auto-lock a real inactivity timer.

### Changed
- The QR scanner moved off the ML Kit plugin, which was scaffolding meant to prove the flow and always intended for replacement. Scanning now uses the standard web camera (getUserMedia) with a vendored jsQR decoder. The camera renders inside the scan square rather than taking over the screen, and there is no Google or Play Services dependency in the scan path. The ML Kit plugin has been removed from the project.
- Auto-lock is now a real inactivity timer measured in seconds, defaulting to 60. Any activity resets it, and when it expires the vault locks and returns to the lock screen. Previously the field existed but was not wired to anything.
- The QR stream timeout is measured in seconds, defaulting to 30, and governs every QR share. The QR display shows a live countdown and a manual close button.

### Fixed
- The scanner Cancel button now fully stops the camera. It was re-triggering because the tap bubbled up to the scan box and reopened the scanner. Cancel now stops propagation, a re-entry guard prevents a second scan from starting, and the camera track and video element are released cleanly.
- Settings now persist across app restart. The QR stream timeout and auto-lock value are stored in IndexedDB, since browser local storage does not survive an app restart in the Android WebView.

### Security model
- Dropping ML Kit removes the one part of the scan path that relied on a Google-owned SDK and could fetch a model from Play Services. The vendored jsQR decoder runs entirely on device, in the same local, self-contained spirit as the bundled QR generator and fountain codec.

### Notes
- jsQR is vendored as a single MIT-licensed file with no native code and no network calls.
- Version numbers across the app and extension are aligned to 0.5.2.

## [0.5.1] - 2026-09-07

This release wires phone sync end to end and adds encrypted offline backup and key naming.

### Added
- Phone QR sync. Sync Vault and Get Sync Key display one-way fountain QR streams, and a QR scanner reads a key or vault streamed from another device. The fountain codec and QR generator are now bundled into the phone build.
- Encrypted offline backup. Export Vault saves the already-encrypted vault to a file, and Import Vault restores or merges it. The file stays encrypted and is inert without the matching master key.
- Master key export and import as an encrypted file. The key is wrapped under a passphrase of at least 12 characters plus three security questions drawn at random from a pool of ten. The passphrase and answers are combined into one secret and stretched with PBKDF2 at 1,000,000 iterations. Nothing is stored, and a lost passphrase or answers means the file cannot be opened.
- Nameable master key. The key reads as "My Master Key" by default and can be renamed in Settings. The nickname is stored only in file metadata and is never required to import.

### Changed
- Settings no longer offers to re-enroll fingerprint or PIN, since those are managed by the device. The auth section is now titled "Password".
- Scanning a vault on a device without the matching key shows "QR sync not enabled. Import master key first."

### Security model
- Master key transport is deliberate. A live QR stream is the primary path, and the security is the ceremony: do it somewhere private, since anyone who sees the code can capture it. The offline key file adds a second path for disaster recovery, protected by a passphrase and security questions that are never stored, so a stolen file is useless without what is in the owner's head. Vault backups stay encrypted under the master key, so a stolen vault file is inert on any device that did not receive the key.
- Capitalization and spaces matter in the passphrase and answers, and this is stated in the interface. Re-exporting at any time while the app is open produces a fresh file with a new passphrase.

### Notes
- Offline file save uses a standard in-page download rather than a native file plugin, keeping the dependency footprint unchanged.
- Version numbers across the app and extension are aligned to 0.5.1.

## [0.5.0] - 2026-09-06

This release is a hardening and feature-completion pass driven by internal Play Store testing. Most changes are bug fixes and feature fixes surfaced by running the app on real devices.

### Added
- Native Android biometric unlock. The phone now uses Android's BiometricPrompt backed by a hardware-backed Keystore key, rather than web WebAuthn. The master key is wrapped by a Keystore key that requires user authentication, so at rest it is protected by device hardware.
- System PIN as a hard unlock. The device's own PIN/pattern (device credential) unlocks the vault alongside fingerprint, both drive the same Keystore-wrapped master key.
- Show/hide eye toggle on every PIN and password field, across the setup, unlock, and manage screens. All secret fields mask by default.

### Changed
- Device unlock replaces the custom app PIN on the phone. Enrolling "device unlock" links the vault to the system authenticator (fingerprint or system PIN). There is no separate app-managed PIN to type.
- All unlock methods (fingerprint, password, system PIN) are full unlocks. Password remains the universal fallback and the method used for device-to-device sync.
- The front screen no longer shows credential management. Once unlocked it points to the menu; credentials, sync, and settings live there.
- Setup copy reworded to describe linking device unlock and setting a backup password.

### Fixed
- WebAuthn fingerprint failed on the phone with "Error connecting to web authentication service." Root cause: browser WebAuthn does not work inside the Android Capacitor WebView. Resolved by moving the phone to native BiometricPrompt.
- PIN entry rejected valid 4-6 digit PINs on mobile due to keyboard-injected characters. Inputs are now trimmed and use a numeric keyboard. (Superseded on phone by the move to system PIN.)
- Clear Vault appeared not to delete and could strand the app on a stale unlocked screen with no menu. It now fully wipes the vault, credentials, and the native Keystore key, then returns to a clean setup screen.
- Settings-page enroll buttons did nothing. They now use the working enroll flow with Enroll and Re-enroll states.
- Fixed phone bundle module wiring so the app no longer fails to render from stale function lists.

### Security model
- On the phone, the master key at rest is encrypted by a hardware Keystore key that only a successful device authentication (fingerprint or system PIN) can use. On the extension, fingerprint unlock is Windows Hello, which already covers the Hello PIN. Password remains available on both surfaces and is required for syncing between devices.

### Notes
- The WebAuthn RP name remains "Local Vault" in code even though the UI reads "Valid Vault", changing it would invalidate existing enrollments.
- Phone sync remains a work in progress. Personal Info is still a placeholder.
- Version numbers across the app and extension are aligned to 0.5.0.

## [0.4.0] - 2026-09-01

### Added
- Terminal-green visual identity across the extension and phone - Orbitron wordmark, monospace UI, off-black background, shared palette so both surfaces read as one product.
- Valid globe logo - a rotating wireframe globe with a sliced V, rendered live in the phone header and animated on the project sites.
- Configurable lock timers in Settings - separate Soft-lock timer and Hard-lock timer fields, defaulting to 5 minutes soft and 20 minutes hard.
- Extension hamburger dropdown with Settings Menu and Website entries.
- Phone enroll and re-enroll setup flow with view routing across setup, hard-lock, soft-lock, and unlocked states.

### Changed
- PIN role redefined. The PIN is now a permanent credential that resumes a soft-locked idle session only. It never opens a vault from a hard lock. This replaces the 0.3.0 ephemeral session-PIN model.
- Lock behavior split into soft and hard. Hitting Lock soft-locks when a PIN is set, otherwise hard-locks. Inactivity soft-locks at the soft timer when a PIN exists, and hard-locks at the hard timer. Closing the browser always hard-locks.
- Fingerprint and password are the two hard unlocks. Either one fully opens the vault, from any state. The hard-lock screen offers fingerprint and password only, the PIN field is not shown there.
- Auth method controls now read Enroll and Re-enroll. An unset method shows a green Enroll, an already-set method shows a red Re-enroll, on both the extension setup and manage surfaces.
- Extension Back up with Secure Sync jumps to the Sync tab.
- Extension Settings replaced the single auto-lock row with the two soft and hard timer rows and dropped the lock-on-popup-close toggle.
- Phone front screen rebranded with the globe header, and the developer log was removed from the user-facing view.

### Fixed
- Phone bundle crash on load. The phone build read module function lists that had drifted from the reworked session and auth modules, throwing a ReferenceError before any view rendered. The bundler's session and auth wrappers were realigned to the current module exports.

### Security model
- The PIN is deliberately the weakest credential. It resumes an already-open idle session and nothing more. A manual lock or a closed browser always requires fingerprint or password, so a short PIN can never substitute for real authentication.

### Notes
- The WebAuthn RP name remains "Local Vault" in code even though the UI reads "Valid Vault". Changing it would invalidate every enrolled fingerprint, so it is deliberately left unchanged.
- Phone sync remains a work in progress. The sync surface is present but not yet wired end to end.
- Personal Info is still a placeholder on both surfaces.
- Per-method auth edit and delete remain deferred on the phone.
- Version numbers across the app and extension are aligned to 0.4.0.

## [0.3.5] - 2026-08-15

### Added
- Stateless sync model across all surfaces - no pairing ceremony, no key exchange round-trip. A device shows a fountain QR, another scans it. Same method works browser to phone, phone to browser, or to any device with a screen and camera.
- Three sync actions, separated for clarity: Sync Vault (stream your logins), Get Sync Key (give a new device the key it needs), and Import (scan another device to receive either).
- Browser extension Sync tab rebuilt around the three actions with a cycling fountain QR display.
- Browser webcam scanning for Import using the native BarcodeDetector, no vendored decoder.
- Phone Settings Menu behind a hamburger, opening on Manage, with tabs for Manage, Personal Info, Sync, Settings, and About.

### Changed
- Extension popup: the Expand control is now a hamburger that opens the full settings page. Back up with Secure Sync is now a primary action that jumps to the Sync tab.
- Phone front screen simplified to login only. Vault management, sync, and settings moved into the Settings Menu.
- About sections updated to Valid Vault branding and the current repository.

### Security model
- Sync moves the key and vault in the stream itself. The protection is physical, the same trust you rely on when typing a password: do it somewhere private. There is no back channel and no server.

### Notes
- Phone sync is not functional yet. The three sync buttons on the phone are present but stubbed, they display a placeholder message rather than streaming or scanning. The phone bundle still needs the fountain codec and a QR display wired in, plus mlkit camera scanning fed into the decoder. This is the next build.
- Browser Import requires the native BarcodeDetector API. It is available in Chromium browsers but is inconsistent on Windows desktop, where it may report the API exists yet decode nothing. When unavailable, the browser can still send (Sync Vault, Get Sync Key) but cannot receive. A vendored decoder fallback is not yet included.
- The browser send side is verified: the fountain QR cycles correctly for both Sync Vault and Get Sync Key.
- Auth method management on the phone Manage tab currently exposes enroll and set actions only. Per-method edit and delete, present in the browser, are not yet on the phone.
- Personal Info is a placeholder on both surfaces.
- The WebAuthn RP name remains "Local Vault" in code even though the UI now reads "Valid Vault". Changing the RP name would invalidate every enrolled fingerprint, so it is deliberately left unchanged.
- Version numbers across the app and extension are aligned to 0.3.5.


## [0.3.4] - 2026-08-09

### Added
- fountain.js - plain LT fountain codec for streaming QR sync
  - createEncoder() emits an endless stream of coded frames from a payload of any size
  - createDecoder() collects frames and reconstructs the original bytes once enough arrive
  - Seeded RNG and robust soliton degree distribution, written from the published Luby Transform method
  - No dependencies, pure XOR and array math
- extension/manage.js - streamFountainQR() displays the fountain stream as a looping animated QR

### Notes
- Reconstruction is byte exact or it has not finished. There is no lossy middle state, so a corrupt credential cannot slip through. AES-GCM verifies the reconstructed payload as a second independent check.
- Validated in Node against dropped, shuffled, and duplicate frames at payload sizes up to 100 credentials. Every case reconstructs exactly. A 14-block vault decodes in roughly 22 frames.
- The stream loops forever emitting fresh coded frames. A receiver points its camera and collects across loops until it can solve, so missed or blurred frames do not require a retransmit.
- Plain LT only, not the patented Raptor or RaptorQ variants. Implemented from the public algorithm, no vendored library, no attribution owed.
- The fountain stream carries the large vault payload. The pairing handshake stays a single static QR.

### In Progress
- Camera scanning that feeds frames into the decoder, on the phone and in the browser
- Wiring the decoded payload into the existing merge so both devices converge
- Play Store prompt when a generic scanner reads a Valid Vault frame without the app installed

## [0.3.3] - 2026-08-08

### Added
- qrcode.js - vendored QR generator, MIT licensed, fully local with no network calls
  - Produces scannable QR codes from pairing and vault data
  - Self-contained ES module, no runtime dependencies
- frames.js - frame batching so any vault size can move as scannable QR codes
  - splitIntoFrames() breaks a payload into numbered frames tagged with index and total
  - createFrameCollector() reassembles frames, handling out-of-order arrival and duplicates
  - Rejects incomplete frame sets so a partial scan cannot produce a corrupt vault
- extension/manage.js - animated frame display in the Sync tab
  - Small payloads show a single static QR
  - Large payloads cycle through numbered frames automatically for the scanning device
- extension Sync tab with Start Sync, QR display, comparison code entry, and PIN confirmation

### Changed
- Sync tab content is isolated to the Sync tab and no longer bleeds into other settings tabs
- package.json version aligned to 0.3.3

### Notes
- Frame batching validated in Node: a 50-credential vault splits into 17 frames and reassembles exactly, in order, out of order, and with duplicate frames present.
- The transport stays fully local. QR frames carry data device to device with no network, no cloud, and no account.
- QR display works on both the app and the extension. Each device reads the other's credentials, then writes its own identical merged vault locally rather than receiving a finished file.

### In Progress
- Webcam QR scanning in the browser so it can read frames back from the phone
- QR frame display on the phone so it can show its credentials to the browser
- Send-only fallback for devices without a camera

## [0.3.2] - 2026-08-07

### Added
- passwords.js - mergeVaults() reconciles two vaults credential by credential
  - Match key is the decrypted username within a domain
  - Same username, newest updatedAt wins, the older password is discarded
  - Different usernames on the same domain coexist as separate logins
  - Domains present on only one device are preserved
- passwords.js - reEncryptVault() swaps a vault from one master key to another without altering contents
- pairing.js - receiveTransfer() now merges instead of overwriting
  - The vault with the oldest meta.createdAt supplies the shared master key
  - The other device re-encrypts its credentials under that shared key before merging
  - Merged vault keeps the oldest createdAt so the key rule stays stable across future syncs
- passwords.js - deleteCredential() writes a tombstone instead of removing the entry
  - Tombstone carries deleted, deletedAt, and updatedAt, and clears the encrypted secrets
  - A newer tombstone beats an older credential on merge and removes it from both devices
- extension/pairing.js - pairing logic ported into the extension so it can participate in sync

### Changed
- getCredentials() and getAllDomains() skip tombstones, so deleted entries stay invisible to the UI and autofill while remaining available to the merge
- saveCredential() replaces an existing credential for the same username rather than duplicating it
- Unlock methods (fingerprint, PIN, password) stay local to each device and never enter a transfer. Only stored website credentials sync.

### Notes
- Master key selection and credential contents are governed by two independent rules. Oldest createdAt decides the shared encryption key. Newest updatedAt decides which password is current. They never interact.
- The master key is not user facing. When a late sync introduces an older device, the shared key silently converges to that older key with no visible effect on stored logins.
- Devices converge. If every device eventually syncs with the group, all devices land on the same master key and the same credential set.
- Merge logic is identical across the app and the extension. Both projects share the same passwords.js and pairing.js.
- All merge behavior validated in Node against WebCrypto: oldest-key-wins, re-encryption under the shared key, newest password replacing the old, coexisting usernames, tombstone deletion, one-sided domain preservation, createdAt convergence.

### In Progress
- QR pairing UI on both the app and the extension so a user can start a sync
- Comparison code confirmation screen during pairing

## [0.3.1] - 2026-08-05

### Added
- extension/ — browser extension brought into the repo (settings page, autofill dropdown, toolbar popup, content script)
- extension/background.js — service worker answering credential requests so the autofill dropdown populates whether or not the popup is open
- Autofill dropdown renders on login fields and fills saved credentials for the current domain
- Session key bridged to the worker via chrome.storage.session — memory only, cleared on browser close

### Fixed
- Autofill dropdown showed an empty box when the popup was closed — the worker now serves credentials independently
- Extension carried the pre-0.3.0 crypto — now on the same secure core as the app (WebAuthn PRF, verify-by-unwrap, PBKDF2 600k)

### Changed
- Extension PIN, password, and fingerprint unlock rebuilt on the secure crypto core with no stored verification hashes
- Extension version aligned to 0.3.1

### In Progress
- Settings and options page access from the popup — actively being built
- Full autofill profile (name, address, email, phone) alongside credentials — actively being built
- Save credentials during signup rather than manual entry — actively being built

### Notes
- Autofill detection currently wires on fields present at page load — dynamic-form coverage is part of the in-progress autofill work
- App and extension now share one crypto and auth core

## [0.3.0] - 2026-08-04

### Fixed
- auth.js - fingerprint wrapping key no longer derived from a hardcoded constant
  - Previous behavior: wrapping key derived from a public string plus a salt stored beside the ciphertext - the WebAuthn prompt was a UI gate only, its result never used
  - Any party with database access could unwrap the master key without touching the biometric
  - Fingerprint-wrapped keys are now bound to authenticator secret material via WebAuthn PRF
- crypto.js - stored PIN and password verification hashes removed entirely
  - Previous behavior: 4-round SHA-256 verification hashes stored beside the wrapped keys gave offline attackers a fast oracle, bypassing the full KDF cost
  - Wrong credentials now fail at the AES-GCM unwrap - every offline guess pays the full derivation cost
- pairing.js - generatePairingCode() modulo bias removed via rejection sampling
- store.js - clearAll() now awaits transaction completion - wipes commit before returning
- build.js - status indicator element IDs corrected to match markup - indicators were silently dead
- build.js - session status indicator wired to live session state

### Added
- crypto.js - deriveKeyFromPrfOutput() - HKDF-SHA256 derivation from WebAuthn PRF output to AES-GCM wrapping key
- crypto.js - PBKDF2_ITERATIONS raised to 600,000 - LEGACY_PBKDF2_ITERATIONS retained at 100,000 for migration unwraps
- auth.js - WebAuthn PRF enrollment flow
  - PRF extension requested at credential creation with a random 32-byte eval salt
  - PRF output taken at creation when the platform returns it there, otherwise via one assertion
  - Devices without PRF support are refused honestly - no fake biometric gate is ever presented
  - fingerprintCredentialId and fingerprintPrfSalt stored per enrollment
- auth.js - upgradeWrap() - silent rewrap migration on successful unlock
  - Legacy 100k-iteration wraps rewrapped at 600k with a fresh salt
  - Lingering legacy hash fields deleted during migration
- auth.js - authenticateLegacyFingerprint() - one-time migration unwrap for pre-0.3.0 fingerprint enrollments, deletes the insecure wrap, returns requiresReenroll
- auth.js - authenticateLegacyPIN() - one-time migration unlock for pre-0.3.0 PIN-wrapped vaults, purges persistent PIN fields, returns requiresAuthSetup when no other method exists
- auth.js - per-method kdfIterations field persisted with each wrap - future cost raises migrate the same way
- session.js - ephemeral session PIN system
  - setSessionPin() - encrypts the exported master key under a PIN-derived key with a fresh in-memory salt
  - softLockNow() - inactivity lock nulls the raw key, retains only the PIN-encrypted blob
  - resumeWithPin() - decrypts and restores the master key on correct PIN
  - Three failed resume attempts trigger a full hard wipe - vault requires password or fingerprint
  - isSoftLocked(), hasSessionPin(), clearSessionPin() state helpers

### Changed
- Credential verification is now unwrap-based - the AES-GCM auth tag is the verifier, nothing cheaper than the wrap exists in storage
- PIN demoted from persistent wrap method to ephemeral session resume
  - PIN never touches disk - it exists only in memory for the current session
  - Force-closing the app clears it by design - a fresh session requires the real credential
  - Cold-start unlock is password or fingerprint only
- Fresh salt generated on every credential set - salts are never reused across changes
- removeFingerprint() requires a password backup - PIN no longer counts as a recovery path
- removePassword() requires a fingerprint backup
- Session inactivity timeout soft-locks when a session PIN is set, hard-locks otherwise
- Rebranded Valid Vault to Local Vault - page title, header, WebAuthn RP name, boot log
- Header carries a two-line identity - Local Vault over Password Manager

### Removed
- FINGERPRINT_SECRET hardcoded constant - retained internally only for the legacy migration unwrap
- sha256Kdf(), hashPin(), hashPassword(), arraysEqual() from crypto.js
- setPIN(), authenticatePIN(), removePIN(), startPINCreation() from auth.js
- pinWrappedKey, pinSalt, pinHash, pinKdfIterations from persistent auth storage - purged on any successful unlock

### Security
- **CRITICAL:** Fingerprint path previously provided zero cryptographic protection - vault contents were recoverable from the database alone when fingerprint was enrolled
- **CRITICAL:** Stored verification hashes reduced offline attack cost from 100k PBKDF2 iterations per guess to 4 SHA-256 rounds per guess
- 4-6 digit PINs cannot survive offline attack at any iteration count - resolved structurally by removing PIN from persistent storage rather than by raising cost
- At rest, the database now contains only 600k-iteration password wraps and PRF-bound fingerprint wraps

### Notes
- Session PINs are ephemeral by design - nothing is stored, nothing can be extracted, nothing can be brute-forced offline
- PRF requires a WebAuthn authenticator with PRF extension support - Chrome on Android with a screen-lock credential qualifies, Capacitor WebView behavior requires on-device validation
- Master key round-trips through extractable raw bytes during enrollment of additional methods - unavoidable in pure WebCrypto without hardware keystore binding
- Domain names in vault storage remain plaintext object keys - vault blob encryption is the next scheduled schema change
- All crypto flows validated in Node against WebCrypto - wrap/unwrap round trips, wrong-secret rejection, legacy-to-current migration, PRF-derived wrapping, session PIN lifecycle including 3-attempt wipe

## [0.2.0-alpha] - 2025-11-28

### Added
- Master key wrap architecture - one random 256-bit master key wrapped independently per unlock method
- Fingerprint, PIN, and password unlock paths
- Per-credential AES-GCM encryption of stored usernames and passwords
- ECDH device pairing over QR with numeric comparison code
- Encrypted vault transfer between paired devices with HMAC payload signature
- Session management with inactivity timeout
- IndexedDB persistence - auth, passwords, wallets stores
- Capacitor Android wrapper
- Single-file bundler (build.js) - modules assembled into test.html

### Notes
- Alpha status - key protection layer contains known weaknesses corrected in 0.3.0
- Earlier iterations were not formally tagged

---

[0.3.0]: https://github.com/HiImRook/local-vault-password-manager/releases/tag/v0.3
[0.2.0-alpha]: https://github.com/HiImRook/local-vault-password-manager/releases/tag/v0.2.0-alpha
