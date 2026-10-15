await new Promise(r => setTimeout(r, 3000));
const out = {};
for (const prefix of ["patrium-tor"]) {
  const node = document.getElementById(`${prefix}-button`);
  PanelUI.showSubView(`${prefix}-panel`, node);
  await new Promise(r => setTimeout(r, 1500));
  const views = document.querySelectorAll(`#${prefix}-panel`);
  const view = views[0];
  const walk = (el, depth = 0) =>
    depth > 4 ? [] : [
      `${"  ".repeat(depth)}${el.localName}${el.id ? "#" + el.id : ""}${el.hidden ? " [hidden]" : ""} ${JSON.stringify((el.getAttribute?.("label") || "").slice(0, 40))} rect=${Math.round(el.getBoundingClientRect?.().width ?? -1)}x${Math.round(el.getBoundingClientRect?.().height ?? -1)}`,
      ...Array.from(el.children ?? []).flatMap(c => walk(c, depth + 1)),
    ];
  out.count = views.length;
  out.parent = view?.parentNode?.localName + "#" + view?.parentNode?.id;
  out.tree = view ? walk(view) : null;
  out.cacheHas = !!document.getElementById("appMenu-viewCache")?.content.getElementById(`${prefix}-panel`);
}
return out;
