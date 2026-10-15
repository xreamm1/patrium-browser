const mod = n => ChromeUtils.importESModule(
  `moz-src:///browser/components/patrium/${n}.sys.mjs`)[n];
const PatriumZapret = mod("PatriumZapret");
const PatriumUpdater = mod("PatriumUpdater");
const out = {};

// 1. Strategy -> service command for every Flowseal strategy (read-only).
const src = "C:\\Users\\patrick\\AppData\\Local\\Temp\\claude\\C--patrium\\91213953-8af0-467d-9864-056a5b5374c2\\scratchpad\\flowseal-src";
Services.prefs.setStringPref("patrium.zapret.installedDir", src);
const strategies = await PatriumZapret.listStrategies();
out.strategyCount = strategies.length;
out.problems = [];
for (const s of strategies) {
  try {
    const cmd = await PatriumZapret.buildServiceCommand(s);
    if (/%\w+%|%~/.test(cmd)) {
      out.problems.push(`${s}: unresolved variable`);
    }
    for (const [, p] of cmd.matchAll(/="([^"]+)"/g)) {
      if (!p.endsWith("-user.txt") && !(await IOUtils.exists(p))) {
        out.problems.push(`${s}: missing ${p}`);
      }
    }
    if (s == "general.bat") {
      out.generalCommand = cmd.slice(0, 400) + " …";
      out.generalLength = cmd.length;
    }
  } catch (e) {
    out.problems.push(`${s}: ${e.message}`);
  }
}
out.serviceStateNow = await PatriumZapret.serviceState();

// 2. Updater against a public repo whose releases ship .exe installers.
Services.prefs.setStringPref("patrium.update.repo", "notepad-plus-plus/notepad-plus-plus");
Services.prefs.setStringPref("patrium.version", "0.1.0");
try {
  const pending = await PatriumUpdater.check({ ignoreSkip: true });
  out.update = pending && { version: pending.version, asset: pending.asset.name, digest: pending.asset.digest };
  await new Promise(r => setTimeout(r, 1500));
  const n = gNotificationBox.getNotificationWithValue("patrium-update");
  out.notification = n ? (n.messageText?.textContent || n.label || "shown") : null;
} catch (e) {
  out.updateError = String(e);
}
return out;
