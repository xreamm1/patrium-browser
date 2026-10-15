"""Patrium smoke test: launches the built browser with a fresh profile under
Marionette and checks the Patrium features from chrome context.

Run: powershell -ExecutionPolicy Bypass -File tools\\mach.ps1 python /c/patrium/tools/smoke_test.py
"""

import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, r"C:\patrium\src\testing\marionette\client")
from marionette_driver.marionette import Marionette  # noqa: E402

EXE = r"C:\patrium\src\obj-patrium\dist\bin\patrium.exe"
OUT = r"C:\patrium\logs\smoke"
HEADLESS = "--visible" not in sys.argv

os.makedirs(OUT, exist_ok=True)
profile = tempfile.mkdtemp(prefix="patrium-smoke-")
args = [
    EXE,
    "-no-remote",
    "-profile",
    profile,
    "--marionette",
    "--remote-allow-system-access",
    "-width",
    "1400",
    "-height",
    "900",
]
if HEADLESS:
    args.append("-headless")
proc = subprocess.Popen(args, env={**os.environ, "MOZ_REMOTE_ALLOW_SYSTEM_ACCESS": "1"})

results = {}


def save_png(name, data):
    with open(os.path.join(OUT, name), "wb") as f:
        f.write(base64.b64decode(data))


try:
    m = Marionette(host="127.0.0.1", port=2828, startup_timeout=120)
    for _ in range(60):
        try:
            m.start_session()
            break
        except Exception:
            time.sleep(2)
    m.set_context("chrome")
    m.timeout.script = 300

    results["static"] = m.execute_script(
        """
        const { CustomizableUI } = ChromeUtils.importESModule(
          "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs");
        const p = Services.prefs;
        const get = n => {
          switch (p.getPrefType(n)) {
            case p.PREF_BOOL: return p.getBoolPref(n);
            case p.PREF_INT: return p.getIntPref(n);
            case p.PREF_STRING: return p.getStringPref(n);
          }
          return null;
        };
        const prefs = {};
        for (const n of [
          "toolkit.telemetry.enabled", "datareporting.healthreport.uploadEnabled",
          "app.normandy.enabled", "extensions.pocket.enabled",
          "browser.contentblocking.category", "privacy.query_stripping.enabled",
          "network.trr.mode", "browser.ipProtection.enabled",
          "fission.autostart", "dom.ipc.processCount.webIsolated",
          "dom.ipc.processPrelaunch.enabled", "browser.sessionhistory.max_total_viewers",
          "patrium.memory.tabUnload.enabled", "patrium.tor.bridges",
        ]) prefs[n] = get(n);
        const nav = CustomizableUI.getWidgetIdsInArea("nav-bar");
        return {
          appName: Services.appinfo.name,
          version: Services.appinfo.version,
          prefs,
          navbar: nav,
          buttons: ["patrium-adblock-button", "patrium-tor-button", "patrium-zapret-button"]
            .map(id => [id, !!document.getElementById(id)]),
        };
        """
    )

    results["adblock"] = m.execute_async_script(
        """
        const resolve = arguments[arguments.length - 1];
        const { PatriumAdblock } = ChromeUtils.importESModule(
          "moz-src:///browser/components/patrium/PatriumAdblock.sys.mjs");
        const start = Date.now();
        (async () => {
          while (!PatriumAdblock.ready && Date.now() - start < 240000) {
            await new Promise(r => setTimeout(r, 1000));
          }
          const engine = Cc["@patrium/adblock;1"].getService(Ci.nsIPatriumAdblock);
          const check = (u, s, t) => PatriumAdblock.ready ? engine.shouldBlock(u, s, t) : null;
          let cosmetic = null;
          try {
            const c = PatriumAdblock.cosmeticResources("https://lenta.ru/");
            cosmetic = { hide: c.hide.length, generichide: c.generichide };
          } catch (e) { cosmetic = String(e); }
          resolve({
            ready: PatriumAdblock.ready,
            secondsToReady: (Date.now() - start) / 1000,
            lastUpdate: PatriumAdblock.lastUpdate,
            blocks_gtm: check("https://www.googletagmanager.com/gtm.js?id=GTM-X", "https://example.com/", "script"),
            blocks_doubleclick: check("https://securepubads.g.doubleclick.net/tag/js/gpt.js", "https://example.com/", "script"),
            blocks_yandex_metrika: check("https://mc.yandex.ru/metrika/tag.js", "https://lenta.ru/", "script"),
            allows_normal: check("https://example.com/app.js", "https://example.com/", "script"),
            cosmetic,
            engineSizeKB: (await IOUtils.stat(PatriumAdblock.enginePath).catch(() => ({size: 0}))).size / 1024,
          });
        })().catch(e => resolve({ error: String(e) }));
        """
    )

    results["live_page"] = m.execute_async_script(
        """
        const resolve = arguments[arguments.length - 1];
        const { PatriumAdblock } = ChromeUtils.importESModule(
          "moz-src:///browser/components/patrium/PatriumAdblock.sys.mjs");
        (async () => {
          const url = "https://lenta.ru/";
          const browser = gBrowser.selectedBrowser;
          browser.fixupAndLoadURIString(url, {
            triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
          });
          await new Promise(r => setTimeout(r, 15000));
          resolve({
            url: browser.currentURI.spec,
            blocked: PatriumAdblock.getBlockedCount(browser),
            badge: document.getElementById("patrium-adblock-button")?.getAttribute("badge"),
            state: document.getElementById("patrium-adblock-button")?.getAttribute("patrium-state"),
          });
        })().catch(e => resolve({ error: String(e) }));
        """
    )
    save_png("01-window-lenta.png", m.screenshot())

    results["services"] = m.execute_script(
        """
        const mod = n => ChromeUtils.importESModule(
          `moz-src:///browser/components/patrium/${n}.sys.mjs`)[n];
        return {
          tor: mod("PatriumTor").state,
          zapret: mod("PatriumZapret").state,
          memoryTimer: !!mod("PatriumMemory")._timer,
        };
        """
    )

    for button, shot in [
        ("patrium-adblock-button", "02-adblock-panel.png"),
        ("patrium-tor-button", "03-tor-panel.png"),
        ("patrium-zapret-button", "04-zapret-panel.png"),
    ]:
        m.execute_script(
            """
            const node = document.getElementById(arguments[0]);
            PanelUI.showSubView(node.getAttribute("widget-id").replace(/-button$/, "-panel"), node);
            """,
            script_args=[button],
        )
        time.sleep(2)
        save_png(shot, m.screenshot())
        m.execute_script(
            "for (const p of document.querySelectorAll('panel[panelopen]')) p.hidePopup();"
        )
        time.sleep(1)

    m.set_context("content")
    m.navigate("about:preferences#general")
    time.sleep(3)
    m.execute_script(
        "document.querySelector('[data-l10n-id=\"performance-group\"], #performanceGroup')?.scrollIntoView();"
    )
    time.sleep(1)
    m.set_context("chrome")
    save_png("05-preferences-performance.png", m.screenshot())

    m.delete_session()
finally:
    try:
        proc.terminate()
        proc.wait(timeout=20)
    except Exception:
        proc.kill()
    shutil.rmtree(profile, ignore_errors=True)

with open(os.path.join(OUT, "results.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(json.dumps(results, ensure_ascii=False, indent=2))
