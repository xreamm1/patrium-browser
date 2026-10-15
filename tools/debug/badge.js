const { PatriumAdblock } = ChromeUtils.importESModule(
  "moz-src:///browser/components/patrium/PatriumAdblock.sys.mjs");
const start = Date.now();
while (!PatriumAdblock.ready && Date.now() - start < 120000) {
  await new Promise(r => setTimeout(r, 500));
}
const browser = gBrowser.selectedBrowser;
browser.fixupAndLoadURIString("https://lenta.ru/", {
  triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
});
await new Promise(r => setTimeout(r, 12000));
const el = document.getElementById("patrium-adblock-button");
const msgs = Services.console
  .getMessageArray()
  .map(m => (m.errorMessage ? `${m.errorMessage} @ ${m.sourceName}:${m.lineNumber}` : m.message || String(m)))
  .filter(s => /patrium/i.test(s) && !/addons\.xpi/.test(s))
  .slice(-15);
return {
  count: PatriumAdblock.getBlockedCount(browser),
  attrs: el && Array.from(el.attributes, a => `${a.name}=${a.value}`),
  badgeEl: el?.querySelector(".toolbarbutton-badge")?.textContent,
  msgs,
};
