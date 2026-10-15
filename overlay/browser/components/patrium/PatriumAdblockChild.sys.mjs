/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const GENERIC_SCAN_DELAY_MS = 300;
const MAX_NODES_PER_SCAN = 5000;

/**
 * Hides page elements matched by cosmetic filters, using user-level style
 * sheets so that page styles cannot override them.
 */
export class PatriumAdblockChild extends JSWindowActorChild {
  #started = false;
  #exceptions = [];
  #generic = false;
  #seenClasses = new Set();
  #seenIds = new Set();
  #pendingNodes = [];
  #scanScheduled = false;
  #observer = null;

  handleEvent(event) {
    switch (event.type) {
      case "DOMDocElementInserted":
        if (event.target == this.document) {
          this.#start();
        }
        break;
      case "DOMContentLoaded":
        if (event.target == this.document) {
          this.#startGeneric();
        }
        break;
    }
  }

  didDestroy() {
    this.#observer?.disconnect();
  }

  async #start() {
    if (this.#started) {
      return;
    }
    this.#started = true;
    let res;
    try {
      res = await this.sendQuery("Cosmetic", {
        url: this.document.documentURI,
      });
    } catch {
      return;
    }
    if (!res) {
      return;
    }
    this.#exceptions = res.exceptions ?? [];
    this.#generic = !res.generichide;
    this.#inject(res.hide);
    if (this.#generic && this.document.readyState != "loading") {
      this.#startGeneric();
    }
  }

  #startGeneric() {
    if (!this.#generic || this.#observer || !this.document.documentElement) {
      return;
    }
    this.#observer = new this.contentWindow.MutationObserver(records => {
      for (const record of records) {
        if (record.type == "attributes") {
          this.#pendingNodes.push(record.target);
        } else {
          for (const node of record.addedNodes) {
            if (node.nodeType == 1) {
              this.#pendingNodes.push(node);
            }
          }
        }
      }
      this.#scheduleScan();
    });
    this.#observer.observe(this.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "id"],
    });
    this.#pendingNodes.push(this.document.documentElement);
    this.#scheduleScan();
  }

  #scheduleScan() {
    if (this.#scanScheduled) {
      return;
    }
    this.#scanScheduled = true;
    setTimeout(() => {
      this.#scanScheduled = false;
      this.#scan();
    }, GENERIC_SCAN_DELAY_MS);
  }

  async #scan() {
    const classes = new Set();
    const ids = new Set();
    let budget = MAX_NODES_PER_SCAN;
    const collect = el => {
      for (const c of el.classList ?? []) {
        if (!this.#seenClasses.has(c)) {
          this.#seenClasses.add(c);
          classes.add(c);
        }
      }
      if (el.id && !this.#seenIds.has(el.id)) {
        this.#seenIds.add(el.id);
        ids.add(el.id);
      }
    };
    const nodes = this.#pendingNodes;
    this.#pendingNodes = [];
    for (const node of nodes) {
      if (budget <= 0) {
        break;
      }
      collect(node);
      budget--;
      for (const el of node.querySelectorAll?.("[class],[id]") ?? []) {
        if (--budget <= 0) {
          break;
        }
        collect(el);
      }
    }
    if (!classes.size && !ids.size) {
      return;
    }
    let selectors;
    try {
      selectors = await this.sendQuery("Generic", {
        classes: [...classes],
        ids: [...ids],
        exceptions: this.#exceptions,
      });
    } catch {
      return;
    }
    this.#inject(selectors);
  }

  #inject(selectors) {
    if (!selectors?.length || !this.contentWindow) {
      return;
    }
    const css = selectors
      .map(s => `${s} { display: none !important; }`)
      .join("\n");
    const utils = this.contentWindow.windowUtils;
    try {
      utils.loadSheetUsingURIString(
        "data:text/css;charset=utf-8," + encodeURIComponent(css),
        utils.USER_SHEET
      );
    } catch (e) {
      console.error(e);
    }
  }
}
