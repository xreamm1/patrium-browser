/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  PatriumAdblock:
    "moz-src:///browser/components/patrium/PatriumAdblock.sys.mjs",
  PatriumTor: "moz-src:///browser/components/patrium/PatriumTor.sys.mjs",
  PatriumZapret: "moz-src:///browser/components/patrium/PatriumZapret.sys.mjs",
});


const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

/**
 * A toolbar button with a panel showing a status line, an on/off button,
 * an install button and an option list. Shared by the zapret and Tor UIs.
 */
class ServiceWidget {
  constructor({ prefix, service, options, extraButtons = [] }) {
    this.prefix = prefix;
    this.service = service;
    this.options = options;
    this.extraButtons = extraButtons;
    this.widgetId = `${prefix}-button`;
    this.viewId = `${prefix}-panel`;
    this.onStateChanged = () => this.updateAllWindows();
  }

  create() {
    lazy.CustomizableUI.createWidget({
      id: this.widgetId,
      l10nId: this.widgetId,
      type: "view",
      viewId: this.viewId,
      defaultArea: lazy.CustomizableUI.AREA_NAVBAR,
      onBeforeCreated: doc => {
        this.ensurePanelView(doc);
        return true;
      },
      onCreated: node => this.updateButton(node),
      onViewShowing: event => this.onViewShowing(event),
      onViewHiding: event => {
        event.target.removeEventListener("command", this);
      },
    });
    this.service.addListener(this.onStateChanged);
  }

  // Only the empty panelview is created while the window is being built;
  // children added that early are lost, so buildBody() runs on first show.
  ensurePanelView(doc) {
    if (doc.getElementById(this.viewId)) {
      return;
    }
    const view = doc.createXULElement("panelview");
    view.id = this.viewId;
    view.className = "PanelUI-subView patrium-panel";
    view.setAttribute("data-l10n-id", `${this.prefix}-panel-header`);
    view.setAttribute("data-l10n-attrs", "title");
    (doc.getElementById("appMenu-viewCache") ?? doc.documentElement).appendChild(
      view
    );
  }

  buildBody(view) {
    if (view.querySelector(".panel-subview-body")) {
      return;
    }
    const doc = view.ownerDocument;
    const el = (tag, attrs = {}) => {
      const node = tag.startsWith("html:")
        ? doc.createElementNS("http://www.w3.org/1999/xhtml", tag.slice(5))
        : doc.createElementNS(XUL_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, v);
      }
      return node;
    };
    const p = this.prefix;
    const body = el("vbox", { class: "panel-subview-body" });

    const status = el("html:div", { class: "patrium-status" });
    status.append(
      el("html:span", { class: "patrium-status-dot" }),
      el("html:span", { id: `${p}-status`, class: "patrium-status-text" })
    );
    const detail = el("html:p", { id: `${p}-detail`, class: "patrium-detail" });

    const install = el("toolbarbutton", {
      id: `${p}-install`,
      class: "subviewbutton patrium-action",
      "data-l10n-id": `${p}-install-button`,
    });
    const toggle = el("toolbarbutton", {
      id: `${p}-toggle`,
      class: "subviewbutton patrium-action",
    });

    const optionRow = el("hbox", { class: "patrium-option", align: "center" });
    const optionLabel = el("label", {
      "data-l10n-id": this.options.labelL10nId,
      control: `${p}-option`,
    });
    const menulist = el("menulist", {
      id: `${p}-option`,
      flex: "1",
      sizetopopup: "none",
    });
    menulist.appendChild(el("menupopup"));
    optionRow.append(optionLabel, menulist);

    const note = el("html:p", {
      class: "patrium-note",
      "data-l10n-id": this.options.noteL10nId,
    });

    body.append(status, detail, install, toggle, optionRow);
    for (const { id, l10nId } of this.extraButtons) {
      body.append(
        el("toolbarbutton", {
          id: `${p}-${id}`,
          class: "subviewbutton",
          "data-l10n-id": l10nId,
        })
      );
    }
    body.append(note);
    view.append(body);
  }

  async onViewShowing(event) {
    const view = event.target;
    this.buildBody(view);
    view.addEventListener("command", this);
    // Only re-check when showing a stale "external" (another winws that may
    // have since exited); never during busy/error, to avoid wiping that state.
    if (this.service.refresh && this.service.state == "external") {
      await this.service.refresh().catch(() => {});
    }
    await this.fillOptions(view);
    this.updatePanel(view);
  }

  async fillOptions(view) {
    const menulist = view.querySelector(`#${this.prefix}-option`);
    const popup = menulist.menupopup;
    popup.replaceChildren();
    const doc = view.ownerDocument;
    for (const { value, label, l10nId } of await this.options.list()) {
      const item = doc.createXULElement("menuitem");
      item.setAttribute("value", value);
      if (l10nId) {
        doc.l10n.setAttributes(item, l10nId);
      } else {
        item.setAttribute("label", label);
      }
      popup.appendChild(item);
    }
    menulist.value = this.options.get();
  }

  handleEvent(event) {
    const id = event.target.id;
    const p = this.prefix;
    if (id == `${p}-toggle`) {
      this.toggleWithConflictCheck(event.target.documentGlobal);
    } else if (id == `${p}-install`) {
      this.confirmAndInstall(event.target.documentGlobal);
    } else if (event.target.closest(`#${p}-option`)) {
      this.options.set(event.target.closest("menulist").value);
    } else {
      const extra = this.extraButtons.find(b => id == `${p}-${b.id}`);
      extra?.onCommand(event.target.documentGlobal);
    }
  }

  async toggleWithConflictCheck(win) {
    const turningOn = ["off", "error"].includes(this.service.state);
    const other = this.conflict?.service;
    if (turningOn && ["on", "starting"].includes(other?.state)) {
      const [title, text] = await win.document.l10n.formatValues([
        "patrium-conflict-title",
        this.conflict.textL10nId,
      ]);
      if (!Services.prompt.confirm(win, title, text)) {
        return;
      }
    }
    await this.service.toggle();
  }

  async confirmAndInstall(win) {
    const p = this.prefix;
    const [title, text] = await win.document.l10n.formatValues([
      `${p}-install-confirm-title`,
      `${p}-install-confirm-text`,
    ]);
    if (Services.prompt.confirm(win, title, text)) {
      await this.service.install();
    }
  }

  updateAllWindows() {
    for (const node of liveNodes(this.widgetId)) {
      this.updateButton(node);
      const view = node.ownerDocument.getElementById(this.viewId);
      if (view) {
        this.updatePanel(view);
      }
    }
  }

  updateButton(node) {
    node.setAttribute("patrium-state", this.service.state);
  }

  updatePanel(view) {
    if (!view.querySelector(".panel-subview-body")) {
      return;
    }
    const doc = view.ownerDocument;
    const p = this.prefix;
    const { state, error } = this.service;
    view.setAttribute("patrium-state", state);

    doc.l10n.setAttributes(
      view.querySelector(`#${p}-status`),
      `${p}-status-${state}`,
      { progress: this.service.progress ?? 0 }
    );

    const detail = view.querySelector(`#${p}-detail`);
    if (state == "error" && error) {
      detail.removeAttribute("data-l10n-id");
      detail.textContent = error;
    } else if (this.service.version) {
      doc.l10n.setAttributes(detail, `${p}-version`, {
        version: this.service.version,
      });
    } else {
      detail.removeAttribute("data-l10n-id");
      detail.textContent = "";
    }

    const installed = state != "missing" && state != "installing";
    // Only lock while a tracked operation is in flight. "starting" alone is
    // not locked for services without a busy flag (e.g. Tor), so the user can
    // still cancel a stuck connection.
    const busy =
      (this.service.busy ?? false) ||
      ["installing", "stopping"].includes(state);
    const locked = busy || state == "external";
    view.querySelector(`#${p}-install`).hidden = installed;
    view.querySelector(`#${p}-install`).disabled = busy;

    const toggle = view.querySelector(`#${p}-toggle`);
    toggle.hidden = !installed;
    // Disable only while a tracked operation runs (busy) or another winws is
    // detected; never while "starting", so a stuck connection can be cancelled.
    toggle.disabled =
      (this.service.busy ?? false) ||
      state == "installing" ||
      state == "external";
    // "routing" covers a failed-closed service that still needs tearing down.
    const isOn =
      state == "on" || state == "starting" || this.service.routing;
    doc.l10n.setAttributes(
      toggle,
      isOn ? `${p}-turn-off-button` : `${p}-turn-on-button`
    );
    view.querySelector(`#${p}-option`).disabled = !installed || isOn || locked;
    for (const { id } of this.extraButtons) {
      const button = view.querySelector(`#${p}-${id}`);
      if (button) {
        button.disabled = locked;
      }
    }
  }
}

/**
 * Shield button showing how many requests were blocked on the current page,
 * with a panel to allow the site or refresh the filter lists.
 */
class AdblockWidget {
  widgetId = "patrium-adblock-button";
  viewId = "patrium-adblock-panel";
  #windows = new WeakSet();

  create() {
    lazy.CustomizableUI.createWidget({
      id: this.widgetId,
      l10nId: this.widgetId,
      type: "view",
      viewId: this.viewId,
      defaultArea: lazy.CustomizableUI.AREA_NAVBAR,
      onBeforeCreated: doc => {
        this.ensurePanelView(doc);
        return true;
      },
      onCreated: node => {
        node.setAttribute("badged", "true");
        this.watchWindow(node.documentGlobal);
        this.updateButton(node);
      },
      onViewShowing: event => {
        this.buildBody(event.target);
        event.target.addEventListener("command", this);
        this.updatePanel(event.target);
      },
      onViewHiding: event => {
        event.target.removeEventListener("command", this);
      },
    });
    lazy.PatriumAdblock.addListener(() => this.scheduleUpdate());
  }

  #updateScheduled = false;

  scheduleUpdate() {
    if (this.#updateScheduled) {
      return;
    }
    this.#updateScheduled = true;
    setTimeout(() => {
      this.#updateScheduled = false;
      this.updateAllWindows();
    }, 250);
  }

  watchWindow(win) {
    if (this.#windows.has(win) || !win.gBrowser) {
      return;
    }
    this.#windows.add(win);
    win.gBrowser.addTabsProgressListener({
      onLocationChange: (browser, webProgress, request, location, flags) => {
        if (
          webProgress.isTopLevel &&
          !(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT)
        ) {
          lazy.PatriumAdblock.resetBlockedCount(browser);
          this.updateAllWindows();
        }
      },
    });
    win.gBrowser.tabContainer.addEventListener("TabSelect", () =>
      this.updateAllWindows()
    );
  }

  ensurePanelView(doc) {
    if (doc.getElementById(this.viewId)) {
      return;
    }
    const view = doc.createXULElement("panelview");
    view.id = this.viewId;
    view.className = "PanelUI-subView patrium-panel";
    doc.l10n.setAttributes(view, "patrium-adblock-panel-header");
    view.setAttribute("data-l10n-attrs", "title");
    (doc.getElementById("appMenu-viewCache") ?? doc.documentElement).appendChild(
      view
    );
  }

  buildBody(view) {
    if (view.querySelector(".panel-subview-body")) {
      return;
    }
    const doc = view.ownerDocument;
    const body = doc.createXULElement("vbox");
    body.className = "panel-subview-body";

    const status = doc.createElement("div");
    status.className = "patrium-status";
    const dot = doc.createElement("span");
    dot.className = "patrium-status-dot";
    const count = doc.createElement("span");
    count.id = "patrium-adblock-count";
    count.className = "patrium-status-text";
    status.append(dot, count);

    const site = doc.createXULElement("checkbox");
    site.id = "patrium-adblock-site";
    doc.l10n.setAttributes(site, "patrium-adblock-site-enabled");

    const update = doc.createXULElement("toolbarbutton");
    update.id = "patrium-adblock-update";
    update.className = "subviewbutton";
    doc.l10n.setAttributes(update, "patrium-adblock-update-button");

    const detail = doc.createElement("p");
    detail.id = "patrium-adblock-detail";
    detail.className = "patrium-detail";

    body.append(status, site, update, detail);
    view.append(body);
  }

  handleEvent(event) {
    const win = event.target.documentGlobal;
    const host = this.currentHost(win);
    if (event.target.id == "patrium-adblock-site" && host) {
      lazy.PatriumAdblock.setAllowlisted(host, !event.target.checked);
      win.gBrowser.reload();
    } else if (event.target.id == "patrium-adblock-update") {
      lazy.PatriumAdblock.update().catch(console.error);
    }
  }

  currentHost(win) {
    try {
      return win.gBrowser.currentURI.host;
    } catch {
      return "";
    }
  }

  updateAllWindows() {
    for (const node of liveNodes(this.widgetId)) {
      this.updateButton(node);
      const view = node.ownerDocument.getElementById(this.viewId);
      if (view) {
        this.updatePanel(view);
      }
    }
  }

  stateFor(win) {
    const { PatriumAdblock } = lazy;
    if (PatriumAdblock.updating && !PatriumAdblock.ready) {
      return "installing";
    }
    if (!PatriumAdblock.enabled || !PatriumAdblock.ready) {
      return "off";
    }
    return PatriumAdblock.isAllowlisted(this.currentHost(win)) ? "paused" : "on";
  }

  updateButton(node) {
    const win = node.documentGlobal;
    node.setAttribute("patrium-state", this.stateFor(win));
    const count = lazy.PatriumAdblock.getBlockedCount(
      win.gBrowser?.selectedBrowser
    );
    if (count) {
      node.setAttribute("badge", count > 999 ? "999+" : String(count));
    } else {
      node.removeAttribute("badge");
    }
  }

  updatePanel(view) {
    if (!view.querySelector(".panel-subview-body")) {
      return;
    }
    const doc = view.ownerDocument;
    const win = view.documentGlobal;
    const state = this.stateFor(win);
    view.setAttribute("patrium-state", state);
    doc.l10n.setAttributes(
      view.querySelector("#patrium-adblock-count"),
      "patrium-adblock-blocked-count",
      {
        count: lazy.PatriumAdblock.getBlockedCount(win.gBrowser.selectedBrowser),
      }
    );
    const host = this.currentHost(win);
    const site = view.querySelector("#patrium-adblock-site");
    site.disabled = !host;
    site.checked = !lazy.PatriumAdblock.isAllowlisted(host);

    view.querySelector("#patrium-adblock-update").disabled =
      lazy.PatriumAdblock.updating;
    const detail = view.querySelector("#patrium-adblock-detail");
    const last = lazy.PatriumAdblock.lastUpdate;
    if (last) {
      doc.l10n.setAttributes(detail, "patrium-adblock-lists-updated", {
        date: last * 1000,
      });
    } else {
      doc.l10n.setAttributes(detail, "patrium-adblock-lists-never");
    }
  }
}


function* liveNodes(widgetId) {
  const widget = lazy.CustomizableUI.getWidget(widgetId);
  for (const instance of widget?.instances ?? []) {
    const node = instance.node;
    if (node?.documentGlobal?.gBrowser) {
      yield node;
    }
  }
}

export const PatriumUI = {
  widgets: [],

  init() {
    const zapret = new ServiceWidget({
      prefix: "patrium-zapret",
      service: lazy.PatriumZapret,
      options: {
        labelL10nId: "patrium-zapret-strategy-label",
        noteL10nId: "patrium-zapret-admin-note",
        list: async () =>
          (await lazy.PatriumZapret.listStrategies()).map(name => ({
            value: name,
            label: name.replace(/\.bat$/i, ""),
          })),
        get: () => lazy.PatriumZapret.strategy,
        set: value => {
          lazy.PatriumZapret.strategy = value;
        },
      },
      extraButtons: [
        {
          id: "update",
          l10nId: "patrium-zapret-update-button",
          onCommand: () => lazy.PatriumZapret.install(),
        },
      ],
    });

    const tor = new ServiceWidget({
      prefix: "patrium-tor",
      service: lazy.PatriumTor,
      options: {
        labelL10nId: "patrium-tor-bridges-label",
        noteL10nId: "patrium-tor-note",
        list: async () =>
          ["snowflake", "obfs4", "meek", "none"].map(value => ({
            value,
            l10nId: `patrium-tor-bridges-${value}`,
          })),
        get: () => lazy.PatriumTor.bridges,
        set: value => {
          lazy.PatriumTor.bridges = value;
        },
      },
    });

    tor.conflict = {
      service: lazy.PatriumZapret,
      textL10nId: "patrium-conflict-tor-text",
    };
    zapret.conflict = {
      service: lazy.PatriumTor,
      textL10nId: "patrium-conflict-zapret-text",
    };

    for (const widget of [new AdblockWidget(), tor, zapret]) {
      widget.create();
      this.widgets.push(widget);
    }
  },
};
