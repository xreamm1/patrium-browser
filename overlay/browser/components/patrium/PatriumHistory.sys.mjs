/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

const PREF_HOSTS = "patrium.history.quickClearHosts";
const WIDGET_ID = "patrium-history-button";
const VIEW_ID = "patrium-history-panel";
const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const HTML_NS = "http://www.w3.org/1999/xhtml";

/**
 * "Quick clear" list: the user marks sites they want to be able to wipe from
 * history with a single click. The list is stored as a JSON array of hosts.
 */
export const PatriumHistory = {
  get savedHosts() {
    try {
      const value = JSON.parse(
        Services.prefs.getStringPref(PREF_HOSTS, "[]")
      );
      return Array.isArray(value) ? value.filter(h => typeof h == "string") : [];
    } catch {
      return [];
    }
  },

  set savedHosts(hosts) {
    const unique = [...new Set(hosts.map(h => h.toLowerCase()).filter(Boolean))];
    Services.prefs.setStringPref(PREF_HOSTS, JSON.stringify(unique));
  },

  isSaved(host) {
    return this.savedHosts.includes(host.toLowerCase());
  },

  setSaved(host, saved) {
    host = host.toLowerCase();
    const set = new Set(this.savedHosts);
    if (saved) {
      set.add(host);
    } else {
      set.delete(host);
    }
    this.savedHosts = [...set];
  },

  /**
   * Returns the most-visited hosts from history (by frecency), merged with any
   * already-saved hosts so the saved ones are always shown and checkable.
   */
  async topHosts(limit = 40) {
    const hosts = [];
    try {
      const db = await lazy.PlacesUtils.promiseDBConnection();
      const rows = await db.executeCached(
        `SELECT host FROM moz_origins
         WHERE host <> '' AND host NOT LIKE 'moz-%'
         ORDER BY frecency DESC LIMIT :limit`,
        { limit }
      );
      for (const row of rows) {
        const host = row.getResultByName("host").replace(/^www\./, "");
        if (host && !hosts.includes(host)) {
          hosts.push(host);
        }
      }
    } catch (e) {
      console.error("Patrium: failed to read top hosts", e);
    }
    for (const saved of this.savedHosts) {
      if (!hosts.includes(saved)) {
        hosts.push(saved);
      }
    }
    return hosts;
  },

  /**
   * Removes all history entries for the saved hosts (and their subdomains).
   * @returns {Promise<number>} the number of hosts cleared.
   */
  async clearSaved() {
    const hosts = this.savedHosts;
    for (const host of hosts) {
      try {
        // A leading "." matches the host and all of its subdomains.
        await lazy.PlacesUtils.history.removeByFilter({ host: "." + host });
      } catch (e) {
        console.error(`Patrium: failed to clear history for ${host}`, e);
      }
    }
    return hosts.length;
  },

  init() {
    lazy.CustomizableUI.createWidget({
      id: WIDGET_ID,
      l10nId: WIDGET_ID,
      type: "view",
      viewId: VIEW_ID,
      defaultArea: lazy.CustomizableUI.AREA_NAVBAR,
      onBeforeCreated: doc => {
        this._ensureView(doc);
        return true;
      },
      onViewShowing: event =>
        event.detail.addBlocker(this._fillView(event.target)),
    });
  },

  _ensureView(doc) {
    if (doc.getElementById(VIEW_ID)) {
      return;
    }
    const view = doc.createXULElement("panelview");
    view.id = VIEW_ID;
    view.className = "PanelUI-subView patrium-panel";
    doc.l10n.setAttributes(view, "patrium-history-panel-header");
    view.setAttribute("data-l10n-attrs", "title");
    (doc.getElementById("appMenu-viewCache") ?? doc.documentElement).appendChild(
      view
    );
  },

  async _fillView(view) {
    const doc = view.ownerDocument;
    // Build the whole body first, then swap it in atomically, so the panel is
    // never shown empty and two quick opens can't duplicate the list.
    const body = doc.createXULElement("vbox");
    body.className = "panel-subview-body";

    const note = doc.createElementNS(HTML_NS, "p");
    note.className = "patrium-note";
    doc.l10n.setAttributes(note, "patrium-history-note");
    body.appendChild(note);

    const list = doc.createXULElement("vbox");
    list.className = "patrium-history-list";
    const hosts = await this.topHosts();
    if (!hosts.length) {
      const empty = doc.createElementNS(HTML_NS, "p");
      empty.className = "patrium-detail";
      doc.l10n.setAttributes(empty, "patrium-history-empty");
      list.appendChild(empty);
    }
    for (const host of hosts) {
      const cb = doc.createXULElement("checkbox");
      cb.setAttribute("label", host);
      cb.checked = this.isSaved(host);
      cb.addEventListener("CheckboxStateChange", () =>
        this.setSaved(host, cb.checked)
      );
      list.appendChild(cb);
    }
    body.appendChild(list);

    const clear = doc.createXULElement("toolbarbutton");
    clear.className = "subviewbutton patrium-action";
    doc.l10n.setAttributes(clear, "patrium-history-clear-button");
    clear.addEventListener("command", () => this._onClear(view));
    body.appendChild(clear);

    view.replaceChildren(body);
  },

  async _onClear(view) {
    const win = view.ownerDocument.defaultView;
    const count = this.savedHosts.length;
    if (!count) {
      return;
    }
    const [title, text] = await win.document.l10n.formatValues([
      "patrium-history-confirm-title",
      { id: "patrium-history-confirm-text", args: { count } },
    ]);
    if (!Services.prompt.confirm(win, title, text)) {
      return;
    }
    await this.clearSaved();
    win.PanelUI?.hide?.();
  },
};
