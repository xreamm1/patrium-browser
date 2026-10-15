<p align="center">
  🇷🇺 <a href="README.md">Русский</a> | 🇬🇧 <b>English</b>
</p>

<p align="center">
  <a href="https://github.com/xreamm1/patrium-browser/releases/latest"><img src="https://img.shields.io/github/v/release/xreamm1/patrium-browser?style=for-the-badge&label=release&color=0A6CFF" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-windows%2010%20%7C%2011-0078D6?style=for-the-badge" alt="Windows 10 | 11">
  <img src="https://img.shields.io/badge/engine-gecko%20160-E66000?style=for-the-badge" alt="Gecko 160">
  <img src="https://img.shields.io/badge/adblock-rust-B7410E?style=for-the-badge" alt="Rust adblock">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xreamm1/patrium-browser?style=for-the-badge&color=4CAF50" alt="License"></a>
  <a href="https://github.com/xreamm1/patrium-browser/releases"><img src="https://img.shields.io/github/downloads/xreamm1/patrium-browser/total?style=for-the-badge&color=7C4DFF" alt="Downloads"></a>
  <a href="https://github.com/xreamm1/patrium-browser/stargazers"><img src="https://img.shields.io/github/stars/xreamm1/patrium-browser?style=for-the-badge&color=E3B341" alt="Stars"></a>
</p>

<p align="center">
  <img src="docs/icon.png" width="128" alt="Patrium">
</p>

<h1 align="center">Patrium</h1>

<p align="center">
  A fast, private Gecko (Firefox) browser for Windows<br>
  with a built-in ad blocker, a Tor VPN and zapret DPI bypass.
</p>

<p align="center">
  <a href="https://github.com/xreamm1/patrium-browser/releases/latest"><b>⬇️ Download the latest version</b></a>
</p>

---

## Features

### 🛡️ Native ad and tracker blocker
- Built into the browser in Rust (Brave's [adblock-rust](https://github.com/brave/adblock-rust) engine), **not an extension**.
- Lists: EasyList, EasyPrivacy, uBlock filters (main, privacy, badware, quick fixes) and **RuAdList** for Russian-language sites.
- Blocks ad and tracker requests and hides ad slots on pages.
- Per-page blocked counter on the button; blocking can be turned off for a single site.
- Lists update automatically every 4 days; the engine is built on a background thread.

### 🌐 Tor VPN
- A button next to Downloads. On first use Patrium downloads the Tor Expert Bundle from torproject.org (SHA-256 verified).
- **snowflake** (default), obfs4 and meek bridges, so it works where Tor is blocked.
- Only the browser's traffic goes through Tor; DNS goes through Tor; no WebRTC leaks.

### ⚡ Zapret (DPI bypass for YouTube, Discord and more)
- Uses [zapret-discord-youtube by Flowseal](https://github.com/Flowseal/zapret-discord-youtube), downloaded on first use (SHA-256 verified).
- Runs as the `PatriumZapret` Windows service: administrator rights are needed only to set the service up; after that the button starts and stops it without UAC prompts.
- Pick a strategy (general, ALT, FAKE TLS, ...) right in the button's panel.

### 🧠 Memory savings
- Tabs idle for 30 minutes are unloaded (pinned tabs and tabs playing audio or video are kept).
- Fewer processes and smaller caches. "Memory saver" mode in *Settings → Performance*.
- Measured on 8 sites: **1340 MB vs 1940 MB** with stock Firefox settings (−31%).

### 🔒 Private by default
- No telemetry, studies, Pocket or sponsored content.
- Strict tracking protection, Global Privacy Control, tracking parameters stripped from links, DNS over HTTPS.

### 🔄 Auto-update
- Once a day Patrium checks this repository's releases and offers to update (the installer is SHA-256 verified).

## Installation

1. Download `Patrium-Setup-<version>-en-x64.exe` (or `-ru-x64` for the Russian UI) from [Releases](https://github.com/xreamm1/patrium-browser/releases/latest).
2. Run it. The installer isn't code-signed, so Windows SmartScreen may warn you: *More info → Run anyway*.

Requirements: Windows 10/11 x64.

## Building from source

Patrium is a set of changes on top of Firefox. You need Windows 10/11, [MozillaBuild](https://wiki.mozilla.org/MozillaBuild), ~60 GB of disk space and 16 GB of RAM.

```powershell
git clone https://github.com/xreamm1/patrium-browser
git clone https://github.com/mozilla-firefox/firefox patrium-browser\src
cd patrium-browser\src
git checkout 5c124bc00a6d475d4ea42297cb60de9bf5884844
git apply ..\patches\patrium-tracked.patch
xcopy /E /Y ..\overlay\* .
cd ..
powershell -ExecutionPolicy Bypass -File tools\apply-branding.ps1
powershell -ExecutionPolicy Bypass -File tools\mach.ps1 bootstrap --application-choice browser
powershell -ExecutionPolicy Bypass -File tools\mach.ps1 vendor rust --ignore-modified
powershell -ExecutionPolicy Bypass -File tools\mach.ps1 build
powershell -ExecutionPolicy Bypass -File tools\mach.ps1 package
```

Russian build: clone the `ru` folder of [mozilla-l10n/firefox-l10n](https://github.com/mozilla-l10n/firefox-l10n) into `l10n\`, copy `l10n\ru\browser\browser\patrium.ftl` from this repository into it, and run `tools\mach.ps1 build installers-ru`.

Optimized release build (PGO + ThinLTO): in the MozillaBuild shell run `MOZCONFIG=mozconfig.release ./mach build`.

Note: `tools\mach.ps1` and `tools\apply-branding.ps1` expect the project in `C:\patrium`; adjust the paths if you clone elsewhere.

## Repository layout

| Path | Contents |
|---|---|
| `patches/patrium-tracked.patch` | Changes to existing Firefox files |
| `overlay/` | New Patrium files (components, Rust engine, strings, mozconfig) |
| `branding-src/privacy-prefs.js` | Patrium default preferences |
| `l10n/ru/` | Russian translation of the Patrium UI |
| `tools/` | Branding, icons, mach wrapper, Marionette smoke tests |

## License

[Mozilla Public License 2.0](LICENSE), like Firefox. Third-party components are listed in [NOTICE.md](NOTICE.md).

Patrium is not affiliated with the Mozilla Foundation. Firefox is a trademark of the Mozilla Foundation.
