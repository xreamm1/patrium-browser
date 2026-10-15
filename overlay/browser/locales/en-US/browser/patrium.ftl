# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Patrium: zapret toolbar button and panel

patrium-zapret-button =
    .label = Zapret
    .tooltiptext = Zapret (DPI bypass)
patrium-zapret-panel-header =
    .title = Zapret
patrium-zapret-status-missing = Not installed
patrium-zapret-status-installing = Downloading…
patrium-zapret-status-off = Off
patrium-zapret-status-starting = Starting…
patrium-zapret-status-on = On
patrium-zapret-status-stopping = Stopping…
patrium-zapret-status-error = Error
patrium-zapret-status-external = Another zapret is running
patrium-zapret-install-button =
    .label = Download zapret
patrium-zapret-turn-on-button =
    .label = Turn on
patrium-zapret-turn-off-button =
    .label = Turn off
patrium-zapret-update-button =
    .label = Check for updates
patrium-zapret-strategy-label = Strategy
patrium-zapret-version = Version { $version }
patrium-zapret-admin-note = Zapret runs as the Windows service PatriumZapret and works for the whole system. Administrator rights are requested only when the service is set up or its strategy changes.
patrium-zapret-install-confirm-title = Download zapret?
patrium-zapret-install-confirm-text = Patrium will download the latest release of zapret-discord-youtube by Flowseal from GitHub (about 1.5 MB) and verify its checksum. Zapret uses the WinDivert driver; some antivirus programs flag it.

## Patrium: Tor toolbar button and panel

patrium-tor-button =
    .label = Tor
    .tooltiptext = VPN (Tor)
patrium-tor-panel-header =
    .title = VPN (Tor)
patrium-tor-status-missing = Not installed
patrium-tor-status-installing = Downloading…
patrium-tor-status-off = Off
patrium-tor-status-starting = Connecting… { $progress }%
patrium-tor-status-on = Connected
patrium-tor-status-error = Error
patrium-tor-install-button =
    .label = Download Tor
patrium-tor-turn-on-button =
    .label = Connect
patrium-tor-turn-off-button =
    .label = Disconnect
patrium-tor-bridges-label = Bridges
patrium-tor-bridges-snowflake =
    .label = Snowflake
patrium-tor-bridges-obfs4 =
    .label = obfs4
patrium-tor-bridges-meek =
    .label = meek
patrium-tor-bridges-none =
    .label = None (direct)
patrium-tor-version = Tor Expert Bundle { $version }
patrium-tor-note = Only Patrium's traffic goes through Tor. Bridges help where Tor is blocked.
patrium-tor-install-confirm-title = Download Tor?
patrium-tor-install-confirm-text = Patrium will download the Tor Expert Bundle from torproject.org (about 20 MB) and verify its checksum.

## Patrium: native content blocker

patrium-adblock-button =
    .label = Blocker
    .tooltiptext = Ad and tracker blocker
patrium-adblock-panel-header =
    .title = Ad and tracker blocker
patrium-adblock-blocked-count =
    { $count ->
        [one] { $count } request blocked on this page
       *[other] { $count } requests blocked on this page
    }
patrium-adblock-site-enabled =
    .label = Blocking on this site
patrium-adblock-update-button =
    .label = Update filter lists
patrium-adblock-lists-updated = Filter lists updated { DATETIME($date, dateStyle: "short", timeStyle: "short") }
patrium-adblock-lists-never = Filter lists not downloaded yet

## Patrium: memory settings in about:preferences

patrium-memory-tab-unload =
    .label = Unload inactive tabs to save memory
    .description = Tabs you haven't used for a while are unloaded and reload when you return to them, keeping anything you typed. Pinned tabs, tabs playing audio or video, and active calls stay loaded.
patrium-memory-saver =
    .label = Memory saver mode
    .description = Shares processes between sites instead of isolating each site. Uses noticeably less memory but weakens protection against Spectre-type attacks. Takes effect after a restart.

## Patrium: Tor and zapret running together

patrium-conflict-title = Use Tor and zapret together?
patrium-conflict-tor-text = Zapret is on. It changes network packets for the whole system and may interfere with Tor's connection to bridges. Patrium's own traffic doesn't need zapret while Tor is on.
patrium-conflict-zapret-text = Tor is on. Zapret changes network packets for the whole system and may interfere with Tor's connection to bridges.

## Patrium: browser updates

patrium-update-available = Patrium { $version } is available.
patrium-update-install = Update
patrium-update-whats-new = What's new
patrium-update-later = Later
patrium-update-skip = Skip this version
patrium-update-downloading = Downloading the Patrium update…
patrium-update-failed = Couldn't download the update: { $error }
## Patrium: quick history clear

patrium-history-button =
    .label = History cleaner
    .tooltiptext = Quick-clear chosen sites from history
patrium-history-panel-header =
    .title = Quick-clear history
patrium-history-note = Tick the sites you want to be able to wipe, then clear them from your history any time with one button.
patrium-history-empty = Your history is empty.
patrium-history-clear-button =
    .label = Clear ticked sites from history
patrium-history-confirm-title = Clear history?
patrium-history-confirm-text = Remove all history for { $count } selected site(s), including subdomains?
