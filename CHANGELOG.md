# Changelog

All notable changes to Valid Vault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-10-22

Import Passwords now reads Samsung Pass, Bitwarden JSON, 1Password, and Dashlane files, and brings over logins saved for phone apps. The autofill button in other apps is redrawn.

### Added

* **Samsung Pass files.** Import Passwords opens the .spass file Samsung Pass exports. Enter the password you set when you exported it. It opens the file once, on the device, and is never saved. A wrong password says so and lets you try again.
* **Bitwarden JSON.** Plain JSON exports, and JSON exports protected with a file password, are read directly. Exports locked to a Bitwarden account or protected with Argon2 are refused with an explanation of how to export instead.
* **1Password and Dashlane files.** 1Password .1pux files and Dashlane's zipped CSV export are read without unzipping them first. Archived 1Password items are left out.
* **Logins for apps.** Logins that Google Password Manager, Samsung Pass, and Bitwarden saved for phone apps are imported instead of skipped. Each one is matched to a website from the same entry, from a login in the file or your vault with the same username and password, or from a site you confirm, with a suggestion filled in. Matched apps are linked to their site, so the login fills in the app and on the site. Any app can be skipped.

### Changed

* **A branded autofill button.** The Valid Vault suggestion that appears under a login field in other apps showed as a blank white box on some phones. It is now a dark button with the Valid Vault logo, the name in green, and the site or app it fills, like Log in to Capital One.
* **Every file shows in the picker.** Import Passwords lists all files instead of only CSV files and works out the format from what is inside. This is why a .spass file didn't show before.
* **The delete reminder fits the file.** After a protected file, the reminder says anyone with the file and its export password can read it. An unencrypted file is still called out as unencrypted.

### Security

* **A linked app asks before its first fill.** An app linked without its signature, such as one linked by an import, asks to fill that site into that app the first time. Once you confirm, Valid Vault records the app's signing certificate and fills only into that exact app from then on. If Android doesn't report who signed the app, it asks every time. Declining fills nothing.
* **Imported links never override your devices.** A link made by an import gives way to any link or removed link already on another device when the two sync. An app whose link you removed stays unlinked, and a suggested site can't be the app's package name or a shared ending like co.uk.
* **Files are opened on the device.** Protected files are decrypted in memory with the device's built-in cryptography, and no new libraries were added. Zip contents are size-capped, and a Samsung Pass layout Valid Vault doesn't know stops the import instead of guessing.

### Notes

* Update the extension too. It reads the same files, and app links made there reach the phone through sync.
* Cards, addresses, and notes in a Samsung Pass file are not imported, in keeping with card storage being held back.

## [0.8.8] - 2026-10-20

The vault QR is about twice as fast and much less fussy about aim, on the phone and the extension.

### Added

* **Live readout while scanning.** The scan box shows pieces received, the share of frames caught, and reads per second, for example Receiving 108 of 148 · catching 94% · 16 reads/s.
* **Full brightness on the phone.** While the phone shows a QR, the screen goes to full brightness and stays on, and goes back to normal when the QR closes.
* **Rename the Uni-Vault file.** On the extension, renaming offers to save the linked vault file under the new name and link to it. The old file stays where it is for you to delete.

### Changed

* **More per frame.** Each frame carries its data as raw bytes instead of text, so it holds a third more at the same density, with the same error correction.
* **Faster frames.** The QR changes every 0.2 seconds instead of every 0.4.
* **Scanning on several cores.** The scanner reads frames in background workers, up to three at a time, and skips camera frames it has already seen.
* **Off-center aim keeps reading.** The scanner alternates between the scan box and the whole camera image, so a code that drifts away from the center still reads.
* **A bigger QR on the extension.** The QR is drawn as large as the window allows and scrolls into view when it opens.
* **Key and Vault Name.** Master Key Name in Settings is now Key and Vault Name. One name covers both, so key and vault files you export always match. Renaming a file by hand never stops it from opening.

### Notes

* Update the phone and the extension together. An older scanner can't read a 0.8.8 QR, while the 0.8.8 scanner still reads codes from older versions.
* An 111-piece vault finished in about 25 seconds with blur, shake, or off-center aim, against about 60 seconds before.

## [0.8.7.1] - 2026-10-19

Autofill in the phone's private browser now matches the extension, with pull down to reload and a cleaner menu.

### Added

* **Personal Info in the browser.** First and last name, email, phone, and address fields, including dropdowns, get a V. Tap one and Valid Vault lists the Personal Info fields on that form, with the one you tapped checked and a choice of your saved emails. Check anything else you want and tap Fill. Fields you already typed in are left alone.
* **Password generator in the browser.** New password boxes on sign-up and change password forms get an inverted V. Pick a style, with special characters or letters and numbers only, and a strong password fills the new and confirm boxes. It follows the lengths in Settings and the site's maximum length, pattern, and password rules, and the browser offers to save it when you submit.
* **Your emails on login forms.** An email field on a login form offers your saved emails when the site has no saved login.
* **Pull down to reload.** Pull down from the top of a page and let go once the arrow is full size.
* **Edit quick view sites.** Press, hold, and let go on a site in new tab quick view, then tap Edit to change its name and address. It keeps its place in the list.
* **About** in the browser menu.

### Changed

* **Sign-up forms recognized.** A form that asks for your name is treated as a sign-up form, so its email fills from Personal Info and its password box generates. A login page that marks its password box as new keeps the fill V.
* **Larger V tags.** Tags are up to 36 pixels and step left of a site's own icons inside a field, such as a show password eye.
* **A shorter menu.** Add to new tab quick view, the tracker switch, Tor mode, Valid Vault settings, and About. In Tor mode, New identity, Safer, and Fill login come first. New tab, Reload, Copy link, Open in another app, and Close and wipe are gone, since the toolbar, pull down, and Share already do them.
* **Add to new tab quick view.** Renamed from Add to start page, and new sites go to the bottom of the list.
* **Matching frames.** The address bar, the tab counter, and both widgets use the same line weight and color as the toolbar icons, and the tab counter is drawn as a page with a folded corner.
* **Saved logins name the right account.** When a sign-up form is submitted, the save prompt uses the email or username field, not the nearest filled field.

### Security

* **Only what you check.** Only the Personal Info field you tapped starts checked, so a page that lists extra fields can't collect them in one tap. Values return only to the page that asked, after its origin is checked again.
* **Taps need a real touch.** A V only opens Valid Vault right after a real tap on the page, and after a cancelled request that site's taps are ignored for a few seconds.
* **Tor mode stays manual.** No Personal Info or password generator in Tor mode.

### Notes

* Verified in Chromium on sign-up, login, multi-step, change password, address, and newsletter forms, forms without a form tag, forms rebuilt while Valid Vault is open, and fields with a site's own show password icon.

## [0.8.7] - 2026-10-18

The phone's private browser fills and saves logins from Valid Vault.

### Added

* **V tags in the browser.** Login fields in the private browser get a small green V. Tap it and Valid Vault asks for your fingerprint, device PIN, or password, then fills your saved login for that site. Every fill asks again, and one saved login fills right away while several are listed so you can pick.
* **Fill login.** The browser's menu has Fill login, which does the same as tapping a V.
* **Save from the browser.** When you sign in with a login Valid Vault doesn't have, or with a new password, the browser asks whether to save it. A new login saves right after you unlock, and a changed password asks before it replaces the old one, which is kept as the previous password. The browser doesn't ask again for a login you just filled or one you said Not now to in that session.
* **Logins from other parts of a site.** When a fill has no saved login for the exact address but another part of the site does, such as login.example.com when example.com is saved, those logins are offered first, each with its own address, with Pick another saved site below them. This applies to Android Autofill in other browsers too.

### Security

* **Only the page it was asked for.** A login is filled only into the page it was requested for, matched by scheme, address, and port. If the page changes while Valid Vault is open, nothing is filled.
* **Only one login crosses over.** The vault is unlocked in Valid Vault's own screen, and the browser receives only the one username and password you picked. It never sees the master key or the rest of the vault.
* **Pages can't fill on their own.** A V only opens Valid Vault right after a real tap on the page, and pages that aren't using https ask before filling.
* **Tor mode stays manual.** In Tor mode there are no V tags and no save prompts. Fill login in the menu works on https pages with Safer off, and the first fill each session reminds you that signing in tells the site who you are. New identity and switching Tor mode on or off clear everything the browser held for filling.

### Notes

* The phone User Guide covers filling and saving in the browser, and in Tor mode.
* Verified in Chromium: V tags on login, multi-step, and late-loading forms, none on newsletter boxes or inside frames, fills on React-style fields, save capture on submit and sign-in buttons but not on show-password buttons, and a page that tampers with scripts unable to read a login meant for another address.

## [0.8.6] - 2026-10-17

The phone's private browser gets tabs and a start page with generated backgrounds and pinned sites.

### Added

* **Tabs.** Up to 15 tabs can be open at once. The number beside the address bar shows how many are open. Tap it to see your tabs, switch between them, close one, or close them all, and press and hold it to open a new tab. Tabs you aren't looking at are paused, and their video and audio stop.
* **Start page.** Every new tab opens on a start page with one of 20 generated backgrounds, drawn fresh for each tab. A few are rare, all are unique, and some are seasonal.
* **Pinned sites.** Add a site to the start page with Add to start page in the menu, or with the Add site tile by name and address. Up to 12 fit. New sites go at the bottom and earlier rows move up. Press and hold a site and drag it onto another to reorder, or let go in place to open it in a new tab or remove it.
* **Save a background.** Like this background? Save it to Downloads, under the background, saves that exact picture as a PNG named after the scene.
* **Links in new tabs.** Press and hold a link to open it in a new tab, copy it, or share it.
* **Valid Vault settings.** The browser menu opens Valid Vault's Settings, after your fingerprint or device PIN if the vault is locked.

### Changed

* **New tab replaces Home.** The bottom toolbar has Back, Bookmarks, New tab, Share, and Forward. Back from a page you opened on the start page returns to it, and Back on a start page closes that tab when others are open.
* **No keyboard on open.** The browser opens with the keyboard down, so the start page shows. Tap the address bar to type.
* **Tracker count.** The count moved from the address bar to the start page, and the per-site tracker switch is in the menu.

### Security

* **Tor mode covers every tab.** Turning Tor mode on or off, and New identity, close every tab and wipe the session before anything loads again.
* **Nothing saved from Tor mode.** Pinning sites and the per-site tracker switch are off while Tor mode is on, so a Tor session leaves nothing in the browser's settings.
* **Backgrounds stay offline.** The start page background is drawn in its own page view with no network access, in a background worker, so it never slows the open tabs.

### Notes

* Verified with unit tests of tabs, Back, pinned sites, reordering, and the settings file, and in Chromium: all 20 backgrounds drawn the same way on and off the background worker, at phone and landscape sizes, with no network requests, and saving a background.

## [0.8.5] - 2026-10-16

The phone's private browser gets a Tor mode through Orbot, downloads, a much larger tracker list, Global Privacy Control, and removal of the empty space blocked ads leave behind.

### Added

* **Tor mode.** Turn Tor mode on from the browser's ⋮ menu. Every page then goes through Orbot, the Tor Project's app, and the address bar and toolbar turn purple so you always know which mode you're in. If Orbot isn't running, the browser says so and offers to open or install it. A note each time Tor mode turns on explains what it covers and how to use it after signing in to a site. Each launch of the browser starts in normal mode.
* **New identity.** In Tor mode, New identity clears cookies, logins, site data, cache, and history from the session and starts fresh.
* **Safer.** In Tor mode, Safer turns JavaScript off. Pages load with fewer moving parts, and some sites lose menus, logins, or video while it is on.
* **Downloads.** Files open a confirm box with their name and size, then save to your Downloads folder with a notification when done. On Android 9, the first download asks for storage access.
* **A larger tracker list.** The EasyPrivacy and EasyList domain lists now ship with the browser alongside Valid Vault's own list. Their domains are blocked when a page loads them from a different site, and the per-site switch still turns blocking off for a site that breaks.
* **Global Privacy Control.** Every page and frame receives the Global Privacy Control signal, which asks sites not to sell or share your data. Pages opened from the address bar, links, and bookmarks also send the Sec-GPC header.

### Changed

* **Empty ad space removed.** Where an ad request was blocked, the empty box it leaves on the page is hidden, along with standard ad slots. Turning tracker blocking off for a site turns this off as well.

### Security

* **No direct fallback in Tor mode.** Every request, including looking up site names, goes to Orbot. If Orbot stops, pages stop loading until it is running again. Turning Tor mode on first checks that Orbot is answering.
* **A clean switch.** Switching into or out of Tor mode destroys the page, wipes cookies, site data, cache, and history, and starts a new page, so nothing from one mode carries into the other.
* **WebRTC removed in Tor mode.** Pages can't use WebRTC to reach the internet outside Orbot.
* **Downloads off in Tor mode.** Android's download manager doesn't go through Orbot, so downloads are refused while Tor mode is on.
* **The vault stays separate.** Tor mode applies only to the browser's own process. The vault never goes through it.
* **Startup wipe finishes first.** Opening the browser now waits until anything left from a session Android ended early is wiped before loading the first page.

### Notes

* The EasyPrivacy and EasyList domain file comes from the EasyList authors (https://easylist.to/) and keeps its own GPLv3 or CC BY-SA 3.0 license, described in EASYLIST-NOTICE.txt beside it. blocklist.js rebuilds it from the EasyList repository.
* Tor mode needs the Orbot app and a recent Android System WebView.
* No extension changes. The extension stays at 0.8.4.1.
* Verified with unit tests of tracker matching and site grouping, and in Chromium: the Global Privacy Control, WebRTC removal, and ad space scripts, including frames added after the page loads.

## [0.8.4.1] - 2026-10-15

Logins saved on one part of a site now fill on its other parts, such as a separate sign-in page.

### Fixed

* **Sign-in pages on a different part of a site.** Many sites sign you in on their own sign-in address, such as login.example.com or auth.example.com, while the login was saved or imported under www.example.com. The V tag now lists those logins in a section named Saved on other parts of this site, with the address each one was saved under, and fills the one you pick. Logging in with one of them doesn't offer to save it again.

### Security

* **Same site only.** Only logins saved under the same site are offered. On shared hosting addresses where every subdomain belongs to someone different, such as github.io pages, logins never cross from one subdomain to another.

## [0.8.4] - 2026-10-14

Import your logins from another password manager and your bookmarks from another browser, on the extension and the phone. Previous passwords are now kept for 30 days, and each login shows when it was last used.

### Added

* **Import passwords.** Sync, Import From Another App, Import Passwords reads a CSV file exported from another password manager and encrypts each login straight into your vault. Exports from Chrome, Edge, Brave, Firefox, Bitwarden, LastPass, Proton Pass, Dashlane, Apple Passwords, 1Password, KeePassXC, and NordPass are recognized. For any other CSV, you pick which columns hold the website, username, and password. Notes come along as a Notes field on the login. App entries, and items that aren't logins such as cards and secure notes, are skipped. A preview shows what is new and what is already saved before anything changes. Extension and phone.
* **A clear choice when passwords differ.** A login matches when the website and username are the same. When the file has a different password for a login you already have, a popup shows both, masked and read-only, with when each was last changed and when yours was last used, and marks the newer one when the file has dates. Pick the one that is current. The other is kept as the previous password for 30 days, and the popup and the summary say until when. When the same login is in the file twice with different passwords, you pick which one to import and the other is left out.
* **Import bookmarks.** On the extension, Import This Browser's Bookmarks brings in the bookmarks of the browser it runs in, with no file. The browser asks for permission when you click it, and Valid Vault gives the permission back as soon as the bookmarks are read, so the extension never keeps access to them. Import Bookmarks File reads the bookmarks HTML file any browser exports, on the extension and the phone. Folders are combined into one list, and links already saved are skipped.
* **Last used.** Each login records when it was last filled, and Manage and the phone show it. It travels with the vault and merges without counting as an edit.
* **User Guide.** The extension User Guide, the website guide, and the phone User Guide have an Importing From Another App section.

### Changed

* **Previous passwords are kept for 30 days.** A replaced password stays available as the previous password for 30 days from the day it was replaced, then it is removed. Before, it was removed after the new password had been used 3 times and 14 days had passed. The login picker and Manage show the date it will be removed. Extension and phone.

### Fixed

* **Editing a password in Manage keeps the old one.** Changing a password from Manage now keeps the old password as the previous password, the same as a save prompt does.
* **An expired previous password can't be restored.** Restoring a previous password older than 30 days is refused and the old password is removed.

### Security

* **No unencrypted export.** Importing is one way. Valid Vault still has no way to export passwords unencrypted, since that would undo the point of an encrypted vault.
* **Nothing saved until the end.** An import writes once, after every choice is made. Stop import, or the vault locking, leaves your vault exactly as it was, and any choice popup still open closes when the vault locks.
* **Changes made during an import are kept.** If a login changes while a choice popup is open, for example from a save prompt in another tab, the import keeps that change and stores the file's password as the previous password.
* **Deleted stays deleted.** Logins and bookmarks you deleted are not brought back by an import. A deleted login returns only when the file shows its password was changed after you deleted it.
* **The file stays yours to delete.** The summary reminds you to delete the CSV file, since it holds your passwords unencrypted and Valid Vault can't delete it for you. Files over 20 MB are refused.

### Notes

* Fewer vault writes: filling the same login again within 10 minutes no longer rewrites the vault.
* Samsung Pass has no export Valid Vault can read.
* The extension changes go to the Chrome Web Store as 0.8.4.
* Verified with unit tests of the CSV reader, format detection, conflict handling, deleted logins, the 30-day previous password, and merging last used dates, and in Chromium: the full import flow on the extension and the phone, stopping an import, the vault locking mid-import, and regression runs of the phone, autofill, share, browser, key, merge, and extension suites.

## [0.8.3] - 2026-10-13

A private browser and home screen widgets for the phone app, plus a key name fix and clearer key import prompts for the extension and the phone.

### Added

* **Private browser.** The phone app includes a modified Chromium browser, built on the Android System WebView. Type a web address to go to it, or anything else to search. It opens one page at a time. The address bar sits at the top with the tracker count on its left and a menu on its right (Reload, Copy link, the tracker switch for the site, Open in another app, and Close and wipe). A bar along the bottom has Back, Bookmarks, Home, Share, and Forward. Both bars slide away as you scroll down and come back when you scroll up.
* **New tab page.** Home shows the Valid Vault logo full size, a Search privately box, your search engine, and how many trackers were blocked this session.
* **Tracker blocking.** Requests to known trackers and ad scripts, such as Google Analytics, DoubleClick, the Facebook pixel, Microsoft Clarity, Hotjar, and Criteo, are blocked before they load. The address bar shows how many were blocked on the page. If a site breaks, tap the count to turn blocking off for that site, and turn it back on from Settings.
* **Clean links.** Tracking tags such as utm, fbclid, gclid, and msclkid are removed from every link you open, along with site share tags such as YouTube's si. Redirect wrappers from Google, Facebook, Instagram, YouTube, Steam, and Reddit are skipped, so you land on the page itself.
* **Private by default.** Third-party cookies are blocked, the header that names the app to sites is hidden, and location, camera, and microphone requests are denied. Closing the browser wipes cookies, site data, cache, and history, and opening it clears anything left from a session Android ended early.
* **Search engines.** Startpage is the default. DuckDuckGo and Brave Search can be picked in Settings, Browser.
* **Home screen widgets.** A 4x1 Search privately bar with a Bookmarks button, and a 4x2 widget that adds Bookmarks, Logins, Wallet, and Personal buttons. Each button opens Valid Vault, asks for your fingerprint or device PIN once, and goes straight to that section.
* **App icon.** Valid Vault's launcher icon is now the globe V logo, filling the icon edge to edge.
* **Ways in.** The widgets, a Search shortcut with the Valid Vault logo when you long-press the app icon, an Open browser button in Settings, and bookmarks, which now open in the browser. The browser's Bookmarks button opens Valid Vault's Bookmarks the same way.
* **Tor and VPNs.** The browser works with Tor or a VPN through an app such as Orbot in VPN mode, like any other app.
* **Settings and User Guide.** Settings, Browser has the search engine, the sites with blocking off, and Open browser. The phone User Guide has a Private browser section and covers the widgets.

### Fixed

* **Key name kept on import.** Importing a key file that still had the default name, My Master Key, replaced a name you had set. A default name no longer overwrites yours. A key file with its own name still brings it along, and importing a different key with the default name resets the label to the default. Extension and phone.
* **Clearer key import prompts.** The password asked for while importing a key unlocks that key on this browser or phone only. The prompt now says so, and that it is never put in a key file. Extension and phone.
* **No browser save prompts on passphrases.** Passphrase, answer, and password boxes in the extension's dialogs no longer look like password fields to Chrome, so Chrome stops offering to save what you type into them. They stay masked, and copying from a masked box is blocked.

### Security

* **Kept apart from the vault.** The browser runs in its own process with its own WebView storage, so wiping it never touches the vault, and it has no access to your vault data.
* **Outside apps can only open search.** The Search shortcut opens the search box. Web addresses are only accepted from Valid Vault itself.
* **Browser files stay out of backups.** Browser storage and settings are left out of Android backups and device transfers.
* **Web addresses only.** Mail, phone, text, and map links open their app only after a tap, and every other kind of link is refused.

### Notes

* The browser needs Android 9 or newer. On older phones the widgets and shortcut are hidden and bookmarks open as before.
* The extension changes go to the Chrome Web Store as 0.8.3.
* Downloads are not supported yet.
* Valid Vault autofill inside the browser is planned for v0.8.4.
* Verified with unit tests of the tracker and link rules, the Android code compiled against the platform interfaces, and in Chromium: the phone's browser settings, bookmark opening and fallbacks, every widget button from a locked and an unlocked app with one unlock each, key imports keeping or resetting the name, and regression runs of the phone, autofill, share, key, and extension suites. The first browser build was confirmed on a Samsung phone; the new layout and widgets are being tested on phones now.

## [0.8.2] - 2026-10-12
 
Android Autofill and Share to Bookmarks for the phone app, with a matching update to the extension so linked apps survive syncing.
 
### Added
 
* **Android Autofill.** Valid Vault can be the phone's autofill service. Tap a login field in an app or browser and choose Valid Vault from the suggestions. A small Valid Vault sheet opens over the app and asks for your fingerprint or device PIN, with the master password as the fallback. With one saved login for the site it fills right away; with several, pick one by username. Only that login's username and password are handed to Android, and every fill asks again, even while the app is unlocked.
* **Save from other apps.** When you sign in somewhere new, Android offers to save the login to Valid Vault. Confirm with your fingerprint and it is encrypted like any other login. A changed password updates the saved one and keeps the old one as the previous password, and a login that is already saved is left alone.
* **Linked apps.** Browsers report the website, so matching works like the extension. Apps only report their name, so the first fill in an app asks which saved site it belongs to. That link is stored inside the encrypted logins and travels with your vault. Settings, Linked apps lists them with Unlink.
* **Share to Bookmarks.** Tap Share in any app and choose Valid Vault to save the page as an encrypted bookmark, with an editable title, then return to that app. A locked vault asks for fingerprint or device PIN right away, links are picked out of shared text, a share with no web address is refused, and sharing a page twice updates it instead of adding a duplicate.
* **Autofill in Settings and the User Guide.** Settings shows whether Valid Vault is the autofill service with a Turn on button, and the phone User Guide covers turning it on, including the Chrome setting for other autofill services.
### Security
 
* **Websites are only trusted from known browsers.** The website a screen reports is used only when the app is a known browser. A web page inside any other app never uses or creates an app link, and the sheet names the page so you can decide.
* **Linked apps are tied to the app's signature.** A link remembers the signing certificate of the app it was made for when Android makes it available. If a different app with the same name asks to fill, the link is not used and the sheet warns you.
* **Nothing kept outside the vault.** The autofill service only reads which fields a form has, never your data. A typed password waiting for you to confirm a save is held in memory for at most two minutes. The fill sheet blocks screenshots, and plugin call logging is turned off so filled values never reach the Android log.
### Changed
 
* **Extension:** merging and Uni-Vault keep linked apps from the phone, so a vault that passes through the extension still carries them.
### Notes
 
* Verified in Chromium on the phone build: browser and app fills with one or several logins, linking an app and filling straight through on later fills, a web page inside an app, a browser with no site, a re-signed app, failed and retried unlocks, saving new, repeated, and changed logins, linked apps syncing to a second phone through a vault file, and merges in either order.

## [0.8.1.1] - 2026-10-11

Hotfix for the extension and the phone app.

### Fixed

* **Key files are checked before any key derivation starts.** A key file or key QR now has to match exactly what Valid Vault writes: a supported version, the standard 1,000,000 PBKDF2 rounds, a 16-byte salt, and a wrapped key of the right size. Before, a crafted file could ask for an enormous number of rounds and leave the import spinning on Checking... while it tied up the processor. It could not reach your vault or your key, since the only key involved was the file's own. Anything that fails the check is refused at once with "That key file is damaged or incomplete. Nothing was changed.", on the extension, the phone, and the lock screen's key file recovery. Every key file Valid Vault has written still imports.

### Notes

* Verified in Chromium on the phone build and the extension: genuine key files, including ones without a version or round count, import and open; files with huge, low, or non-numeric round counts, a newer version, a short or out-of-range salt, or a wrong-size wrapped key are refused in under 200 milliseconds before any prompt; plus regression runs of the full phone, QR, and extension suites.

## [0.8.1] - 2026-10-11
 
The vault QR is rebuilt so a phone camera can read it from a computer screen, along with fixes for fingerprint unlock after an upgrade, key file names, and key import on the extension. Update the phone and the extension together: both send the new QR, and a 0.8.0 scanner can't read it.

### Changed

* **Vault and key QR are larger and lighter.** Each frame now carries less data, so the code has bigger squares, and the stream is compressed first, so a typical vault needs about half as many frames. The vault QR and the key QR are drawn at the same size, filling the phone screen and up to 460 pixels on the extension, and each frame is far lighter to draw, so the phone stays responsive while it shows.
* **Missed frames no longer stall a scan.** The stream first shows every piece once in order, then shows mixes that can fill in any piece the camera missed, and the scanner solves for whatever is still missing. A scan finishes a few frames after enough have been read, wherever the camera joins the stream. Frames change every 400 milliseconds instead of 300.
* **Sharper scanning.** The scanner asks for a 720p camera feed with continuous focus where the camera offers it, and reads only the square shown in the scan box. A damaged frame is skipped instead of stopping the scanner. The new scanner still reads codes from 0.8.0.
* **Key nickname travels with the key.** Importing a key file or key QR takes on the nickname it was exported with, on the phone and the extension, so vault and key file names stay recognizable. Sharing or exporting a key always uses the current nickname, including after a rename.
* **The phone globe only animates while on screen.** It starts just before it scrolls into view, keeps its place in the rotation, and stops completely inside the app.

### Fixed

* **Fingerprint unlock after an Android reset.** When Android reports that the phone's fingerprint key is gone or was reset, the next password unlock removes the dead fingerprint setting and opens Manage with a note to enroll it again. A cancelled fingerprint never removes anything.
* **Extension key import asks everything first.** Importing a different key on the extension now asks every question before it writes anything, so cancelling at any prompt changes nothing. Fingerprint, password, and removals are then saved back to back, and the old vault is cleared only after the new unlock methods are saved.

### Notes

* Verified in Chromium with the extension and the phone build: vault and key QR streams drawn, read back with the same jsQR decoder the scanner uses, and decoded to the original vault; random missed frames; codes from 0.8.0 still read; the dead fingerprint cleanup; the globe pausing off screen; nickname adoption; and extension key import cancelled at the password prompt with nothing changed.

## [0.8.0] - 2026-10-11

The phone app is rebuilt on the extension's own code, and vault import, export, and merge are hardened on both. The phone and the extension now share one copy of the vault, crypto, unlock, key, and merge modules, so they stay in step from here on.

### Added

* **Phone app on the shared modules.** build.js bundles the phone from the extension's own modules plus new phone screens in phone/, into one self-contained HTML file as before. The old top-level copies of the core modules and test.html are removed.
* **Every extension tab on the phone.** Website Credentials with Add Login, login type, previous password restore, and extra fields; Personal Info; Misc Credentials; Crypto Wallets with seed word checking and touch reordering; Bookmarks with search, rename, reorder, and open in your browser; Sync; Settings; a phone User Guide; and About.
* **Protected key transfer on the phone.** Share Master Key and Export Key carry the passphrase-and-questions package, the phone accepts key QRs and key files from the extension, and raw key QRs from older versions are refused.
* **Set up from an existing key.** A new phone can start from your master key by key QR or key file, choose fingerprint or a password to unlock, and is then offered to bring the vault right away.
* **Key-file recovery on the lock screen.** Can't unlock? restores access with your key file or a key QR, for a phone whose fingerprint was reset with no password set, or a forgotten password.
* **Password generator on the phone.** Add Login, Edit password, and Misc Credentials can generate a password with or without special characters, using the length ranges in Settings.

### Changed

* **Re-authentication on the phone.** Transfers, unlock method changes, Clear Vault, and each section ask for fingerprint, device PIN, or password, the same as the extension.
* **Key import on the phone** survives lock and unlock, warns before a different key clears local data, and collects every choice before writing anything, so an interrupted import never leaves unlock methods split between two keys.
* **Auto-lock on the phone** follows the setting, up to 2 hours, and locking clears revealed secrets and closes open dialogs without acting on them.
* **Fingerprint re-enroll** writes to a second Android Keystore slot and swaps it in only after the new fingerprint succeeds. Device PIN in the fingerprint prompt is limited to Android 11 and up, where Android supports it with a hardware key.
* **Extension masked entry.** Misc Credentials and extra field values are now typed into masked Valid Vault dialogs instead of a plain browser prompt, and exported key files take the current key name.

### Fixed

* **Imports are checked in full before anything is written.** A file made with a different key, a damaged section, or a file from a newer version is refused and nothing changes. Before, a section that failed late could leave earlier sections already merged.
* **No duplicates on merge.** A login created separately on two devices and then deleted on one now stays deleted, renaming a username or a misc credential no longer produces two entries, and a misc credential saved again keeps its id so a later delete reaches every copy.
* **Repeat imports change nothing.** Unchanged sections are no longer rewritten, and the result says Already up to date.
* **Ties resolve the same everywhere.** Two edits with the same timestamp now settle the same way on every device, for logins, misc credentials, personal info, bookmarks, and wallets.
* **Phone bugs from the old app:** key file import that always reported a wrong passphrase, a hidden 5 minute lock that ignored the setting, error messages that never appeared, deletes made on the phone coming back after a merge, previous-password history erased by phone saves, and a plaintext migration journal.

### Notes

* Verified in Chromium with the real extension and the phone build, using a simulated Android fingerprint reader: two- and three-device syncs with random edits converging with no duplicates, the extension's key and vault carried to the phone and back, an old phone install opening after the update, auto-lock during Clear Vault never deleting, and key-file recovery. Verified on a Samsung phone: in-place upgrade from the old app and the key carried from the extension over QR.
* Live vault QR scanning is not reliable on a phone yet. Vault files carry everything in the meantime.

## [0.7.4.3] - 2026-10-10

Extension-only security update.

### Fixed

* **Unlock attempt limit holds across windows.** The limit of three wrong passwords or failed fingerprints before a one-minute wait was counted separately in each Valid Vault window, so closing and reopening the popup started the count over. The count is now kept in the extension's own storage and shared by the popup, the Manage page, and the unlock window, so a fourth try anywhere waits out the minute. A successful unlock clears it.
* **Manage page closed to websites.** The manifest listed the Manage page as a resource any website could load. Nothing needed that, since Valid Vault opens Manage itself. Websites can no longer load it, frame it, or probe for it to detect that Valid Vault is installed.

### Notes

* Verified in Chromium with the actual extension: three wrong passwords in three separate popups, then a fourth try in a new popup is refused even with the right password, the unlock window sees the same lockout, the right password works once the minute passes, and a website's attempts to fetch or frame the Manage page are blocked.

## [0.7.4.2] - 2026-10-10

Extension-only update. Setup and unlock now show only the unlock methods a browser can actually use, so Linux and other computers without a built-in fingerprint reader get a clean password setup.

### Changed

* **Setup checks for fingerprint support first.** Where the browser has no built-in fingerprint or device PIN, as in Chrome on Linux or Windows without Windows Hello, setup hides the fingerprint Enroll button and shows "Fingerprint / PIN isn't available in this browser. Enroll a master password below."
* **Unlock shows only enrolled methods.** The popup, the idle unlock, and the Manage lock screen show Unlock with Fingerprint only when fingerprint is enrolled in that browser. An enrolled fingerprint keeps its button even when the browser reports no reader, as can happen over Remote Desktop, and the password always remains.
* **Manage shows fingerprint as unavailable.** The Fingerprint card reads "Not available in this browser" instead of "Not enrolled" where the browser has no built-in reader.
* **Fixing fingerprint asks for the password first.** Re-enroll and Delete on the Fingerprint card ask for the master password directly instead of trying fingerprint first, so a browser whose fingerprint passkey is missing can be fixed without failing a fingerprint prompt. If no master password is set, they use fingerprint as before.
* **Wording.** The unlock window and the key import dialog no longer name Windows Hello, so they read correctly on every system.

### Notes

* Verified in Chromium with the real extension, with and without a simulated built-in authenticator: setup buttons, password setup and unlock, fingerprint enrollment and unlock, password-first Re-enroll and Delete (a wrong password is refused, and re-enrolling replaces the browser's own passkey), the enrolled-fingerprint button with no reader present, and every Manage tab with no page errors.

## [0.7.4.1] - 2026-10-08

Extension-only hotfix. Fingerprint unlock no longer breaks when Valid Vault is used in more than one browser on the same computer.

### Fixed

* **Fingerprint in more than one browser.** Every install registered its fingerprint passkey under the same fixed user ID, and browsers that install from the Chrome Web Store, such as Chrome and Brave, share one extension ID. Windows Hello therefore replaced one browser's passkey when another browser enrolled, and the first browser then showed only phone and security key options on unlock. Each install now registers under its own random ID, kept with that browser's unlock settings and reused when it re-enrolls, so browsers no longer overwrite each other.
* **Unlock asks for the built-in fingerprint reader.** Fingerprint unlock now requests this computer's own authenticator instead of offering a phone or security key.
* **Clear message when fingerprint is unavailable.** A cancelled or missing fingerprint now says to unlock with the password and re-enroll fingerprint in Manage, instead of showing a browser error.

### Notes

* If fingerprint stopped working in one of your browsers, unlock it with your password after updating, then re-enroll fingerprint in Manage. Each browser keeps its own fingerprint from then on.
* `package.json` stays at 0.7.4, since npm only accepts three-part versions. The fourth number appears in the extension manifest only.
* Verified in Chromium with a simulated fingerprint authenticator: with the old code, a second install's enrollment removed the first install's passkey; with the fix, both installs keep their passkeys and both unlock.

## [0.7.4] - 2026-10-06

This release requires fingerprint authentication to export or import a key or vault, fixes autofill on sites that build their forms from web components, and lets the password generator make passwords without symbols for sites that reject them. It also replaces three security questions with less public ones, gives computers without Windows Hello a clear password-only setup path, and makes the User Guide accurate about recovery. Extension only, except the security questions, which change on the phone too.

### Added

* **Password style choice.** Clicking the inverted V on a new password field now offers With special characters (Aa1!) or Letters and numbers only (Aa1). After it fills, Generate a different one keeps the chosen style, and a second item switches to the other style.

### Changed

* **Export and import now require fingerprint authentication.** Export Key, Import Key, Export Vault, Import Vault, Share Master Key, Share Vault, and receiving a key or vault by QR now ask for fingerprint, device PIN, or password first, even while the vault is unlocked. Cancelling stops the action with nothing written, shared, or imported. A brand-new browser with no vault yet skips the check, so first setup with Import Key still works. Export Vault and Import Vault ask right after the file is chosen, because the browser only opens a file picker directly from a click.
* **Symbols in generated passwords.** Passwords with special characters now draw symbols from `!@#$%^&*`, the set most sites accept. Some sites rejected the wider set used before, which included `-` and `/`.
* **Security questions.** Three questions were replaced in the same positions: City where you were born became Name of your favorite childhood toy, Name of your first street (a near duplicate of The street you grew up on) became Your favorite childhood book, and Your mothers maiden name became Your mothers middle name. The other seven are unchanged. A key file saved earlier with one of these three now shows the new wording, and still needs the original answer.
* **Setup without fingerprint or device PIN.** On a computer without Windows Hello, choosing Fingerprint / PIN at setup now shows a bold green **Fingerprint / PIN not available on this device** with a note to use a master password instead, which works fully, and moves the cursor to the password box. Before, the browser's own error appeared and read as though the computer could not run Valid Vault. If Windows Hello is present but the prompt is cancelled, setup says it did not complete and offers a retry or a password.
* **User Guide: recovery.** The recovery box, now titled What can and cannot be recovered, states that nothing is lost while any device still unlocks the vault: Change Key Passphrase and a fresh Export Key replace a lost key file or forgotten passphrase. A vault is unrecoverable only when no device unlocks it and no key file can be opened, usually after uninstalling or clearing browser data without exporting the key first. The passphrase advice in Your Master Key says the same. Updated in the extension's guide and on the website.

### Fixed

* **Password fields inside web components were missed.** On sites that place the password field inside a web component's shadow root, the field got no V, and the confirm field got a login V instead. Autofill now looks inside open and closed shadow roots, skips a confirm field whose password field is elsewhere on the page, and sends fill events that cross the component boundary, so the site registers the value.
* **V tags stayed behind on multi-step forms.** When a form slid a finished step out of view instead of removing it, that step's V tags stayed on screen. Tags now hide when their field is slid or clipped out of view or made invisible, and re-check their position after animations and clicks.

### Known Gaps

* The phone app does not yet require fingerprint authentication for export and import. It is planned for the v0.8.x phone de-drift.

### Notes

* Valid Vault is published on the [Chrome Web Store](https://chromewebstore.google.com/detail/valid-vault-password-mana/fkpfaemmphmakebhejhaegjgcnieeoab).
* Verified with Playwright-in-Chromium tests: every transfer action asks for authentication first, cancelling stops each one with nothing written or shared, the correct password continues normally, and a fresh browser's key import skips the check; 18 checks on a web component registration page, 7 style menu checks, a two-step slide form, 43 generator checks, 12 older test pages unchanged, and setup checks with and without a platform authenticator: the notice appears, focuses the password box, and password setup completes, while fingerprint enrollment still succeeds where available.

## [0.7.3] - 2026-09-30

This release lets every browser on one computer share one vault. Uni-Vault links each browser to a single encrypted vault file and keeps them in sync automatically, with no exporting or importing after the first link. It also adds a searchable User Guide inside the extension, makes fingerprint or device PIN the first choice when importing a key, and closes a gap where unlock methods could be changed without authenticating again. Extension only.

### Added

* **Uni-Vault.** Export Vault now opens a Save dialog and offers to link the browser to that file; Import Vault offers to link another browser to the same file. Linked browsers read from and write to that one encrypted file: a change reaches the file within about a second, and other linked browsers pick it up within seconds while Manage is open, within about 30 seconds otherwise, and at every unlock. Merging uses the existing rules, so the newest edit wins and deletes carry across. Each browser keeps its own working copy, so autofill stays instant and nothing is lost if the file is briefly unreachable. Choosing Backup only or Merge once keeps the old one-time behavior, and while a browser is linked, Export Vault saves a separate backup copy without moving the link.
* **Uni-Vault safety.** A damaged file, a file replaced with something else, or a file made with a different master key is refused, left untouched, and never overwritten; the browser keeps working with its own copy and Sync explains why. A browser writes to the file only when it has changes of its own, so linked browsers never rewrite the file back and forth. A new Uni-Vault panel in Sync shows the linked file and last sync time with Reconnect and Unlink, and the popup shows Reconnect if the browser ever drops its permission. Clear Vault also unlinks.
* **Brave detection.** Brave ships the File System Access API switched off, which Uni-Vault needs. In Brave without that setting, Sync says Uni-Vault is switched off in Brave and points to the User Guide, and Export Vault and Import Vault keep working as before.
* **User Guide.** A new User Guide item in the popup menu, between Bookmarks and Settings Menu, opens a full guide in a new tab: first setup, fingerprint and PIN versus password, what locking protects, every timer and length setting, autofill, the password generator, password habits, the master key and passphrase, Uni-Vault, moving between browsers and devices, backups and cold storage, ten recommended setups for different users, troubleshooting, and honest limits. It has a search box at the top right that highlights every match, counts them, and steps through them with Enter and Shift+Enter, plus the same CRT effects as the website.

### Changed

* **Key import offers fingerprint or device PIN first.** Importing a key by file or QR asks how this browser should lock the imported key, with Fingerprint or device PIN (recommended) selected and a master password as the fallback. An existing fingerprint is relinked in place with a single Windows Hello prompt, and an existing password becomes an optional backup. On devices without Windows Hello, it goes straight to the password as before.
* **About links** now include Discord, listed first, and open in a new tab instead of replacing the Manage page.

### Fixed

* **Unlock methods could be changed without authenticating again.** While the vault was unlocked, Edit and Delete for fingerprint and password, and Clear Vault, went ahead without asking. They now ask for fingerprint, device PIN, or password first.
* **Two password prompts showed typed text.** Setting a master password from Manage and editing a saved login's password used plain browser prompts. Both are now masked Valid Vault dialogs.

### Known Gaps

* Uni-Vault needs Brave's File System Access API setting switched on; the User Guide explains how. Chrome and Edge work out of the box.
* Uni-Vault syncs browsers on the same computer. Moving the vault between devices is still Export and Import or QR.
* Whether a browser remembers file permission across restarts depends on the browser. If it asks again, Reconnect restores it in one click.

### Notes

* Verified with Playwright-in-Chromium tests: 18 Uni-Vault checks across two browser profiles sharing one file (linking, merging both ways, website saves with no Manage page open, deletes, refusing damaged and wrong-key files, recovery, unlink, and the Brave fallback), 17 fingerprint-first key import checks with a virtual authenticator, re-authentication and masked prompt checks, 18 User Guide and search checks, and regression runs of the key transport, wallets, and generator suites.

## [0.7.2] - 2026-09-28

This release adds a password generator to the extension. New password and change password fields get their own V that creates a strong random password and fills both boxes, and a changed password keeps the old one on hand in case the site never accepted the change. It also polishes Settings, the Manage credential list, and the popup. Extension only; the phone app receives the generator in the v0.8.x de-drift.

### Added

* **Password generator.** New password and change password fields get an inverted V (black circle, green V). Clicking it generates a password and fills both the new and confirm boxes, which stay masked. A small note explains what happened and offers Generate a different one; it closes on its own after 5 seconds or on Escape so it never covers the form's buttons.
* **Random and rule-aware.** Characters come from `crypto.getRandomValues` with rejection sampling, so every character is equally likely, and the result is shuffled with a Fisher-Yates pass. Every password includes an uppercase letter, a lowercase letter, a digit, and a symbol from `!@#$%^&*()-_=+[]{};:,.?/~`. Any `maxlength`, `minlength`, `pattern`, or `passwordrules` the site declares is followed, and a limit the site declares always wins.
* **Password Generator settings.** A new Settings section sets the minimum (16 or 20, default 16) and maximum (24, 32, 48, or 64, default 24). Each maximum picks from its own range: minimum to 24, 25 to 32, 33 to 48, or 49 to 64.
* **Change password forms.** The current password field keeps the normal V and fills the saved login, the new and confirm fields get the generator, and the save prompt offers to update the matching account.
* **Previous password safety net.** Changing a saved password keeps the old one as a previous password, stored encrypted with the login inside the vault blob. The login picker shows it under a Previous passwords label with the date it was replaced, and picking it restores it, swapping it back with the new one. It is dropped only after the new password has been used 3 times and 14 days have passed, and counting a use does not change the login's edit time.
* **Readable timeouts in Settings.** Auto-lock shows its value as hours, minutes, and seconds (`00h 05m 00s`), and QR stream timeout as minutes and seconds (`01m 00s`), updated as you type.

### Changed

* **Auto-lock limit raised from 1 hour to 2 hours** on the extension. The Crypto Wallets section follows the same timer, so it can stay open as long as the auto-lock setting allows.
* **Popup border.** The popup has a green border on the sides and bottom with rounded bottom corners, drawn so the corners blend into the popup background at any display scaling.

### Fixed

* **Revealed passwords ran under the edit and delete buttons in Manage.** The password column had a fixed width. It now takes the room the row has, wraps inside its own column when needed, and keeps the buttons their full size, so passwords up to 64 characters read in full. Long usernames and emails wrap instead of being cut off. Misc Credentials uses the same fix.

### Known Gaps

* The phone app has no password generator yet and keeps its 1 hour auto-lock limit until the v0.8.x de-drift.
* QR scanner reliability and the bookmarks QR share moved to v0.8.2, after the phone de-drift.

### Notes

* Verified with Playwright-in-Chromium tests: 43 generator checks covering field roles, both-box fill, masking, character classes, every length range over 60 generations each, site-declared limits, the change password save, and the previous password rule and restore; plus Settings readouts and limits, the Manage list with 24, 32, 48, and 64 character passwords at two window widths, and the popup at 125% display scaling.

## [0.7.1] - 2026-09-28

This release closes the one place where the master key could travel unprotected. Share Master Key used to stream the raw key, so anyone who photographed the QR had the key. The key now only leaves a device wrapped under a passphrase and three security questions, and the receiving device must enter all of them before it can use it. It also fixes two locking bugs found after v0.7.0. Extension only; the phone learns the protected key format in the v0.8.x de-drift.

### Added

* **Protected master key transfer.** Share Master Key streams the master key wrapped under a passphrase and three security answers, stretched with PBKDF2-SHA256 at 1,000,000 iterations and sealed with AES-GCM, instead of the raw key. Export Key saves the same package as a file, in the existing `valid-vault-key` format, so older key files still import.
* **Receiving device gate.** A scanned key or imported key file opens an Accept master key dialog showing the same three questions. The key is only accepted after the passphrase and answers unwrap it; wrong answers are rejected in place and nothing changes. The device that accepts a key keeps the same package, so it can share onward with the same passphrase.
* **Set once, one click after.** The first key share or export opens a setup form: passphrase, confirmation, and three questions the user picks from a list of ten, each with its own answer. The wrapped package is saved with a SHA-256 key identifier and reused only while it matches the current key. Change Key Passphrase replaces it after a fingerprint or password check.
* **Passphrase strength check.** Common passwords and their obvious variations (`Password123!`, `P@ssw0rd!2024`, `Summer2024!!`) are refused, and the form recommends four or more random words plus a number and a symbol.
* **Masked Valid Vault dialogs.** Every password prompt in Manage, including the password fallback after fingerprint and the key import confirmation, moved from plain browser prompts that showed typed text to masked dialogs with a show/hide toggle.

### Changed

* **Raw key QR codes are refused.** A key QR from an older version is rejected with a message pointing to Export Key and Import Key.
* **Personal Info edits try fingerprint or device PIN first**, with the master password as the fallback, instead of requiring the password.
* **About reads the version from the extension manifest**, so it always matches the installed version. It had been stuck at v0.6.2.
* The Sync tab explains that the key stream is protected by the passphrase and answers.

### Fixed

* **Crypto Wallets stayed unlocked after switching tabs.** Switching Manage tabs or browser tabs hid the seed words but left the section open. It now locks back to its unlock button on tab switch and after the auto-lock time, keeping any edit in progress covered until unlocked again.
* **Activity outside the Manage page did not reset auto-lock.** An open Manage tab ran its own timer that only saw activity on that page, so typing on a website with Manage open behind it still locked the vault on schedule. The page timer now reads the shared last-activity time. On websites, mouse movement, scrolling, clicks, and keys now count as activity, not only typing in form fields; only real input counts, so a page cannot fake activity to keep the vault open.

### Known Gaps

* Phone and extension key transfer over QR does not work until the phone learns the protected format in v0.8.x. The key file path works between them in the meantime, and vault QR sync is unaffected.
* Someone who both captures the key QR and watches the passphrase and security answers being typed could still take the key. A captured QR on its own is useless.
* QR scanner reliability on cameras under different conditions is the v0.7.2 focus.

### Notes

* Verified with Playwright-in-Chromium tests across separate browser profiles, scanning the real QR stream from one into the other through a simulated camera: setup validation, one-click reuse, wrong-answer rejection, key file import, onward sharing, refusal of a raw key QR from a real v0.7.0 sender, plus regression runs of the wallets, bookmarks, and unlock window suites.

## [0.7.0] - 2026-09-27

This release adds two new encrypted sections to the vault, Crypto Wallets for seed phrases and Bookmarks, both sealed the same way as Website Credentials and both carried between browsers inside the encrypted vault file. It also moves on-page unlocking into a dedicated extension window with Windows Hello, and fixes the popup lock button. Extension only; the phone app receives these sections in the v0.8.x de-drift.

### Added

* **Crypto Wallets.** A new Manage tab between Misc Credentials and Sync. Each wallet (exact, case-sensitive name) holds named accounts; each account has 24 numbered word boxes, filled as far as the wallet needs, plus one optional note with a header, such as a wallet password. Accounts can be renamed, edited, deleted, and dragged to reorder, and wallets can be dragged or sorted A-Z. The tab requires its own unlock inside Manage.
* **Offline seed word checking.** The 2048-word BIP-39 English list is bundled in `bip39-words.js` (SHA-256 `2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda`, matching the official `english.txt`). Boxes suggest matching words as you type, an unknown word asks to keep or clear it, and Done runs the full-phrase checksum with WebCrypto SHA-256; a failed check asks to save anyway or keep editing. Pasting a whole phrase into box 1 fills the boxes in order. Editing saved words shows a warning first. No network lookups, no new dependency.
* **Hide on blur.** Seed words exist in the page only while shown and are removed, with any open editor covered, on window blur, browser tab switch, Manage tab switch, lock, or when the auto-lock time runs out. Word boxes disable autocomplete and spellcheck.
* **Encrypted bookmarks.** A bookmark icon beside the popup's lock, hollow when the page is not saved and filled when it is, with a confirm panel to add (editable name) or remove. A new Bookmarks menu item opens a side panel list with search, rename, remove, and drag reorder by a grip on each row. The list stays alphabetical until the first drag, after which new bookmarks go to the bottom. Adds the `sidePanel` permission.
* **Sealed sections.** `sealed.js` serializes a section, deflate-compresses it, and encrypts it as one AES-GCM blob with a fresh IV per write. Crypto Wallets (in the existing `wallets` store) and Bookmarks (new `bookmarks` store, database version 5) both use it, so wallet names, account names, seed words, notes, addresses, titles, and ordering are not readable at rest. A row with an unrecognized `schemaVersion` or an unexpected shape throws instead of being treated as empty.
* **Deterministic merge for both sections.** Records carry permanent random IDs; the newest edit wins per record, deletes carry across as tombstones, and ordering merges per entry. For wallets, the same seed saved twice in one wallet keeps the older copy, and accounts sharing a name resolve by age (older keeps it, newer become `.1`, `.2`) identically on every device, so any number of devices merged in any order converge and re-importing changes nothing. Bookmarks merge by address with no duplicates.
* **Unlock window.** Clicking a V tag or Unlock and Save while locked opens a small Valid Vault window that starts Windows Hello, with a password fallback and show/hide toggle. The unlock runs in the extension's own origin, so fingerprint now works for on-page unlocks and nothing is typed into the visited page. The in-page password box and the content-script password path are removed.

### Fixed

* **The popup lock button did nothing.** Its handler referenced list elements removed in v0.5.3 and threw before locking. It now locks, and the popup restores an unlock done anywhere else instead of always opening locked.
* **The login email field lost the saved-logins picker** when the password field loaded after the email field. The tag now upgrades in place.
* **Background database connections could block a version upgrade.** background.js now closes each raw IndexedDB connection after its read, and the shared store closes on `versionchange`.

### Changed

* Export Vault and Import Vault include Bookmarks and Crypto Wallets, checked against the unlocked key before merging. Seed phrases are kept out of the live QR share; a bookmarks QR share is planned for v0.7.x.
* Extension icons replaced with the globe-in-a-V logo.
* Manage page content is centered at a maximum width on wide screens.

### Known Gaps

* The phone app does not read Bookmarks or Crypto Wallets yet; they arrive in the v0.8.x phone de-drift and stay encrypted in the vault file until then.
* QR transport refinement is the v0.7.x focus. This is feature work; vault data stays encrypted throughout.
* When the same seed is saved under two different account IDs, only the older copy is kept, so a differing note on the newer copy is dropped.

### Notes

* Every change in this release was verified with Playwright-in-Chromium tests, including three-device merges in every import order, the version 4 to 5 database upgrade with existing logins, and regression runs of the earlier autofill and unlock tests.

## [0.6.4] - 2026-09-26

Hotfix for v0.6.3, extension only. Fixes key import, sync, migration, and autofill problems found in real use after the single-blob release. The phone app receives the matching key and transport fixes in the next release.

### Fixed

* **Setting up a second browser could not receive a vault.** Every browser creates its own key at setup and writes an empty vault under it on first unlock. Importing the real master key afterwards left that vault unreadable, so every read failed and Import Vault or QR sync threw a raw `OperationError`. Importing a key now checks whether this browser's vault opens with it. If not, a warning explains that the current vault will become unusable and is how you prepare to receive the vault from another device; on confirmation the old vault data is cleared and the key is saved.
* **Imported keys reverted on the next unlock.** QR key import only set the key for the current session. File and QR key import now both rewrap the key under the browser's password (confirmed by entering it) and relink or turn off fingerprint, so the key survives lock and unlock.
* **Key file import always reported a wrong passphrase.** The unwrapped key was passed back into a raw-bytes import and threw, which was caught and shown as a bad passphrase even with correct answers.
* **Deleted logins came back.** `mergeVaults()` and `mergeWebCredsVaults()` dropped tombstones from their output, so any older device or backup resurrected a deleted item on the next sync. Tombstones are now kept.
* **The migration journal stored the vault in plaintext.** The verification fingerprint was the full plaintext tree written to IndexedDB. It is now a SHA-256 digest; a journal left by v0.6.3 is still verified.
* **Manage showed every site with 0 accounts.** The list read credentials from the raw vault row, which a single-blob row no longer has. It now reads through the decrypted tree.
* **The background auto-lock ignored the seconds setting.** It used old minute-based defaults, so the autofill session stayed open about 5 minutes idle. It now follows the auto-lock setting, and a fresh unlock or activity on the Manage page counts as activity instead of tripping an immediate lock.
* **Mismatched keys and scan results were silent or cryptic.** Vault import and QR sync now fail with a clear message when the vault was made with a different key, and scan outcomes are always shown.
* **Locked save prompts lost the login.** Saving while locked only said to unlock elsewhere, and clicking outside the prompt dismissed it and discarded the capture. The prompt now shows a masked master password box with a show/hide toggle and unlocks and saves in one step; only "Not now" dismisses it.
* **V tags attached to checkboxes** whose label mentioned a keyword like "email". Non-text inputs are skipped.

### Changed

* **Personal Info no longer fills on page load.** Each matched field gets a visible V tag; clicking it opens a picker with the saved value, and nothing fills until you pick.
* **Login fields use the V tag instead of a focus popup.** The login email/username and password fields each get a V tag listing saved logins for the site, plus saved emails on an email field. Picking a login fills both fields; picking an email fills just that field. The tag moves clear of a site's own icons at the field edge.
* Manage shows "Locked" instead of "Not enrolled" / "Not set" while locked, and lists Personal Info above Misc Credentials.

### Known Gaps

* The phone app still has the v0.6.3 key import, key file import, and silent scan result problems; it is next.
* Old plaintext journal data from a v0.6.3 migration may linger in the browser's own database files until the browser compacts them. New migrations no longer write it.

## [0.6.3] - 2026-09-22

This release replaces per-credential encryption for Website Credentials with single-blob vault encryption, closing the last major gap in what's readable from the raw database at rest. It also closes out three real migration-safety gaps found across independent code review before shipping, and completes the `loginType` classification work scoped since v0.6.0.

### Added

* **`loginType` field on Website Credentials.** Each saved login now classifies as username, email, or phone, so autofill and the credential picker can target the right field type reliably instead of guessing from a generic login string.
* **Single-blob vault encryption for Website Credentials.** The vault row is now `{schemaVersion: 2, blob: {iv, ciphertext}}`, encrypting the whole `{meta, credentials}` tree as one AES-GCM ciphertext. Domain names, credential IDs, timestamps, login types, usernames, passwords, and per-site extra fields are no longer readable as plaintext from the Website Credentials IndexedDB row.
* **Automatic migration on first unlock.** A legacy row is decrypted, backed up encrypted (not plaintext) in a short-lived `vaultMigration` journal, converted to the new tree, and verified before the journal clears. An interrupted migration is detected and rolled back from that encrypted backup on the next unlock instead of being silently treated as done.

### Fixed

* **Unsupported or malformed vault rows could be misread as an empty legacy vault.** `decryptAnyRowToTree()` and `migrateLegacyVault()` now throw on any `schemaVersion` other than `2` or `undefined`, and a `schemaVersion: 2` row missing its `blob` now throws instead of passing `undefined` into decrypt. Previously either case could fall through to the legacy path and, on a later write, silently overwrite real data with an empty tree.
* **Decrypted vault-tree validation only checked the top-level shape.** `isValidVaultTree()` now validates every domain's credential list: each entry needs a string `id`, `deleted` (if present) must actually be a boolean rather than any truthy value, and live (non-tombstoned) credentials need string `username`/`password`. A malformed blob now fails validation immediately instead of crashing later in `getAllDomains()`, `saveCredential()`, or `mergeVaults()`.
* **Legacy migration discarded unknown credential fields.** `decryptLegacyTree()` now spreads the original record before overwriting only the fields it actually decrypts (`username`, `password`, `extraFields`, `loginType`, `createdAt`, `updatedAt`, `id`), so a future or unrecognized field on an old credential survives conversion instead of being silently dropped.
* **Migration verification only proved the blob could decrypt, not that conversion preserved the data.** `finalizeMigration()` now compares a full-tree fingerprint of the plaintext tree, computed right after conversion, against the same fingerprint of the tree decrypted back from the written blob, rolling back on any mismatch the same way it already does for a decrypt/shape failure. The expected fingerprint is stored in the migration journal, so this check also covers a migration resumed after an interrupted run, not just the happy path.

### Changed

* **Pairing and sync no longer reconcile two different master keys.** Importing the same master key on both devices before syncing was already the intended behavior; the old reconciliation path was leftover early-stage logic and is removed. A mismatched key now fails clearly instead of one device's key silently winning.
* **`mergeVaults()` operates on already-decrypted plaintext trees** and no longer needs a master key itself.
* **`getAllDomains()` now returns `{success: false, locked: true}` when called with no key**, instead of assuming it can list domains unencrypted.

### Known Gaps

* Custom div-based comboboxes and `contenteditable` fields remain unsupported by autofill. I feel like this is too rare of an edge case, but will consider any feedback on the matter.
* Every credential read now decrypts the full Website Credentials tree. This is the accepted tradeoff of single-blob storage; a decrypted-tree cache has not been added, since it hasn't been needed in real use yet.

### Notes

* Every hardening fix in this release was verified across multiple rounds of independent code review before shipping, following the same practice established in v0.6.2.
* test.html and www/index.html were rebuilt from build.js to include all of the above.

## [0.6.2] - 2026-09-20

This release resolves the top-priority gap left open by v0.6.1: Website Credentials now reliably saves new logins from real signup flows. It also closes out a long list of correctness and robustness issues in the autofill/injection layer found across several rounds of independent code review, each one verified against the actual code and against real browser behavior (Playwright + Chromium) before shipping.

### Fixed

* **Website Credentials save regression, resolved.** Root cause was `detectLoginForm()`/`matchSignupFieldType()` sharing mutable global state (`usernameField`/`passwordField`) across forms. Wiring a second form - via the page's own dynamic content, or the extension's MutationObserver picking up a form added after load - could silently repoint a first, already-wired form's listeners at the wrong fields. Both now use per-form closures instead of shared globals; verified against a real two-form page.
* **Submit-triggered navigation losing the save prompt.** A real form submit can navigate away (or tear the content script down) before the async "is this already saved" check resolves. Captured credentials are now staged in `background.js` synchronously and recovered on whatever page loads next in the same tab - including across cross-domain SSO/MFA redirects and multi-hop flows (consent screens, MFA steps) that used to lose the prompt partway through. A race between staging and resolving that record is closed via per-tab serialization.
* **False-positive personal-info classification.** A bare keyword like "state" could match inside unrelated free text ("please state your case"). Bare single-word keywords (state, city, zip, etc.) are now only checked against structured signals (`name`/`id`/`autocomplete`), never free text (labels, placeholders, `aria-label`).
* **Autofill silently failing on React/Vue-style controlled inputs.** Filling a field now calls the native `value` property setter before dispatching `input`, so a framework's own value tracker actually picks up the change instead of the DOM and the framework's state disagreeing.
* **Duplicate save prompts from one submission.** A form's own submit event, Enter in the password field, and a nearby-button-click heuristic could each independently trigger capture for the same login. An in-flight guard now collapses overlapping triggers into a single capture.
* **Fields that gain their identifying attributes after insertion** (a framework setting `name`/`id`/`autocomplete`/`aria-label`/`placeholder`/`type` once hydration or a multi-step form advances) are now reclassified when that happens, instead of staying unrecognized for the life of the page.
* **Detached SPA forms and personal-info fields no longer leak.** An unmounted login step or a closed modal used to leave its listeners - including a document-level click listener - and its floating field-tag icon alive indefinitely. Both are now torn down within one debounce cycle of the field leaving the DOM.
* **Two separate formless login widgets on one page no longer both react to one click.** A password field with no wrapping `<form>` had no natural boundary for the "nearby button" heuristic, so every formless widget treated the whole page as its own. Button ownership is now scoped to the smallest containing element that already holds a button.
* **Personal Info autofill and per-site extra-field capture now support `<select>` and `<textarea>`,** not just `<input>`. A state/country dropdown is filled by matching its actual option value or visible text, never a blind value assignment that would silently clear the selection on a mismatch.
* **Activity tracking was incomplete.** Ordinary typing, passive autofill, opening the credential dropdown, and recovering a pending save across a redirect didn't reset the inactivity timer, so the vault could lock mid-use while someone was clearly still there. All four now count as activity, throttled to one ping every few seconds to avoid message spam.

### Known Gaps

* Pending-save recovery is scoped to the browser tab, not the destination page or domain, and expires after 45 seconds. This is a deliberate tradeoff, not an oversight: it's what lets the save prompt survive a cross-domain SSO/MFA redirect at all, at the cost of a narrow window where an unrelated page in the same tab could read a stale entry. Not planned to change without an actual page-identity signal to key off of instead.
* The formless-widget button-ownership heuristic can still misattribute a button on unusually flattened markup where two unrelated widgets happen to share their nearest button-containing ancestor. A narrow edge case, not the general multi-widget bug from v0.6.1, which is fixed.
* Custom div-based comboboxes and `contenteditable` fields remain unsupported - there's no standard attribute signal to classify them the way `<input>`/`<textarea>`/`<select>` are.
* `loginType` (username vs. email vs. phone) on Website Credentials remains scoped but not built.

### Notes

* Every fix in this release was verified with Playwright-in-Chromium tests and/or direct unit tests of the storage logic - following directly from the lesson of the v0.6.1 regression, which shipped without that level of verification.

## [0.6.1] - 2026-09-18

This release adds real autofill injection to the extension - reading Personal Info and Website Credentials to populate page forms - built the safe way, with background.js holding the session key and content.js only ever receiving plaintext values it explicitly asked for.

### Added

* **Personal Info autofill on page load.** Empty, matched fields (name, phone, address) are auto-populated using a three-tier heuristic: `autocomplete` attribute match first, keyword match against field `id`/`name`/`placeholder` second, nearby `<label>` text as a fallback. This replaces exact-selector matching, which failed on real signup forms (e.g. a field with `id="firstName-field"` never matched `id="firstName"`).
* **Email fields are click-to-pick, never auto-filled.** A profile can hold several ranked emails, so an email field is never silently populated on page load. Clicking the field's tag opens a small picker listing every saved email by rank, and only the one selected gets injected.
* **Visible field tag.** A small circular badge marks any field Valid Vault has matched, repositioning correctly on scroll and resize.
* **Inline unlock, directly on the page.** Clicking a tagged field while the vault is locked prompts for the master password right there, no popup required. This is password-only by design - see Notes.

### Fixed

* `background.js` had `indexedDB.open('ValidVault', 1)` hardcoded in three places. With the database now at version 3 after v0.6.0's new stores, this threw a `VersionError` and silently broke background vault access. Opens with no explicit version now.
* The popup could lose the session key on a fast tab switch: `popup.js` wrote it to `chrome.storage.session` itself, and Manifest V3 destroys a popup instantly on losing focus, which could interrupt that write mid-flight. The write is now delegated to `background.js` via message-passing, which has a longer lifecycle.

### Known Gaps

* **Website Credentials does not reliably save new logins captured from a real signup flow.** Root cause: `detectLoginForm()`'s field-selection can collide with Personal Info's autofill targeting the same field on a form (grabbing a first-name field instead of the actual login/email field). A fix was built and shipped internally, caused a separate regression, and was rolled back. Still open, and the clear next priority on content.js.
* Autofill matching quality varies site to site. This release is a working foundation, not a finished feature.
* `loginType` (username vs. email vs. phone as the site's actual identity field) remains scoped but not built; Website Credentials still store a generic login string.

### Notes

* Fingerprint/PIN unlock is intentionally unavailable from the inline, on-page prompt. A WebAuthn platform credential is bound to the origin that created it (`chrome-extension://...`), and a content script running in a visited page's own origin can never trigger that credential. Password-only inline unlock is expected behavior, not a bug.
* No competitor-targeting logic was added, and none is planned. Autofill wins on being fully local and already-unlocked in memory, not on hiding another extension's UI.

## [0.6.0] - 2026-09-14

This release adds two new pieces of storage to the extension, Web Credentials and Personal Info, and fixes a real correctness bug that would have broken syncing the same vault across multiple browsers.

### Added

* **Personal Info**, a new tab under Manage for first name, last name, phone, address, and multiple ranked emails (reorder with up/down, the top one is marked Primary). Viewing requires a normal unlock, but adding or editing any field requires the master password specifically, never fingerprint, a deliberately stricter gate for this category of data.
* **Web Credentials** gained a working Edit. It previously supported add and delete only.
* Both Website Credentials (logins) and Web Credentials now require their own explicit re-unlock inside Manage, separate from simply having the extension open, and re-lock when the extension itself locks.
* Personal Info, Web Credentials, and login credentials are all now included in Share Vault, Export Vault, Import Vault, and QR sync, so they travel together as one vault.

### Fixed

* Importing a master key only ever changed the session in memory. It never re-wrapped the browser's own password or fingerprint around the imported key, so after a lock and unlock, the browser silently reverted to its original key, and anything saved since the import became unreadable. Importing a key now re-wraps it under the browser's existing unlock methods, so it genuinely becomes the browser's key going forward. This was the key gap standing between "export and import a file" and the same vault file staying usable across Chrome, Firefox, and other browsers with one shared master key.
* The save-on-submit prompt fired on every login, even to a site already saved with an unchanged password. It now checks first: silent if nothing changed, a save prompt for a genuinely new username, and an update prompt only when the password for an existing username has changed.
* A fingerprint enrollment issue was tracked down during this cycle: Windows began showing its cross-device/security-key chooser with no local Windows Hello option. Traced through the actual commit history rather than guessed at; the extension's code was confirmed unchanged since v0.3.1. The cause was Windows account passkey state, not the extension, resolved by removing the existing passkey in Windows Settings and re-enrolling.

### Notes

* Extra fields on login credentials (recovery email, notes, and similar) were deliberately left out. A future native autofill feature will handle that separately rather than storing it on the credential record.
* Autofill injection itself, and login-type tracking (username vs. email vs. phone) on Website Credentials, are scoped but not yet built.
* Version bumped to 0.6.0 across the phone and the extension.

## [0.5.5] - 2026-09-13

This release fixes a real export bug that made Export Vault appear to do nothing, and replaces the browser-based file download with a proper native implementation.

### Fixed

* Export Vault reported nothing at all when tapped: success, an empty vault, and a save failure all routed through a log function that wrote to a page element that does not exist anywhere in the phone UI, so every outcome was silently swallowed. A real, visible message area was added for the backup and sync section, and Export Vault, Import Vault, and the shared unlock check now write to it.
* The exported vault file never included the master key's nickname, unlike the key file, which already did. Both now include it, filesystem-safe, with the user's capitalization preserved.
* File saving no longer relies on triggering a browser download inside the Android WebView, which does not reliably work there. Saving now goes through Capacitor's native Filesystem and Share APIs, giving a real native save or share action rather than a silent no-op.

### Changed

* Export Vault is a single button. Tapping it opens a small choice between saving directly to the device's Downloads folder or opening the native share sheet, rather than exposing two separate buttons for the same file.
* A direct-to-Downloads save path was added using Android's MediaStore API through a small native plugin, requiring no extra storage permission on modern Android.

### Notes

* This build remains under active testing; see the About section in both the app and the extension.
* Version bumped to 0.5.5 across the phone and the extension.

## [0.5.4] - 2026-09-13

This release brings the phone app back into parity with the browser extension's v0.5.3 auth and interface work, and fixes a real bug in the process.

### Changed

* The About section on the phone now matches the extension exactly, including the current version and a website link alongside the repository link.
* Website credentials on the phone were rebuilt to match the extension: a collapsible list grouped by domain, with a show/hide toggle for the password and delete only. The old Add and Load-by-domain flow is gone; credentials are added through normal browsing and autofill, not typed in here.
* When a session times out while inside the settings menu, the phone now shows an inline unlock overlay in place, with fingerprint and password options, instead of booting all the way back to the root lock screen. Whether the overlay should show is tracked by an explicit flag set when the menu opens and closes, rather than inferred from page state, which could get stranded across a backgrounded app.
* Password requirements are now enforced consistently at 12 or more characters with a letter, a number, and a symbol, on both the phone and the extension. The extension's underlying validation and its manage-page re-enroll path had quietly kept the old 8-character floor even after the setup screen was tightened; both are now closed.
* Locking now clears the shared session key on the phone the same way it does on the extension, so a completed lock cannot be silently bypassed by state left over from before it.

### Fixed

* The new unlock overlay could become permanently stuck open with no way to dismiss it. The cause was a CSS conflict: the overlay's inline style set it visible, and an inline style always overrides a class-based rule, so hiding it by toggling a class had no effect. The overlay's visibility is now controlled directly rather than through a class that inline styles could override.

### Notes

* Version bumped to 0.5.4 for the phone app; the extension remains at 0.5.3 pending its own next release.

## [0.5.3] - 2026-09-12

This release brings the browser extension into parity with the phone app's auth and sync model. Extension-only; the phone app is unchanged in this release.

### Changed

* Removed the custom app PIN from the extension's setup and manage screens. Device unlock is now fingerprint or the device's own PIN, the same model as the phone.
* Password requirements strengthened to at least 12 characters with a letter, a number, and a symbol.
* The Sync tab was rebuilt to match the phone: Share Vault and Share Master Key display one-way fountain QR streams, Export/Import Vault and Export/Import Key handle encrypted file backup, and a dedicated scan box reads a streamed key or vault using getUserMedia and a vendored jsQR decoder. The old pairing-handshake sync and its webcam flow are gone.
* The front popup no longer shows credential management. It confirms the vault is unlocked and points to the menu, where management now lives exclusively.
* The About section was updated with the current version, a rewritten description, and a website link alongside the repository link.
* Settings replaced the old minutes-based soft/hard lock timers with a single auto-lock timeout in seconds (default 60) and a QR stream timeout in seconds (default 30), matching the phone.
* The master key can now be renamed from Settings, and the exported vault backup filename includes that name, with the user's capitalization preserved.

### Fixed

* The settings menu could go completely unresponsive after certain edits: a missing closing brace on a loop and a malformed duplicate `init()` were silently halting the whole script. Both are corrected.
* Several sync button handlers were unguarded against a missing element, which could halt the rest of the script if one was absent. All are now null-guarded.
* The manage page and the popup run in separate script contexts and were not sharing the unlocked session, so opening the manage page after unlocking in the popup could show it as locked. The manage page now restores the key from the shared session storage on load.
* When a session timed out, the manage page had no way back in short of closing the tab. It now shows an inline unlock overlay with fingerprint and password options, and a background check shows or hides that overlay automatically on any tab if the lock state changes.
* The auto-lock timer was firing on a fixed schedule rather than on true inactivity. Two causes: `lockAll()` was not clearing the shared session key, which could let a locked session quietly resume, and the activity listeners were attached to a container that did not include the sidebar tabs, so switching tabs never reset the idle clock. Activity tracking now covers the whole page, including mouse movement and, for a future touch interface, touch start and touch move.

### Security model

* Fixing `lockAll()` matters beyond convenience: without it, the shared session key could persist after a timeout was supposed to end it, which is a real lock-bypass, now closed.

### Notes

* This release is scoped to the browser extension. The phone app has not yet received the unlock-overlay, lock-monitor, or corrected timer logic from this release; that port is tracked for a future update.
* Version bumped to 0.5.3 in the extension only.

## [0.5.2] - 2026-09-08

This release replaces the barcode-scanning scaffolding with a sovereign implementation, fixes settings persistence, and makes auto-lock a real inactivity timer.

### Changed

* The QR scanner moved off the ML Kit plugin, which was scaffolding meant to prove the flow and always intended for replacement. Scanning now uses the standard web camera (getUserMedia) with a vendored jsQR decoder. The camera renders inside the scan square rather than taking over the screen, and there is no Google or Play Services dependency in the scan path. The ML Kit plugin has been removed from the project.
* Auto-lock is now a real inactivity timer measured in seconds, defaulting to 60. Any activity resets it, and when it expires the vault locks and returns to the lock screen. Previously the field existed but was not wired to anything.
* The QR stream timeout is measured in seconds, defaulting to 30, and governs every QR share. The QR display shows a live countdown and a manual close button.

### Fixed

* The scanner Cancel button now fully stops the camera. It was re-triggering because the tap bubbled up to the scan box and reopened the scanner. Cancel now stops propagation, a re-entry guard prevents a second scan from starting, and the camera track and video element are released cleanly.
* Settings now persist across app restart. The QR stream timeout and auto-lock value are stored in IndexedDB, since browser local storage does not survive an app restart in the Android WebView.

### Security model

* Dropping ML Kit removes the one part of the scan path that relied on a Google-owned SDK and could fetch a model from Play Services. The vendored jsQR decoder runs entirely on device, in the same local, self-contained spirit as the bundled QR generator and fountain codec.

### Notes

* jsQR is vendored as a single MIT-licensed file with no native code and no network calls.
* Version numbers across the app and extension are aligned to 0.5.2.

## [0.5.1] - 2026-09-07

This release wires phone sync end to end and adds encrypted offline backup and key naming.

### Added

* Phone QR sync. Sync Vault and Get Sync Key display one-way fountain QR streams, and a QR scanner reads a key or vault streamed from another device. The fountain codec and QR generator are now bundled into the phone build.
* Encrypted offline backup. Export Vault saves the already-encrypted vault to a file, and Import Vault restores or merges it. The file stays encrypted and is inert without the matching master key.
* Master key export and import as an encrypted file. The key is wrapped under a passphrase of at least 12 characters plus three security questions drawn at random from a pool of ten. The passphrase and answers are combined into one secret and stretched with PBKDF2 at 1,000,000 iterations. Nothing is stored, and a lost passphrase or answers means the file cannot be opened.
* Nameable master key. The key reads as "My Master Key" by default and can be renamed in Settings. The nickname is stored only in file metadata and is never required to import.

### Changed

* Settings no longer offers to re-enroll fingerprint or PIN, since those are managed by the device. The auth section is now titled "Password".
* Scanning a vault on a device without the matching key shows "QR sync not enabled. Import master key first."

### Security model

* Master key transport is deliberate. A live QR stream is the primary path, and the security is the ceremony: do it somewhere private, since anyone who sees the code can capture it. The offline key file adds a second path for disaster recovery, protected by a passphrase and security questions that are never stored, so a stolen file is useless without what is in the owner's head. Vault backups stay encrypted under the master key, so a stolen vault file is inert on any device that did not receive the key.
* Capitalization and spaces matter in the passphrase and answers, and this is stated in the interface. Re-exporting at any time while the app is open produces a fresh file with a new passphrase.

### Notes

* Offline file save uses a standard in-page download rather than a native file plugin, keeping the dependency footprint unchanged.
* Version numbers across the app and extension are aligned to 0.5.1.

## [0.5.0] - 2026-09-06

This release is a hardening and feature-completion pass driven by internal Play Store testing. Most changes are bug fixes and feature fixes surfaced by running the app on real devices.

### Added

* Native Android biometric unlock. The phone now uses Android's BiometricPrompt backed by a hardware-backed Keystore key, rather than web WebAuthn. The master key is wrapped by a Keystore key that requires user authentication, so at rest it is protected by device hardware.
* System PIN as a hard unlock. The device's own PIN/pattern (device credential) unlocks the vault alongside fingerprint, both drive the same Keystore-wrapped master key.
* Show/hide eye toggle on every PIN and password field, across the setup, unlock, and manage screens. All secret fields mask by default.

### Changed

* Device unlock replaces the custom app PIN on the phone. Enrolling "device unlock" links the vault to the system authenticator (fingerprint or system PIN). There is no separate app-managed PIN to type.
* All unlock methods (fingerprint, password, system PIN) are full unlocks. Password remains the universal fallback and the method used for device-to-device sync.
* The front screen no longer shows credential management. Once unlocked it points to the menu; credentials, sync, and settings live there.
* Setup copy reworded to describe linking device unlock and setting a backup password.

### Fixed

* WebAuthn fingerprint failed on the phone with "Error connecting to web authentication service." Root cause: browser WebAuthn does not work inside the Android Capacitor WebView. Resolved by moving the phone to native BiometricPrompt.
* PIN entry rejected valid 4-6 digit PINs on mobile due to keyboard-injected characters. Inputs are now trimmed and use a numeric keyboard. (Superseded on phone by the move to system PIN.)
* Clear Vault appeared not to delete and could strand the app on a stale unlocked screen with no menu. It now fully wipes the vault, credentials, and the native Keystore key, then returns to a clean setup screen.
* Settings-page enroll buttons did nothing. They now use the working enroll flow with Enroll and Re-enroll states.
* Fixed phone bundle module wiring so the app no longer fails to render from stale function lists.

### Security model

* On the phone, the master key at rest is encrypted by a hardware Keystore key that only a successful device authentication (fingerprint or system PIN) can use. On the extension, fingerprint unlock is Windows Hello, which already covers the Hello PIN. Password remains available on both surfaces and is required for syncing between devices.

### Notes

* The WebAuthn RP name remains "Local Vault" in code even though the UI reads "Valid Vault", changing it would invalidate existing enrollments.
* Phone sync remains a work in progress. Personal Info is still a placeholder.
* Version numbers across the app and extension are aligned to 0.5.0.

## [0.4.0] - 2026-09-01

### Added

* Terminal-green visual identity across the extension and phone - Orbitron wordmark, monospace UI, off-black background, shared palette so both surfaces read as one product.
* Valid globe logo - a rotating wireframe globe with a sliced V, rendered live in the phone header and animated on the project sites.
* Configurable lock timers in Settings - separate Soft-lock timer and Hard-lock timer fields, defaulting to 5 minutes soft and 20 minutes hard.
* Extension hamburger dropdown with Settings Menu and Website entries.
* Phone enroll and re-enroll setup flow with view routing across setup, hard-lock, soft-lock, and unlocked states.

### Changed

* PIN role redefined. The PIN is now a permanent credential that resumes a soft-locked idle session only. It never opens a vault from a hard lock. This replaces the 0.3.0 ephemeral session-PIN model.
* Lock behavior split into soft and hard. Hitting Lock soft-locks when a PIN is set, otherwise hard-locks. Inactivity soft-locks at the soft timer when a PIN exists, and hard-locks at the hard timer. Closing the browser always hard-locks.
* Fingerprint and password are the two hard unlocks. Either one fully opens the vault, from any state. The hard-lock screen offers fingerprint and password only, the PIN field is not shown there.
* Auth method controls now read Enroll and Re-enroll. An unset method shows a green Enroll, an already-set method shows a red Re-enroll, on both the extension setup and manage surfaces.
* Extension Back up with Secure Sync jumps to the Sync tab.
* Extension Settings replaced the single auto-lock row with the two soft and hard timer rows and dropped the lock-on-popup-close toggle.
* Phone front screen rebranded with the globe header, and the developer log was removed from the user-facing view.

### Fixed

* Phone bundle crash on load. The phone build read module function lists that had drifted from the reworked session and auth modules, throwing a ReferenceError before any view rendered. The bundler's session and auth wrappers were realigned to the current module exports.

### Security model

* The PIN is deliberately the weakest credential. It resumes an already-open idle session and nothing more. A manual lock or a closed browser always requires fingerprint or password, so a short PIN can never substitute for real authentication.

### Notes

* The WebAuthn RP name remains "Local Vault" in code even though the UI reads "Valid Vault". Changing it would invalidate every enrolled fingerprint, so it is deliberately left unchanged.
* Phone sync remains a work in progress. The sync surface is present but not yet wired end to end.
* Personal Info is still a placeholder on both surfaces.
* Per-method auth edit and delete remain deferred on the phone.
* Version numbers across the app and extension are aligned to 0.4.0.

## [0.3.5] - 2026-08-15

### Added

* Stateless sync model across all surfaces - no pairing ceremony, no key exchange round-trip. A device shows a fountain QR, another scans it. Same method works browser to phone, phone to browser, or to any device with a screen and camera.
* Three sync actions, separated for clarity: Sync Vault (stream your logins), Get Sync Key (give a new device the key it needs), and Import (scan another device to receive either).
* Browser extension Sync tab rebuilt around the three actions with a cycling fountain QR display.
* Browser webcam scanning for Import using the native BarcodeDetector, no vendored decoder.
* Phone Settings Menu behind a hamburger, opening on Manage, with tabs for Manage, Personal Info, Sync, Settings, and About.

### Changed

* Extension popup: the Expand control is now a hamburger that opens the full settings page. Back up with Secure Sync is now a primary action that jumps to the Sync tab.
* Phone front screen simplified to login only. Vault management, sync, and settings moved into the Settings Menu.
* About sections updated to Valid Vault branding and the current repository.

### Security model

* Sync moves the key and vault in the stream itself. The protection is physical, the same trust you rely on when typing a password: do it somewhere private. There is no back channel and no server.

### Notes

* Phone sync is not functional yet. The three sync buttons on the phone are present but stubbed, they display a placeholder message rather than streaming or scanning. The phone bundle still needs the fountain codec and a QR display wired in, plus mlkit camera scanning fed into the decoder. This is the next build.
* Browser Import requires the native BarcodeDetector API. It is available in Chromium browsers but is inconsistent on Windows desktop, where it may report the API exists yet decode nothing. When unavailable, the browser can still send (Sync Vault, Get Sync Key) but cannot receive. A vendored decoder fallback is not yet included.
* The browser send side is verified: the fountain QR cycles correctly for both Sync Vault and Get Sync Key.
* Auth method management on the phone Manage tab currently exposes enroll and set actions only. Per-method edit and delete, present in the browser, are not yet on the phone.
* Personal Info is a placeholder on both surfaces.
* The WebAuthn RP name remains "Local Vault" in code even though the UI now reads "Valid Vault". Changing the RP name would invalidate every enrolled fingerprint, so it is deliberately left unchanged.
* Version numbers across the app and extension are aligned to 0.3.5.



## [0.3.4] - 2026-08-09

### Added

* fountain.js - plain LT fountain codec for streaming QR sync

  * createEncoder() emits an endless stream of coded frames from a payload of any size
  * createDecoder() collects frames and reconstructs the original bytes once enough arrive
  * Seeded RNG and robust soliton degree distribution, written from the published Luby Transform method
  * No dependencies, pure XOR and array math
* extension/manage.js - streamFountainQR() displays the fountain stream as a looping animated QR

### Notes

* Reconstruction is byte exact or it has not finished. There is no lossy middle state, so a corrupt credential cannot slip through. AES-GCM verifies the reconstructed payload as a second independent check.
* Validated in Node against dropped, shuffled, and duplicate frames at payload sizes up to 100 credentials. Every case reconstructs exactly. A 14-block vault decodes in roughly 22 frames.
* The stream loops forever emitting fresh coded frames. A receiver points its camera and collects across loops until it can solve, so missed or blurred frames do not require a retransmit.
* Plain LT only, not the patented Raptor or RaptorQ variants. Implemented from the public algorithm, no vendored library, no attribution owed.
* The fountain stream carries the large vault payload. The pairing handshake stays a single static QR.

### In Progress

* Camera scanning that feeds frames into the decoder, on the phone and in the browser
* Wiring the decoded payload into the existing merge so both devices converge
* Play Store prompt when a generic scanner reads a Valid Vault frame without the app installed

## [0.3.3] - 2026-08-08

### Added

* qrcode.js - vendored QR generator, MIT licensed, fully local with no network calls

  * Produces scannable QR codes from pairing and vault data
  * Self-contained ES module, no runtime dependencies
* frames.js - frame batching so any vault size can move as scannable QR codes

  * splitIntoFrames() breaks a payload into numbered frames tagged with index and total
  * createFrameCollector() reassembles frames, handling out-of-order arrival and duplicates
  * Rejects incomplete frame sets so a partial scan cannot produce a corrupt vault
* extension/manage.js - animated frame display in the Sync tab

  * Small payloads show a single static QR
  * Large payloads cycle through numbered frames automatically for the scanning device
* extension Sync tab with Start Sync, QR display, comparison code entry, and PIN confirmation

### Changed

* Sync tab content is isolated to the Sync tab and no longer bleeds into other settings tabs
* package.json version aligned to 0.3.3

### Notes

* Frame batching validated in Node: a 50-credential vault splits into 17 frames and reassembles exactly, in order, out of order, and with duplicate frames present.
* The transport stays fully local. QR frames carry data device to device with no network, no cloud, and no account.
* QR display works on both the app and the extension. Each device reads the other's credentials, then writes its own identical merged vault locally rather than receiving a finished file.

### In Progress

* Webcam QR scanning in the browser so it can read frames back from the phone
* QR frame display on the phone so it can show its credentials to the browser
* Send-only fallback for devices without a camera

## [0.3.2] - 2026-08-07

### Added

* passwords.js - mergeVaults() reconciles two vaults credential by credential

  * Match key is the decrypted username within a domain
  * Same username, newest updatedAt wins, the older password is discarded
  * Different usernames on the same domain coexist as separate logins
  * Domains present on only one device are preserved
* passwords.js - reEncryptVault() swaps a vault from one master key to another without altering contents
* pairing.js - receiveTransfer() now merges instead of overwriting

  * The vault with the oldest meta.createdAt supplies the shared master key
  * The other device re-encrypts its credentials under that shared key before merging
  * Merged vault keeps the oldest createdAt so the key rule stays stable across future syncs
* passwords.js - deleteCredential() writes a tombstone instead of removing the entry

  * Tombstone carries deleted, deletedAt, and updatedAt, and clears the encrypted secrets
  * A newer tombstone beats an older credential on merge and removes it from both devices
* extension/pairing.js - pairing logic ported into the extension so it can participate in sync

### Changed

* getCredentials() and getAllDomains() skip tombstones, so deleted entries stay invisible to the UI and autofill while remaining available to the merge
* saveCredential() replaces an existing credential for the same username rather than duplicating it
* Unlock methods (fingerprint, PIN, password) stay local to each device and never enter a transfer. Only stored website credentials sync.

### Notes

* Master key selection and credential contents are governed by two independent rules. Oldest createdAt decides the shared encryption key. Newest updatedAt decides which password is current. They never interact.
* The master key is not user facing. When a late sync introduces an older device, the shared key silently converges to that older key with no visible effect on stored logins.
* Devices converge. If every device eventually syncs with the group, all devices land on the same master key and the same credential set.
* Merge logic is identical across the app and the extension. Both projects share the same passwords.js and pairing.js.
* All merge behavior validated in Node against WebCrypto: oldest-key-wins, re-encryption under the shared key, newest password replacing the old, coexisting usernames, tombstone deletion, one-sided domain preservation, createdAt convergence.

### In Progress

* QR pairing UI on both the app and the extension so a user can start a sync
* Comparison code confirmation screen during pairing

## [0.3.1] - 2026-08-05

### Added

* extension/ — browser extension brought into the repo (settings page, autofill dropdown, toolbar popup, content script)
* extension/background.js — service worker answering credential requests so the autofill dropdown populates whether or not the popup is open
* Autofill dropdown renders on login fields and fills saved credentials for the current domain
* Session key bridged to the worker via chrome.storage.session — memory only, cleared on browser close

### Fixed

* Autofill dropdown showed an empty box when the popup was closed — the worker now serves credentials independently
* Extension carried the pre-0.3.0 crypto — now on the same secure core as the app (WebAuthn PRF, verify-by-unwrap, PBKDF2 600k)

### Changed

* Extension PIN, password, and fingerprint unlock rebuilt on the secure crypto core with no stored verification hashes
* Extension version aligned to 0.3.1

### In Progress

* Settings and options page access from the popup — actively being built
* Full autofill profile (name, address, email, phone) alongside credentials — actively being built
* Save credentials during signup rather than manual entry — actively being built

### Notes

* Autofill detection currently wires on fields present at page load — dynamic-form coverage is part of the in-progress autofill work
* App and extension now share one crypto and auth core

## [0.3.0](https://github.com/HiImRook/local-vault-password-manager/releases/tag/v0.3) - 2026-08-04

### Fixed

* auth.js - fingerprint wrapping key no longer derived from a hardcoded constant

  * Previous behavior: wrapping key derived from a public string plus a salt stored beside the ciphertext - the WebAuthn prompt was a UI gate only, its result never used
  * Any party with database access could unwrap the master key without touching the biometric
  * Fingerprint-wrapped keys are now bound to authenticator secret material via WebAuthn PRF
* crypto.js - stored PIN and password verification hashes removed entirely

  * Previous behavior: 4-round SHA-256 verification hashes stored beside the wrapped keys gave offline attackers a fast oracle, bypassing the full KDF cost
  * Wrong credentials now fail at the AES-GCM unwrap - every offline guess pays the full derivation cost
* pairing.js - generatePairingCode() modulo bias removed via rejection sampling
* store.js - clearAll() now awaits transaction completion - wipes commit before returning
* build.js - status indicator element IDs corrected to match markup - indicators were silently dead
* build.js - session status indicator wired to live session state

### Added

* crypto.js - deriveKeyFromPrfOutput() - HKDF-SHA256 derivation from WebAuthn PRF output to AES-GCM wrapping key
* crypto.js - PBKDF2_ITERATIONS raised to 600,000 - LEGACY_PBKDF2_ITERATIONS retained at 100,000 for migration unwraps
* auth.js - WebAuthn PRF enrollment flow

  * PRF extension requested at credential creation with a random 32-byte eval salt
  * PRF output taken at creation when the platform returns it there, otherwise via one assertion
  * Devices without PRF support are refused honestly - no fake biometric gate is ever presented
  * fingerprintCredentialId and fingerprintPrfSalt stored per enrollment
* auth.js - upgradeWrap() - silent rewrap migration on successful unlock

  * Legacy 100k-iteration wraps rewrapped at 600k with a fresh salt
  * Lingering legacy hash fields deleted during migration
* auth.js - authenticateLegacyFingerprint() - one-time migration unwrap for pre-0.3.0 fingerprint enrollments, deletes the insecure wrap, returns requiresReenroll
* auth.js - authenticateLegacyPIN() - one-time migration unlock for pre-0.3.0 PIN-wrapped vaults, purges persistent PIN fields, returns requiresAuthSetup when no other method exists
* auth.js - per-method kdfIterations field persisted with each wrap - future cost raises migrate the same way
* session.js - ephemeral session PIN system

  * setSessionPin() - encrypts the exported master key under a PIN-derived key with a fresh in-memory salt
  * softLockNow() - inactivity lock nulls the raw key, retains only the PIN-encrypted blob
  * resumeWithPin() - decrypts and restores the master key on correct PIN
  * Three failed resume attempts trigger a full hard wipe - vault requires password or fingerprint
  * isSoftLocked(), hasSessionPin(), clearSessionPin() state helpers

### Changed

* Credential verification is now unwrap-based - the AES-GCM auth tag is the verifier, nothing cheaper than the wrap exists in storage
* PIN demoted from persistent wrap method to ephemeral session resume

  * PIN never touches disk - it exists only in memory for the current session
  * Force-closing the app clears it by design - a fresh session requires the real credential
  * Cold-start unlock is password or fingerprint only
* Fresh salt generated on every credential set - salts are never reused across changes
* removeFingerprint() requires a password backup - PIN no longer counts as a recovery path
* removePassword() requires a fingerprint backup
* Session inactivity timeout soft-locks when a session PIN is set, hard-locks otherwise
* Rebranded Valid Vault to Local Vault - page title, header, WebAuthn RP name, boot log
* Header carries a two-line identity - Local Vault over Password Manager

### Removed

* FINGERPRINT_SECRET hardcoded constant - retained internally only for the legacy migration unwrap
* sha256Kdf(), hashPin(), hashPassword(), arraysEqual() from crypto.js
* setPIN(), authenticatePIN(), removePIN(), startPINCreation() from auth.js
* pinWrappedKey, pinSalt, pinHash, pinKdfIterations from persistent auth storage - purged on any successful unlock

### Security

* **CRITICAL:** Fingerprint path previously provided zero cryptographic protection - vault contents were recoverable from the database alone when fingerprint was enrolled
* **CRITICAL:** Stored verification hashes reduced offline attack cost from 100k PBKDF2 iterations per guess to 4 SHA-256 rounds per guess
* 4-6 digit PINs cannot survive offline attack at any iteration count - resolved structurally by removing PIN from persistent storage rather than by raising cost
* At rest, the database now contains only 600k-iteration password wraps and PRF-bound fingerprint wraps

### Notes

* Session PINs are ephemeral by design - nothing is stored, nothing can be extracted, nothing can be brute-forced offline
* PRF requires a WebAuthn authenticator with PRF extension support - Chrome on Android with a screen-lock credential qualifies, Capacitor WebView behavior requires on-device validation
* Master key round-trips through extractable raw bytes during enrollment of additional methods - unavoidable in pure WebCrypto without hardware keystore binding
* Domain names in vault storage remain plaintext object keys - vault blob encryption is the next scheduled schema change
* All crypto flows validated in Node against WebCrypto - wrap/unwrap round trips, wrong-secret rejection, legacy-to-current migration, PRF-derived wrapping, session PIN lifecycle including 3-attempt wipe

## [0.2.0-alpha](https://github.com/HiImRook/local-vault-password-manager/releases/tag/v0.2.0-alpha) - 2025-11-28

### Added

* Master key wrap architecture - one random 256-bit master key wrapped independently per unlock method
* Fingerprint, PIN, and password unlock paths
* Per-credential AES-GCM encryption of stored usernames and passwords
* ECDH device pairing over QR with numeric comparison code
* Encrypted vault transfer between paired devices with HMAC payload signature
* Session management with inactivity timeout
* IndexedDB persistence - auth, passwords, wallets stores
* Capacitor Android wrapper
* Single-file bundler (build.js) - modules assembled into test.html

### Notes

* Alpha status - key protection layer contains known weaknesses corrected in 0.3.0
* Earlier iterations were not formally tagged

---