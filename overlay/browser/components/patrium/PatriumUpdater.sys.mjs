/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setInterval, setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  PatriumDownloader:
    "moz-src:///browser/components/patrium/PatriumDownloader.sys.mjs",
});

const PREF_REPO = "patrium.update.repo";
const PREF_VERSION = "patrium.version";
const PREF_LAST_CHECK = "patrium.update.lastCheck";
const PREF_SKIP = "patrium.update.skipVersion";
const PREF_ENABLED = "patrium.update.enabled";
const CHECK_INTERVAL_S = 24 * 60 * 60;
const FIRST_CHECK_DELAY_MS = 60 * 1000;
const NOTIFICATION_ID = "patrium-update";

/**
 * Compares dotted versions such as "1.2.10" (a leading "v" is ignored).
 * Returns a positive number if a > b.
 */
export function compareVersions(a, b) {
  const parse = v =>
    String(v)
      .replace(/^v/i, "")
      .split(/[.-]/)
      .map(p => parseInt(p, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) {
      return diff;
    }
  }
  return 0;
}

/**
 * Checks the Patrium GitHub repository for a newer release once a day and
 * offers to download and run its installer.
 */
export const PatriumUpdater = {
  _pending: null,

  get repo() {
    return Services.prefs.getStringPref(PREF_REPO, "").trim();
  },

  get currentVersion() {
    return Services.prefs.getStringPref(PREF_VERSION, "0");
  },

  async init() {
    setTimeout(() => this.maybeCheck(), FIRST_CHECK_DELAY_MS);
    setInterval(() => this.maybeCheck(), 60 * 60 * 1000);
  },

  async maybeCheck() {
    if (!Services.prefs.getBoolPref(PREF_ENABLED, true) || !this.repo) {
      return;
    }
    const last = Services.prefs.getIntPref(PREF_LAST_CHECK, 0);
    if (Date.now() / 1000 - last < CHECK_INTERVAL_S) {
      return;
    }
    await this.check().catch(e =>
      console.warn("Patrium: update check failed:", e)
    );
  },

  /**
   * @returns {Promise<object|null>} the release offered to the user, if any.
   */
  async check({ ignoreSkip = false } = {}) {
    if (!this.repo) {
      return null;
    }
    const release = await lazy.PatriumDownloader.fetchJSON(
      `https://api.github.com/repos/${this.repo}/releases/latest`
    );
    Services.prefs.setIntPref(PREF_LAST_CHECK, Math.floor(Date.now() / 1000));
    const version = release.tag_name.replace(/^v/i, "");
    if (compareVersions(version, this.currentVersion) <= 0) {
      return null;
    }
    if (!ignoreSkip && Services.prefs.getStringPref(PREF_SKIP, "") == version) {
      return null;
    }
    const installers = release.assets.filter(
      a => /\.exe$/i.test(a.name) && a.digest?.startsWith("sha256:")
    );
    const isOtherArch = a => /arm64|aarch64|x86(?!_64)|win32|i686/i.test(a.name);
    const candidates = installers.filter(a => !isOtherArch(a));
    // Release assets are named like Patrium-Setup-1.2.3-ru-x64.exe.
    const lang = Services.locale.appLocaleAsBCP47.split("-")[0].toLowerCase();
    const forLang = l => candidates.find(a => new RegExp(`[-_.]${l}[-_.]`, "i").test(a.name));
    const asset = forLang(lang) ?? forLang("en") ?? candidates[0];
    if (!asset) {
      console.warn(`Patrium: release ${version} has no verifiable installer`);
      return null;
    }
    this._pending = { version, asset, url: release.html_url };
    this.notifyAllWindows();
    return this._pending;
  },

  notifyAllWindows() {
    for (const win of lazy.BrowserWindowTracker.orderedWindows) {
      this.showNotification(win);
    }
  },

  async showNotification(win) {
    const pending = this._pending;
    const box = win.gNotificationBox;
    if (!pending || !box || box.getNotificationWithValue(NOTIFICATION_ID)) {
      return;
    }
    const doc = win.document;
    const [label, update, whatsNew, later, skip] =
      await doc.l10n.formatValues([
        { id: "patrium-update-available", args: { version: pending.version } },
        "patrium-update-install",
        "patrium-update-whats-new",
        "patrium-update-later",
        "patrium-update-skip",
      ]);
    await box.appendNotification(
      NOTIFICATION_ID,
      { label, priority: box.PRIORITY_INFO_HIGH },
      [
        {
          label: update,
          callback: () => {
            this.downloadAndRun(win);
            return false;
          },
        },
        {
          label: whatsNew,
          callback: () => {
            win.openTrustedLinkIn(pending.url, "tab");
            return true;
          },
        },
        { label: later, callback: () => false },
        {
          label: skip,
          callback: () => {
            Services.prefs.setStringPref(PREF_SKIP, pending.version);
            return false;
          },
        },
      ]
    );
  },

  async downloadAndRun(win) {
    const { asset } = this._pending;
    const box = win.gNotificationBox;
    box.getNotificationWithValue(NOTIFICATION_ID)?.close();
    const [downloading] = await win.document.l10n.formatValues([
      "patrium-update-downloading",
    ]);
    const progress = await box.appendNotification("patrium-update-progress", {
      label: downloading,
      priority: box.PRIORITY_INFO_MEDIUM,
    });
    try {
      const path = PathUtils.join(
        PathUtils.tempDir,
        "patrium-update",
        asset.name
      );
      await lazy.PatriumDownloader.downloadVerified(
        asset.browser_download_url,
        path,
        asset.digest.slice("sha256:".length)
      );
      progress?.close();
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(path);
      file.launch();
      // The installer asks to close Patrium; quitting first saves the session.
      Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
    } catch (e) {
      progress?.close();
      console.error("Patrium: update download failed", e);
      const [failed] = await win.document.l10n.formatValues([
        { id: "patrium-update-failed", args: { error: e.message } },
      ]);
      box.appendNotification("patrium-update-error", {
        label: failed,
        priority: box.PRIORITY_WARNING_MEDIUM,
      });
    }
  },
};
