# Third-party components

Patrium is based on **Mozilla Firefox** (https://github.com/mozilla-firefox/firefox),
licensed under the Mozilla Public License 2.0, with third-party code under the
licenses listed in `about:license` of the built browser.
Patrium is not affiliated with or endorsed by the Mozilla Foundation.
"Firefox" is a trademark of the Mozilla Foundation and is not used as
Patrium's name or logo.

Bundled in the browser:

| Component | License | Use |
|---|---|---|
| [adblock-rust](https://github.com/brave/adblock-rust) 0.13.3 (Brave Software) | MPL-2.0 | Native content blocking engine |
| addr, psl, psl-types (Rust crates) | MIT / Apache-2.0 | Public suffix handling for adblock-rust |

Downloaded on demand at runtime (not bundled, each user downloads from the
official source after confirming):

| Component | License | Source |
|---|---|---|
| Tor Expert Bundle (The Tor Project) | BSD-3-Clause and others | https://www.torproject.org |
| zapret-discord-youtube (Flowseal), based on zapret by bol-van | see upstream | https://github.com/Flowseal/zapret-discord-youtube |
| EasyList, EasyPrivacy, RuAdList | CC BY-SA 3.0 / GPLv3 (dual) | https://easylist.to |
| uBlock Origin filter lists (uAssets) | GPLv3 | https://github.com/uBlockOrigin/uAssets |
