/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PatriumAdblock: "moz-src:///browser/components/patrium/PatriumAdblock.sys.mjs",
  PatriumMemory: "moz-src:///browser/components/patrium/PatriumMemory.sys.mjs",
  PatriumTor: "moz-src:///browser/components/patrium/PatriumTor.sys.mjs",
  PatriumUI: "moz-src:///browser/components/patrium/PatriumUI.sys.mjs",
  PatriumUpdater: "moz-src:///browser/components/patrium/PatriumUpdater.sys.mjs",
  PatriumZapret: "moz-src:///browser/components/patrium/PatriumZapret.sys.mjs",
});

const PREF_FIRST_RUN_DONE = "patrium.firstRunDone";

export const PatriumGlue = {
  init() {
    if (!Services.prefs.getBoolPref(PREF_FIRST_RUN_DONE, false)) {
      // ContentBlockingPrefs only applies a category stored as a user value.
      Services.prefs.setStringPref("browser.contentblocking.category", "strict");
      Services.prefs.setBoolPref(PREF_FIRST_RUN_DONE, true);
    }
    lazy.PatriumUI.init();
    for (const service of [
      lazy.PatriumAdblock,
      lazy.PatriumMemory,
      lazy.PatriumTor,
      lazy.PatriumUpdater,
      lazy.PatriumZapret,
    ]) {
      service.init().catch(e => console.error("Patrium init failed:", e));
    }
  },
};
