/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from "react";

const EDIT_CLASS = "patrium-editing";

// A pencil button that toggles an iPhone-style edit mode for the new tab page:
// top sites and widgets wiggle, their menus (dismiss / pin / edit) are always
// visible, and tiles stay draggable. The toggle only sets a class on the
// document element (which React does not manage), so it survives re-renders.
export class PatriumEdit extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = { editing: false };
    this.toggle = this.toggle.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  componentWillUnmount() {
    document.documentElement.classList.remove(EDIT_CLASS);
  }

  toggle() {
    const editing = !this.state.editing;
    document.documentElement.classList.toggle(EDIT_CLASS, editing);
    this.setState({ editing });
  }

  onKeyDown(event) {
    if (this.state.editing && event.key === "Escape") {
      this.toggle();
    }
  }

  render() {
    const { editing } = this.state;
    return (
      <button
        className={`patrium-edit-fab${editing ? " active" : ""}`}
        onClick={this.toggle}
        onKeyDown={this.onKeyDown}
        aria-pressed={editing}
        title={editing ? "Готово" : "Настроить экран"}
        aria-label={editing ? "Готово" : "Настроить экран"}
      >
        <span className="patrium-edit-fab-icon" />
      </button>
    );
  }
}
