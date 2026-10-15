/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  clearInterval,
  setInterval,
  setTimeout,
} from "resource://gre/modules/Timer.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  TabStateFlusher: "resource:///modules/sessionstore/TabStateFlusher.sys.mjs",
  webrtcUI: "resource:///modules/webrtcUI.sys.mjs",
});

const PREF_TAB_UNLOAD = "patrium.memory.tabUnload.enabled";
const PREF_TAB_UNLOAD_MINUTES = "patrium.memory.tabUnloadMinutes";
const PREF_SAVER = "patrium.memory.saver";
const PREF_SAVER_SAVED = "patrium.memory.saverSaved";
const CHECK_INTERVAL_MS = 60 * 1000;

// Applied while memory saver mode is on; the previous values are saved in
// PREF_SAVER_SAVED so the user's own settings are restored when it is off.
const SAVER_PREFS = {
  "fission.autostart": false,
  "dom.ipc.processCount": 4,
};

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "tabUnloadEnabled",
  PREF_TAB_UNLOAD,
  true,
  () => PatriumMemory.updateTimer()
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "tabUnloadMinutes",
  PREF_TAB_UNLOAD_MINUTES,
  30
);

/**
 * Keeps memory use down: unloads background tabs that have not been used for
 * a while, and toggles the shared-process "memory saver" mode.
 */
export const PatriumMemory = {
  _timer: null,
  _unloading: false,

  async init() {
    this.applySaver();
    Services.prefs.addObserver(PREF_SAVER, () => this.applySaver());
    this.updateTimer();
  },

  getPref(name) {
    switch (Services.prefs.getPrefType(name)) {
      case Services.prefs.PREF_INT:
        return Services.prefs.getIntPref(name);
      case Services.prefs.PREF_BOOL:
        return Services.prefs.getBoolPref(name);
      default:
        return Services.prefs.getStringPref(name, "");
    }
  },

  setPref(name, value) {
    if (typeof value == "number") {
      Services.prefs.setIntPref(name, value);
    } else if (typeof value == "boolean") {
      Services.prefs.setBoolPref(name, value);
    } else {
      Services.prefs.setStringPref(name, value);
    }
  },

  // Idempotent: applies saver prefs when turned on (saving the user's prior
  // values first) and restores exactly those values when turned off, so manual
  // process/fission settings are never clobbered on restart.
  applySaver() {
    const on = Services.prefs.getBoolPref(PREF_SAVER, false);
    const applied = Services.prefs.prefHasUserValue(PREF_SAVER_SAVED);
    if (on && !applied) {
      const saved = {};
      for (const name of Object.keys(SAVER_PREFS)) {
        saved[name] = Services.prefs.prefHasUserValue(name)
          ? this.getPref(name)
          : null;
      }
      Services.prefs.setStringPref(PREF_SAVER_SAVED, JSON.stringify(saved));
      for (const [name, value] of Object.entries(SAVER_PREFS)) {
        this.setPref(name, value);
      }
    } else if (!on && applied) {
      let saved = {};
      try {
        saved = JSON.parse(Services.prefs.getStringPref(PREF_SAVER_SAVED));
      } catch (e) {
        console.error(e);
      }
      for (const name of Object.keys(SAVER_PREFS)) {
        if (saved[name] === null || saved[name] === undefined) {
          Services.prefs.clearUserPref(name);
        } else {
          this.setPref(name, saved[name]);
        }
      }
      Services.prefs.clearUserPref(PREF_SAVER_SAVED);
    }
  },

  updateTimer() {
    if (lazy.tabUnloadEnabled && !this._timer) {
      this._timer = setInterval(
        () => this.unloadInactiveTabs(),
        CHECK_INTERVAL_MS
      );
    } else if (!lazy.tabUnloadEnabled && this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  hasActiveWebRTC(browser) {
    try {
      return (
        lazy.webrtcUI.browserHasStreams(browser) ||
        !!browser.browsingContext?.currentWindowGlobal?.hasActivePeerConnections()
      );
    } catch {
      return false;
    }
  },

  isUnloadable(tab, cutoff) {
    const browser = tab.linkedBrowser;
    return (
      !tab.selected &&
      !tab.pinned &&
      !tab.undiscardable &&
      !tab.soundPlaying &&
      !tab.pictureinpicture &&
      !tab.hasAttribute("pending") &&
      tab.linkedPanel &&
      browser &&
      !lazy.PrivateBrowsingUtils.isBrowserPrivate(browser) &&
      !this.hasActiveWebRTC(browser) &&
      tab.lastAccessed > 0 &&
      tab.lastAccessed < cutoff
    );
  },

  async unloadInactiveTabs() {
    if (this._unloading) {
      return;
    }
    this._unloading = true;
    try {
      const cutoff = Date.now() - lazy.tabUnloadMinutes * 60 * 1000;
      for (const win of lazy.BrowserWindowTracker.orderedWindows) {
        const { gBrowser } = win;
        if (!gBrowser || win.closed) {
          continue;
        }
        for (const tab of gBrowser.tabs) {
          if (!this.isUnloadable(tab, cutoff)) {
            continue;
          }
          try {
            // Persist the latest form data etc. before discarding, so nothing
            // typed into the page is lost when it reloads.
            // Don't let a hung content process wedge unloading forever.
            await Promise.race([
              lazy.TabStateFlusher.flush(tab.linkedBrowser),
              new Promise(resolve => setTimeout(resolve, 3000)),
            ]);
            if (this.isUnloadable(tab, cutoff)) {
              gBrowser.discardBrowser(tab);
            }
          } catch (e) {
            console.error("Patrium: failed to unload tab", e);
          }
        }
      }
    } finally {
      this._unloading = false;
    }
  },
};
