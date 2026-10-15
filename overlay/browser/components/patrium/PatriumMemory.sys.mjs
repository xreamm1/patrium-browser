/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { clearInterval, setInterval } from "resource://gre/modules/Timer.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
});

const PREF_TAB_UNLOAD = "patrium.memory.tabUnload.enabled";
const PREF_TAB_UNLOAD_MINUTES = "patrium.memory.tabUnloadMinutes";
const PREF_SAVER = "patrium.memory.saver";
const CHECK_INTERVAL_MS = 60 * 1000;

// Applied while memory saver mode is on; cleared when it is turned off.
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

  async init() {
    this.applySaver();
    Services.prefs.addObserver(PREF_SAVER, () => this.applySaver());
    this.updateTimer();
  },

  applySaver() {
    const on = Services.prefs.getBoolPref(PREF_SAVER, false);
    for (const [name, value] of Object.entries(SAVER_PREFS)) {
      if (!on) {
        Services.prefs.clearUserPref(name);
      } else if (typeof value == "boolean") {
        Services.prefs.setBoolPref(name, value);
      } else {
        Services.prefs.setIntPref(name, value);
      }
    }
  },

  updateTimer() {
    if (lazy.tabUnloadEnabled && !this._timer) {
      this._timer = setInterval(() => this.unloadInactiveTabs(), CHECK_INTERVAL_MS);
    } else if (!lazy.tabUnloadEnabled && this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  isUnloadable(tab, cutoff) {
    return (
      !tab.selected &&
      !tab.pinned &&
      !tab.soundPlaying &&
      !tab.pictureinpicture &&
      !tab.hasAttribute("pending") &&
      !tab._sharingState?.webRTC?.sharing &&
      tab.linkedPanel &&
      tab.lastAccessed > 0 &&
      tab.lastAccessed < cutoff
    );
  },

  unloadInactiveTabs() {
    const cutoff = Date.now() - lazy.tabUnloadMinutes * 60 * 1000;
    for (const win of lazy.BrowserWindowTracker.orderedWindows) {
      const { gBrowser } = win;
      if (!gBrowser || win.closed) {
        continue;
      }
      for (const tab of gBrowser.tabs) {
        if (this.isUnloadable(tab, cutoff)) {
          try {
            gBrowser.discardBrowser(tab);
          } catch (e) {
            console.error("Patrium: failed to unload tab", e);
          }
        }
      }
    }
  },
};
