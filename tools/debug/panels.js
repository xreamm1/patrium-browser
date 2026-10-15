await new Promise(r => setTimeout(r, 3000));
const out = {};
for (const prefix of ["patrium-adblock", "patrium-tor", "patrium-zapret"]) {
  const node = document.getElementById(`${prefix}-button`);
  const shown = new Promise(r =>
    document.addEventListener("ViewShown", e => r(e.target.id), { once: true, capture: true })
  );
  PanelUI.showSubView(`${prefix}-panel`, node);
  const id = await Promise.race([shown, new Promise(r => setTimeout(() => r("timeout"), 5000))]);
  await new Promise(r => setTimeout(r, 800));
  const view = document.getElementById(`${prefix}-panel`);
  out[prefix] = {
    shownEvent: id,
    exists: !!view,
    state: view?.getAttribute("patrium-state"),
    visibleItems: view
      ? Array.from(view.querySelectorAll("toolbarbutton, checkbox, menulist, .patrium-status-text, .patrium-detail, .patrium-note, label"))
          .filter(e => !e.hidden && e.getBoundingClientRect().height > 0)
          .map(e => `${e.localName}#${e.id || ""}: ${(e.getAttribute("label") || e.textContent || e.value || "").trim().slice(0, 90)}`)
      : null,
    options: view?.querySelector("menulist")
      ? Array.from(view.querySelectorAll("menuitem"), i => i.getAttribute("label"))
      : null,
  };
  for (const p of document.querySelectorAll("panel[panelopen]")) {
    p.hidePopup();
  }
  await new Promise(r => setTimeout(r, 800));
}
return out;
