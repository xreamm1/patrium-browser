/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PatriumDownloader:
    "moz-src:///browser/components/patrium/PatriumDownloader.sys.mjs",
});

const RELEASES_API =
  "https://api.github.com/repos/Flowseal/zapret-discord-youtube/releases/latest";
const PREF_STRATEGY = "patrium.zapret.strategy";
const PREF_INSTALLED_DIR = "patrium.zapret.installedDir";
const PREF_VERSION = "patrium.zapret.version";
const PREF_SERVICE_CONFIG = "patrium.zapret.serviceConfig";
const PROCESS_NAME = "winws.exe";
const SERVICE_NAME = "PatriumZapret";
const SETUP_SCRIPT = "patrium-service-setup.ps1";

// Lets non-admin users query, start and stop the service, but not change it.
const SERVICE_SDDL =
  "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLORPWPRC;;;AU)";

const ERROR_SERVICE_ALREADY_RUNNING = 1056;
const ERROR_SERVICE_NOT_ACTIVE = 1062;

function system32(exe) {
  return PathUtils.join(Services.dirsvc.get("SysD", Ci.nsIFile).path, exe);
}

/**
 * Manages Flowseal's zapret-discord-youtube (winws.exe + WinDivert), a
 * system-wide DPI circumvention tool, as the Windows service PatriumZapret.
 * Creating or reconfiguring the service needs one UAC prompt; starting and
 * stopping it afterwards does not.
 *
 * States: "missing", "installing", "off", "starting", "on", "stopping",
 * "external" (winws.exe runs outside our service), "error".
 */
class PatriumZapretClass {
  #state = "off";
  #error = null;
  #listeners = new Set();
  #pollTimer = null;

  get state() {
    return this.#state;
  }

  get error() {
    return this.#error;
  }

  get installedDir() {
    return Services.prefs.getStringPref(PREF_INSTALLED_DIR, "");
  }

  get version() {
    return Services.prefs.getStringPref(PREF_VERSION, "");
  }

  get strategy() {
    return Services.prefs.getStringPref(PREF_STRATEGY, "general.bat");
  }

  set strategy(value) {
    Services.prefs.setStringPref(PREF_STRATEGY, value);
  }

  addListener(fn) {
    this.#listeners.add(fn);
  }

  removeListener(fn) {
    this.#listeners.delete(fn);
  }

  #setState(state, error = null) {
    this.#state = state;
    this.#error = error;
    for (const fn of this.#listeners) {
      try {
        fn(state);
      } catch (e) {
        console.error(e);
      }
    }
  }

  async init() {
    await this.refresh();
  }

  async isInstalled() {
    const dir = this.installedDir;
    return (
      !!dir && (await IOUtils.exists(PathUtils.join(dir, "bin", PROCESS_NAME)))
    );
  }

  /**
   * @returns {Promise<string|null>} the service state reported by sc.exe
   *   (e.g. "RUNNING", "STOPPED"), or null if the service does not exist.
   */
  async serviceState() {
    const { exitCode, output } = await lazy.PatriumDownloader.run(
      system32("sc.exe"),
      ["query", SERVICE_NAME]
    );
    if (exitCode != 0) {
      return null;
    }
    return output.match(/STATE\s*:\s*\d+\s+(\w+)/)?.[1] ?? "UNKNOWN";
  }

  async refresh() {
    if (!(await this.isInstalled())) {
      this.#setState("missing");
      return;
    }
    const service = await this.serviceState();
    if (service == "RUNNING" || service == "START_PENDING") {
      this.#setState("on");
    } else if (await lazy.PatriumDownloader.isProcessRunning(PROCESS_NAME)) {
      this.#setState("external");
    } else {
      this.#setState("off");
    }
  }

  async listStrategies() {
    const dir = this.installedDir;
    if (!dir) {
      return [];
    }
    const children = await IOUtils.getChildren(dir);
    return children
      .map(p => PathUtils.filename(p))
      .filter(
        name =>
          name.toLowerCase().endsWith(".bat") &&
          name.toLowerCase().startsWith("general")
      )
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  /**
   * Downloads the latest release, verifying the SHA-256 digest that GitHub
   * publishes for the release asset.
   */
  async install() {
    const wasRunning = this.#state == "on";
    this.#setState("installing");
    try {
      const release = await lazy.PatriumDownloader.fetchJSON(RELEASES_API);
      const asset = release.assets.find(a => a.name.endsWith(".zip"));
      if (!asset?.digest?.startsWith("sha256:")) {
        throw new Error("Release has no zip asset with a sha256 digest");
      }
      const toolsDir = PathUtils.join(
        lazy.PatriumDownloader.toolsDir,
        "zapret"
      );
      const archive = PathUtils.join(toolsDir, asset.name);
      await lazy.PatriumDownloader.downloadVerified(
        asset.browser_download_url,
        archive,
        asset.digest.slice("sha256:".length)
      );
      const extractDir = PathUtils.join(toolsDir, release.tag_name);
      if (PathUtils.parent(this.installedDir) != extractDir) {
        await IOUtils.remove(extractDir, {
          recursive: true,
          ignoreAbsent: true,
        });
      }
      await lazy.PatriumDownloader.extract(archive, extractDir);
      await IOUtils.remove(archive);

      const serviceBat = await lazy.PatriumDownloader.findFile(
        extractDir,
        "service.bat"
      );
      if (!serviceBat) {
        throw new Error("Unexpected archive layout: service.bat not found");
      }
      Services.prefs.setStringPref(
        PREF_INSTALLED_DIR,
        PathUtils.parent(serviceBat)
      );
      Services.prefs.setStringPref(PREF_VERSION, release.tag_name);
      await this.refresh();
      if (wasRunning) {
        // The service still points at the previous version; start() moves it.
        await this.start();
      }
    } catch (e) {
      console.error("Patrium: zapret install failed", e);
      this.#setState("error", e.message);
    }
  }

  async latestVersion() {
    const release = await lazy.PatriumDownloader.fetchJSON(RELEASES_API);
    return release.tag_name;
  }

  async #gameFilter(dir) {
    const filter = { GameFilter: "12", GameFilterTCP: "12", GameFilterUDP: "12" };
    let text;
    try {
      text = await IOUtils.readUTF8(
        PathUtils.join(dir, "utils", "game_filter.enabled")
      );
    } catch {
      return filter;
    }
    const value = key =>
      text.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)`, "mi"))?.[1];
    const range = /^\d+-\d+$/;
    const tcp = range.test(value("tcp") ?? "") ? value("tcp") : "1024-65535";
    const udp = range.test(value("udp") ?? "") ? value("udp") : "1024-65535";
    const mode = (value("mode") ?? "all").toLowerCase();
    if (mode == "all" || mode == "tcp") {
      filter.GameFilter = filter.GameFilterTCP = tcp;
    }
    if (mode == "all" || mode == "udp") {
      filter.GameFilterUDP = udp;
      if (mode == "udp") {
        filter.GameFilter = udp;
      }
    }
    return filter;
  }

  /**
   * Turns a strategy .bat into the winws.exe command line used as the
   * service binPath, with every path made absolute.
   */
  async buildServiceCommand(strategy) {
    const dir = this.installedDir;
    const text = await IOUtils.readUTF8(PathUtils.join(dir, strategy));
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex(l => /winws\.exe/i.test(l));
    if (start == -1) {
      throw new Error(`${strategy}: winws.exe command not found`);
    }
    let command = "";
    for (let i = start; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      const continued = line.endsWith("^");
      command += " " + (continued ? line.slice(0, -1) : line);
      if (!continued) {
        break;
      }
    }
    command = command.replace(/^.*?winws\.exe"?/i, "").trim();

    const vars = {
      BIN: PathUtils.join(dir, "bin") + "\\",
      LISTS: PathUtils.join(dir, "lists") + "\\",
      "~dp0": dir + "\\",
      ...(await this.#gameFilter(dir)),
    };
    command = command.replace(/%(~dp0|[A-Za-z_][A-Za-z0-9_]*)%?/g, (m, name) => {
      const key = Object.keys(vars).find(
        k => k.toLowerCase() == name.toLowerCase()
      );
      return key ? vars[key] : m;
    });
    const unresolved = command.match(/%[A-Za-z_][A-Za-z0-9_]*%/);
    if (unresolved) {
      throw new Error(`${strategy}: unknown variable ${unresolved[0]}`);
    }
    return `"${PathUtils.join(dir, "bin", PROCESS_NAME)}" ${command}`;
  }

  /**
   * (Re)creates the PatriumZapret service for the current strategy. Needs one
   * UAC prompt. Resolves to false if the user declined it.
   */
  // Same defaults as service.bat's load_user_lists; winws rejects empty lists.
  async #ensureUserLists(dir) {
    const lists = PathUtils.join(dir, "lists");
    const defaults = {
      "ipset-exclude-user.txt": "203.0.113.113/32\r\n",
      "list-general-user.txt": "# Never leave this file empty\r\ndomain.example.abc\r\n",
      "list-exclude-user.txt": "domain.example.abc\r\n",
    };
    for (const [name, content] of Object.entries(defaults)) {
      const path = PathUtils.join(lists, name);
      if (!(await IOUtils.exists(path))) {
        await IOUtils.writeUTF8(path, content);
      }
    }
  }

  async configureService(strategy) {
    const dir = this.installedDir;
    await this.#ensureUserLists(dir);
    const binPath = await this.buildServiceCommand(strategy);
    const psString = s => `'${s.replace(/'/g, "''")}'`;
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$name = ${psString(SERVICE_NAME)}`,
      "if (Get-Service -Name $name -ErrorAction SilentlyContinue) {",
      "  sc.exe stop $name | Out-Null",
      "  Start-Sleep -Milliseconds 800",
      "  sc.exe delete $name | Out-Null",
      "  Start-Sleep -Milliseconds 800",
      "}",
      `New-Service -Name $name -BinaryPathName ${psString(binPath)} -DisplayName 'Patrium Zapret' -StartupType Manual -Description 'zapret-discord-youtube (Flowseal) managed by Patrium' | Out-Null`,
      `sc.exe sdset $name ${psString(SERVICE_SDDL)} | Out-Null`,
      "if ($LASTEXITCODE -ne 0) { exit 2 }",
      // Several strategies rely on TCP timestamps, as service.bat's tcp_enable does.
      "netsh interface tcp set global timestamps=enabled | Out-Null",
      "exit 0",
      "",
    ].join("\r\n");
    const scriptPath = PathUtils.join(dir, SETUP_SCRIPT);
    // UTF-8 with BOM so Windows PowerShell 5.1 reads non-ASCII paths correctly.
    await IOUtils.write(
      scriptPath,
      new Uint8Array([
        0xef,
        0xbb,
        0xbf,
        ...new TextEncoder().encode(script),
      ])
    );
    const powershell = system32(
      PathUtils.join("WindowsPowerShell", "v1.0", "powershell.exe")
    );
    const ok = await lazy.PatriumDownloader.runElevated(
      powershell,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { wait: true }
    );
    if (ok) {
      Services.prefs.setStringPref(
        PREF_SERVICE_CONFIG,
        JSON.stringify({ dir, strategy })
      );
    }
    return ok;
  }

  #serviceMatchesSettings(strategy) {
    try {
      const config = JSON.parse(
        Services.prefs.getStringPref(PREF_SERVICE_CONFIG, "{}")
      );
      return config.dir == this.installedDir && config.strategy == strategy;
    } catch {
      return false;
    }
  }

  async #sc(command) {
    const { exitCode, output } = await lazy.PatriumDownloader.run(
      system32("sc.exe"),
      [command, SERVICE_NAME]
    );
    return { exitCode, output };
  }

  async start() {
    const strategies = await this.listStrategies();
    const strategy = strategies.includes(this.strategy)
      ? this.strategy
      : strategies[0];
    if (!strategy) {
      this.#setState("error", "No strategy files found");
      return;
    }
    this.#setState("starting");
    try {
      if (
        (await this.serviceState()) === null ||
        !this.#serviceMatchesSettings(strategy)
      ) {
        if (!(await this.configureService(strategy))) {
          await this.refresh();
          return;
        }
      }
      const { exitCode, output } = await this.#sc("start");
      if (exitCode != 0 && exitCode != ERROR_SERVICE_ALREADY_RUNNING) {
        throw new Error(`sc start failed (${exitCode}): ${output.trim()}`);
      }
      await this.#waitFor(true);
    } catch (e) {
      console.error("Patrium: failed to start zapret", e);
      this.#setState("error", e.message);
    }
  }

  async stop() {
    this.#setState("stopping");
    const { exitCode, output } = await this.#sc("stop");
    if (exitCode != 0 && exitCode != ERROR_SERVICE_NOT_ACTIVE) {
      this.#setState("error", `sc stop failed (${exitCode}): ${output.trim()}`);
      return;
    }
    await this.#waitFor(false);
  }

  async toggle() {
    if (this.#state == "on") {
      await this.stop();
    } else if (this.#state == "off" || this.#state == "error") {
      await this.start();
    }
  }

  async #waitFor(running, timeoutMs = 20000) {
    clearTimeout(this.#pollTimer);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await this.serviceState();
      if (running ? state == "RUNNING" : state != "RUNNING" && state != "STOP_PENDING") {
        await this.refresh();
        return;
      }
      await new Promise(resolve => {
        this.#pollTimer = setTimeout(resolve, 500);
      });
    }
    await this.refresh();
    if ((this.#state == "on") != running) {
      this.#setState(
        "error",
        running ? "The zapret service did not start" : "The zapret service did not stop"
      );
    }
  }
}

export const PatriumZapret = new PatriumZapretClass();
