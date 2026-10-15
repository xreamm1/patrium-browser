await new Promise(r => setTimeout(r, 3000));
const cache = document.getElementById("appMenu-viewCache");
const describe = el => `${el.localName}#${el.id} children=${el.children.length}`;
const { PatriumUI } = ChromeUtils.importESModule(
  "moz-src:///browser/components/patrium/PatriumUI.sys.mjs");
const before = {
  cacheTag: cache?.localName,
  cacheChildren: Array.from(cache?.children ?? [], describe).filter(s => /patrium/.test(s)),
  contentChildren: Array.from(cache?.content?.children ?? [], describe).filter(s => /patrium/.test(s)),
  inDoc: Array.from(document.querySelectorAll("panelview[id^=patrium]"), describe),
  widgets: PatriumUI.widgets.length,
};
let manualError = null;
try {
  const w = PatriumUI.widgets.find(x => x.viewId == "patrium-tor-panel");
  const existing = document.getElementById("patrium-tor-panel");
  before.existingBeforeManual = existing && describe(existing);
  existing?.remove();
  w.ensurePanelView(document);
  before.afterManual = Array.from(document.querySelectorAll("panelview[id^=patrium-tor]"), describe);
} catch (e) {
  manualError = String(e) + "\n" + e.stack;
}
return { before, manualError };
