/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PatriumAdblock: "moz-src:///browser/components/patrium/PatriumAdblock.sys.mjs",
});

export class PatriumAdblockParent extends JSWindowActorParent {
  receiveMessage({ name, data }) {
    if (!lazy.PatriumAdblock.isActiveFor(this.browsingContext)) {
      return null;
    }
    try {
      switch (name) {
        case "Cosmetic":
          return lazy.PatriumAdblock.cosmeticResources(data.url);
        case "Generic":
          return lazy.PatriumAdblock.hiddenSelectors(
            data.classes,
            data.ids,
            data.exceptions
          );
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }
}
