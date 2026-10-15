await new Promise(r => setTimeout(r, 2000));
const el = document.getElementById("patrium-zapret-button");
const before = getComputedStyle(el).listStyleImage;
let error = null;
try {
  windowUtils.loadSheetUsingURIString(
    "chrome://browser/content/patrium/patrium.css",
    windowUtils.AUTHOR_SHEET
  );
} catch (e) {
  error = String(e);
}
const after = getComputedStyle(el).listStyleImage;
const consoleErrors = Services.console
  .getMessageArray()
  .map(m => m.message || String(m))
  .filter(s => /patrium/i.test(s))
  .slice(-15);
return { before, error, after, consoleErrors };
