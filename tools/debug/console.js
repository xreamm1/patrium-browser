await new Promise(r => setTimeout(r, 4000));
const msgs = Services.console
  .getMessageArray()
  .map(m => (m.errorMessage ? `${m.errorMessage} @ ${m.sourceName}:${m.lineNumber}` : m.message || String(m)))
  .filter(s => /patrium|PanelUI|CustomizableUI|contentblocking/i.test(s))
  .slice(-25);
const el = document.getElementById("patrium-zapret-button");
return {
  firstRunDone: Services.prefs.getBoolPref("patrium.firstRunDone", false),
  category: Services.prefs.getStringPref("browser.contentblocking.category"),
  categoryHasUser: Services.prefs.prefHasUserValue("browser.contentblocking.category"),
  zapretAttrs: el && Array.from(el.attributes, a => `${a.name}=${a.value}`),
  icon: el && getComputedStyle(el).listStyleImage,
  msgs,
};
