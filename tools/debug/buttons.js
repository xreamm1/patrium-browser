await new Promise(r => setTimeout(r, 3000));
const out = {};
for (const id of ["downloads-button", "patrium-adblock-button", "patrium-tor-button", "patrium-zapret-button"]) {
  const el = document.getElementById(id);
  if (!el) {
    out[id] = null;
    continue;
  }
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  out[id] = {
    parent: el.parentNode?.id,
    rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    display: cs.display,
    visibility: cs.visibility,
    listStyleImage: cs.listStyleImage,
    hidden: el.hidden,
    attrs: Array.from(el.attributes, a => `${a.name}=${a.value}`),
    overflowed: el.getAttribute("overflowedItem"),
  };
}
out.sheets = Array.from(document.styleSheets, s => s.href).filter(h => h && h.includes("patrium"));
let cssOk = null;
try {
  const resp = await fetch("chrome://browser/content/patrium/patrium.css");
  cssOk = resp.ok ? (await resp.text()).length : resp.status;
} catch (e) {
  cssOk = String(e);
}
out.cssFetch = cssOk;
out.navOverflow = document.getElementById("nav-bar").getAttribute("overflowing");
out.overflowList = Array.from(document.getElementById("widget-overflow-list")?.children ?? [], c => c.id);
return out;
