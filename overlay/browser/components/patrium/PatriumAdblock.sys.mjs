/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

// AbortSignal.timeout is not available in the system-module global; build the
// equivalent from AbortController (which is).
function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  controller.signal.addEventListener("abort", () => clearTimeout(timer), {
    once: true,
  });
  return controller.signal;
}

const lazy = {};

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "engine",
  "@patrium/adblock;1",
  Ci.nsIPatriumAdblock
);

const FILTER_LISTS = [
  { id: "easylist", url: "https://easylist.to/easylist/easylist.txt" },
  { id: "easyprivacy", url: "https://easylist.to/easylist/easyprivacy.txt" },
  {
    id: "ublock-filters",
    url: "https://ublockorigin.github.io/uAssets/filters/filters.txt",
  },
  {
    id: "ublock-privacy",
    url: "https://ublockorigin.github.io/uAssets/filters/privacy.txt",
  },
  {
    id: "ublock-badware",
    url: "https://ublockorigin.github.io/uAssets/filters/badware.txt",
  },
  {
    id: "ublock-quick-fixes",
    url: "https://ublockorigin.github.io/uAssets/filters/quick-fixes.txt",
  },
  {
    id: "ruadlist",
    url: "https://easylist-downloads.adblockplus.org/ruadlist.txt",
  },
];

const PREF_ENABLED = "patrium.adblock.enabled";
const PREF_ALLOWLIST = "patrium.adblock.allowlist";
const PREF_LAST_UPDATE = "patrium.adblock.lastUpdate";
const UPDATE_INTERVAL_S = 4 * 24 * 60 * 60;
const FIRST_UPDATE_DELAY_MS = 30 * 1000;

const REQUEST_TYPES = new Map([
  [Ci.nsIContentPolicy.TYPE_DOCUMENT, "document"],
  [Ci.nsIContentPolicy.TYPE_SCRIPT, "script"],
  [Ci.nsIContentPolicy.TYPE_IMAGE, "image"],
  [Ci.nsIContentPolicy.TYPE_IMAGESET, "image"],
  [Ci.nsIContentPolicy.TYPE_STYLESHEET, "stylesheet"],
  [Ci.nsIContentPolicy.TYPE_OBJECT, "object"],
  [Ci.nsIContentPolicy.TYPE_SUBDOCUMENT, "sub_frame"],
  [Ci.nsIContentPolicy.TYPE_XMLHTTPREQUEST, "xmlhttprequest"],
  [Ci.nsIContentPolicy.TYPE_FETCH, "xmlhttprequest"],
  [Ci.nsIContentPolicy.TYPE_MEDIA, "media"],
  [Ci.nsIContentPolicy.TYPE_FONT, "font"],
  [Ci.nsIContentPolicy.TYPE_WEBSOCKET, "websocket"],
  [Ci.nsIContentPolicy.TYPE_PING, "ping"],
  [Ci.nsIContentPolicy.TYPE_BEACON, "ping"],
  [Ci.nsIContentPolicy.TYPE_CSP_REPORT, "csp_report"],
]);

XPCOMUtils.defineLazyPreferenceGetter(lazy, "enabled", PREF_ENABLED, true);

/**
 * Native network and cosmetic blocking backed by adblock-rust
 * (nsIPatriumAdblock). Network requests are checked in the parent process;
 * element hiding is done by the PatriumAdblock window actor.
 */
class PatriumAdblockClass {
  #listeners = new Set();
  #blockedCounts = new WeakMap();
  #updating = null;
  #ready = false;
  #allowlist = null; // Lazily built Set, invalidated on change.

  get dataDir() {
    return PathUtils.join(PathUtils.localProfileDir, "patrium-adblock");
  }

  get enginePath() {
    return PathUtils.join(this.dataDir, "engine.dat");
  }

  get enabled() {
    return lazy.enabled;
  }

  get lastUpdate() {
    return Services.prefs.getIntPref(PREF_LAST_UPDATE, 0);
  }

  // Cached so the http-on-modify-request hot path avoids an XPCOM call per
  // request; refreshed whenever the engine is (re)built or loaded.
  get ready() {
    return this.#ready;
  }

  #refreshReady() {
    try {
      this.#ready = lazy.engine.ready;
    } catch {
      this.#ready = false;
    }
    return this.#ready;
  }

  addListener(fn) {
    this.#listeners.add(fn);
  }

  removeListener(fn) {
    this.#listeners.delete(fn);
  }

  #notify(browser = null) {
    for (const fn of this.#listeners) {
      try {
        fn(browser);
      } catch (e) {
        console.error(e);
      }
    }
  }

  async init() {
    Services.obs.addObserver(this, "http-on-modify-request");
    ChromeUtils.registerWindowActor("PatriumAdblock", {
      parent: {
        esModuleURI:
          "moz-src:///browser/components/patrium/PatriumAdblockParent.sys.mjs",
      },
      child: {
        esModuleURI:
          "moz-src:///browser/components/patrium/PatriumAdblockChild.sys.mjs",
        events: {
          DOMDocElementInserted: { capture: true },
          DOMContentLoaded: {},
        },
      },
      allFrames: true,
      matches: ["http://*/*", "https://*/*"],
    });

    try {
      if (await IOUtils.exists(this.enginePath)) {
        await this.#call(cb => lazy.engine.load(this.enginePath, cb));
      } else {
        await this.#buildFromCache();
      }
    } catch (e) {
      console.warn("Patrium: rebuilding adblock engine:", e);
      await this.#buildFromCache().catch(console.error);
    }
    this.#refreshReady();
    Services.prefs.addObserver(PREF_ALLOWLIST, () => {
      this.#allowlist = null;
    });
    this.#notify();

    const age = Date.now() / 1000 - this.lastUpdate;
    if (!this.ready || age > UPDATE_INTERVAL_S) {
      setTimeout(
        () => this.update().catch(console.error),
        this.ready ? FIRST_UPDATE_DELAY_MS : 0
      );
    }
  }

  #call(fn) {
    return new Promise((resolve, reject) => {
      fn((status, error) => {
        if (Components.isSuccessCode(status)) {
          resolve();
        } else {
          reject(new Error(error || `adblock error ${status}`));
        }
      });
    });
  }

  async #buildFromCache() {
    const paths = FILTER_LISTS.map(({ id }) =>
      PathUtils.join(this.dataDir, "lists", `${id}.txt`)
    );
    if (!(await Promise.all(paths.map(p => IOUtils.exists(p)))).some(Boolean)) {
      return;
    }
    await IOUtils.makeDirectory(this.dataDir);
    await this.#call(cb => lazy.engine.build(paths, this.enginePath, cb));
    this.#refreshReady();
  }

  /**
   * Downloads all filter lists and rebuilds the engine. Lists that fail to
   * download fall back to their cached copy.
   */
  update() {
    if (!this.#updating) {
      this.#updating = this.#doUpdate().finally(() => {
        this.#updating = null;
        this.#notify();
      });
      this.#notify();
    }
    return this.#updating;
  }

  get updating() {
    return !!this.#updating;
  }

  async #doUpdate() {
    const listsDir = PathUtils.join(this.dataDir, "lists");
    await IOUtils.makeDirectory(listsDir);
    let fetched = 0;
    await Promise.all(
      FILTER_LISTS.map(async ({ id, url }) => {
        try {
          const response = await fetch(url, {
            cache: "no-store",
            signal: timeoutSignal(60000),
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const text = await response.text();
          if (!text.includes("!") || text.length < 1000) {
            throw new Error("does not look like a filter list");
          }
          await IOUtils.writeUTF8(PathUtils.join(listsDir, `${id}.txt`), text);
          fetched++;
        } catch (e) {
          console.warn(`Patrium: failed to update filter list ${id}:`, e);
        }
      })
    );
    await this.#buildFromCache();
    if (fetched) {
      Services.prefs.setIntPref(
        PREF_LAST_UPDATE,
        Math.floor(Date.now() / 1000)
      );
    }
  }

  #allowlistSet() {
    if (!this.#allowlist) {
      this.#allowlist = new Set(
        Services.prefs
          .getStringPref(PREF_ALLOWLIST, "")
          .split(",")
          .filter(Boolean)
      );
    }
    return this.#allowlist;
  }

  isAllowlisted(host) {
    if (!host) {
      return false;
    }
    const set = this.#allowlistSet();
    if (!set.size) {
      return false;
    }
    if (set.has(host)) {
      return true;
    }
    // Walk parent domains: a.b.example.com -> b.example.com -> example.com.
    let dot = host.indexOf(".");
    while (dot != -1) {
      if (set.has(host.slice(dot + 1))) {
        return true;
      }
      dot = host.indexOf(".", dot + 1);
    }
    return false;
  }

  setAllowlisted(host, allowed) {
    const set = new Set(
      Services.prefs.getStringPref(PREF_ALLOWLIST, "").split(",").filter(Boolean)
    );
    if (allowed) {
      set.add(host);
    } else {
      set.delete(host);
    }
    Services.prefs.setStringPref(PREF_ALLOWLIST, [...set].join(","));
    this.#notify();
  }

  topHostFor(browsingContext) {
    try {
      return browsingContext?.top?.currentURI?.host ?? "";
    } catch {
      return "";
    }
  }

  isActiveFor(browsingContext) {
    return (
      this.enabled &&
      this.ready &&
      !this.isAllowlisted(this.topHostFor(browsingContext))
    );
  }

  getBlockedCount(browser) {
    return this.#blockedCounts.get(browser) ?? 0;
  }

  resetBlockedCount(browser) {
    if (this.#blockedCounts.has(browser)) {
      this.#blockedCounts.delete(browser);
      this.#notify(browser);
    }
  }

  observe(subject, topic) {
    if (topic != "http-on-modify-request" || !this.#ready || !lazy.enabled) {
      return;
    }
    const channel = subject.QueryInterface(Ci.nsIHttpChannel);
    const { loadInfo } = channel;
    const type = REQUEST_TYPES.get(loadInfo.externalContentPolicyType);
    if (!type) {
      return;
    }

    const isDocument = type == "document";
    // For a navigation the "source" is the page that triggered it; for a
    // sub-resource it is the top document.
    const originPrincipal = isDocument
      ? loadInfo.triggeringPrincipal
      : loadInfo.loadingPrincipal ?? loadInfo.triggeringPrincipal;
    if (
      !originPrincipal ||
      originPrincipal.isSystemPrincipal ||
      originPrincipal.addonId || // Never block a WebExtension's own requests.
      originPrincipal.schemeIs?.("moz-extension")
    ) {
      return;
    }

    const browsingContext = loadInfo.browsingContext;
    const host = isDocument
      ? channel.URI.host
      : this.topHostFor(browsingContext);
    if (this.isAllowlisted(host)) {
      return;
    }

    let blocked = false;
    try {
      blocked = lazy.engine.shouldBlock(
        channel.URI.spec,
        originPrincipal.spec || channel.URI.spec,
        type,
        channel.requestMethod || "GET"
      );
    } catch (e) {
      console.error(e);
    }
    if (!blocked) {
      return;
    }
    channel.cancel(Cr.NS_ERROR_CONTENT_BLOCKED);

    const browser = browsingContext?.top?.embedderElement;
    if (browser && !isDocument) {
      this.#blockedCounts.set(browser, this.getBlockedCount(browser) + 1);
      this.#notify(browser);
    }
  }

  cosmeticResources(url) {
    return JSON.parse(lazy.engine.cosmeticResources(url));
  }

  hiddenSelectors(classes, ids, exceptions) {
    return lazy.engine.hiddenSelectors(classes, ids, exceptions);
  }
}

export const PatriumAdblock = new PatriumAdblockClass();
