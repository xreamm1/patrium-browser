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
const PREF_STAGING_DIR = "patrium.zapret.stagingDir"; // profile: extracted service dir
const PREF_EXTRACT_ROOT = "patrium.zapret.extractRoot"; // profile: extract root
const PREF_ZIP = "patrium.zapret.zip"; // profile: verified .zip
const PREF_ZIP_SHA = "patrium.zapret.zipSha"; // upstream sha256 (hex)
const PREF_VERSION = "patrium.zapret.version";
const PREF_SERVICE_CONFIG = "patrium.zapret.serviceConfig";
const PROCESS_NAME = "winws.exe";
const SERVICE_NAME = "PatriumZapret";

// State tokens sc.exe reports. They are NOT localized, unlike the field labels
// around them, so we match the token directly instead of the "STATE:" label.
const SC_STATE =
  /\b(STOPPED|START_PENDING|STOP_PENDING|RUNNING|CONTINUE_PENDING|PAUSE_PENDING|PAUSED)\b/;

const ERROR_SERVICE_ALREADY_RUNNING = 1056;
const ERROR_SERVICE_NOT_ACTIVE = 1062;

// Default user list files, created in the admin-only service dir. Same content
// as service.bat's load_user_lists; winws rejects empty hostlists.
const USER_LISTS = {
  "ipset-exclude-user.txt": "203.0.113.113/32",
  "list-general-user.txt": "# Never leave this file empty\ndomain.example.abc",
  "list-exclude-user.txt": "domain.example.abc",
};

function system32(exe) {
  return PathUtils.join(Services.dirsvc.get("SysD", Ci.nsIFile).path, exe);
}

/**
 * Manages Flowseal's zapret-discord-youtube (winws.exe + WinDivert), a
 * system-wide DPI circumvention tool, as the Windows service PatriumZapret.
 *
 * Security model: the service binaries live under %ProgramFiles%\Patrium
 * (writable only by administrators), deployed by an elevated PowerShell step
 * that re-verifies the downloaded archive against its upstream SHA-256. The
 * service may be started and stopped without elevation, but only by the user
 * who installed it (its SDDL grants start/stop to that user's SID alone), so
 * a non-admin process cannot swap the binary and have the service run it as
 * SYSTEM. Creating or reconfiguring the service needs one UAC prompt.
 *
 * States: "missing", "installing", "off", "starting", "on", "stopping",
 * "external" (winws.exe runs outside our service), "error".
 */
class PatriumZapretClass {
  #state = "off";
  #error = null;
  #listeners = new Set();
  #pollToken = 0;
  #busy = false;

  get state() {
    return this.#state;
  }

  get error() {
    return this.#error;
  }

  get busy() {
    return this.#busy;
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

  get #stagingDir() {
    return Services.prefs.getStringPref(PREF_STAGING_DIR, "");
  }

  get #zipPath() {
    return Services.prefs.getStringPref(PREF_ZIP, "");
  }

  get #programFilesDir() {
    const pf =
      Services.env.get("ProgramFiles") || "C:\\Program Files";
    return PathUtils.join(pf, "Patrium", "zapret", "current");
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
    this.#notify();
  }

  #notify() {
    for (const fn of this.#listeners) {
      try {
        fn(this.#state);
      } catch (e) {
        console.error(e);
      }
    }
  }

  #setBusy(value) {
    this.#busy = value;
    this.#notify();
  }

  async init() {
    await this.refresh();
  }

  async isInstalled() {
    const zip = this.#zipPath;
    return !!zip && (await IOUtils.exists(zip));
  }

  /**
   * @returns {Promise<string|null>} the service state token (e.g. "RUNNING",
   *   "STOPPED"), or null if the service does not exist.
   */
  async serviceState() {
    const { exitCode, output } = await lazy.PatriumDownloader.run(
      system32("sc.exe"),
      ["query", SERVICE_NAME]
    );
    if (exitCode != 0) {
      return null; // 1060: the service does not exist.
    }
    return output.match(SC_STATE)?.[1] ?? "UNKNOWN";
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
    const dir = this.#stagingDir;
    if (!dir || !(await IOUtils.exists(dir))) {
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

  async latestVersion() {
    const release = await lazy.PatriumDownloader.fetchJSON(RELEASES_API);
    return release.tag_name;
  }

  /**
   * Downloads the latest release (verified against the SHA-256 GitHub
   * publishes), keeps the archive, and extracts a read-only staging copy used
   * to list strategies and build the service command line.
   */
  async install() {
    if (this.#busy) {
      return;
    }
    this.#busy = true;
    const wasRunning = this.#state == "on";
    this.#setState("installing");
    try {
      const release = await lazy.PatriumDownloader.fetchJSON(RELEASES_API);
      if (
        this.version &&
        this.compareTags(release.tag_name, this.version) <= 0 &&
        (await this.isInstalled())
      ) {
        await this.refresh(); // Already up to date.
        return;
      }
      const asset = release.assets.find(a => a.name.endsWith(".zip"));
      if (!asset?.digest?.startsWith("sha256:")) {
        throw new Error("Release has no zip asset with a sha256 digest");
      }
      const sha = asset.digest.slice("sha256:".length).toLowerCase();
      const toolsDir = PathUtils.join(lazy.PatriumDownloader.toolsDir, "zapret");
      const zip = PathUtils.join(toolsDir, asset.name);
      await lazy.PatriumDownloader.downloadVerified(
        asset.browser_download_url,
        zip,
        sha
      );

      const extractRoot = PathUtils.join(toolsDir, "staging");
      await IOUtils.remove(extractRoot, { recursive: true, ignoreAbsent: true });
      await lazy.PatriumDownloader.extract(zip, extractRoot);
      const serviceBat = await lazy.PatriumDownloader.findFile(
        extractRoot,
        "service.bat"
      );
      if (!serviceBat) {
        throw new Error("Unexpected archive layout: service.bat not found");
      }

      // Drop any older archive once the new one is staged.
      const oldZip = this.#zipPath;
      Services.prefs.setStringPref(PREF_ZIP, zip);
      Services.prefs.setStringPref(PREF_ZIP_SHA, sha);
      Services.prefs.setStringPref(PREF_VERSION, release.tag_name);
      Services.prefs.setStringPref(PREF_EXTRACT_ROOT, extractRoot);
      Services.prefs.setStringPref(PREF_STAGING_DIR, PathUtils.parent(serviceBat));
      Services.prefs.clearUserPref(PREF_SERVICE_CONFIG); // Force redeploy.
      if (oldZip && oldZip != zip) {
        await IOUtils.remove(oldZip, { ignoreAbsent: true }).catch(
          console.error
        );
      }
      await this.refresh();
      if (wasRunning) {
        this.#busy = false;
        await this.start(); // Redeploy the new version and restart.
      }
    } catch (e) {
      console.error("Patrium: zapret install failed", e);
      this.#setState("error", e.message);
    } finally {
      this.#setBusy(false);
    }
  }

  compareTags(a, b) {
    const parse = v =>
      String(v)
        .replace(/^v/i, "")
        .split(/[.-]/)
        .map(n => parseInt(n, 10) || 0);
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (d) {
        return d;
      }
    }
    return 0;
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
   * Turns a strategy .bat (read from the read-only staging copy) into the
   * winws.exe command line, with every path pointing at the admin-only
   * service directory `targetDir` where the binaries will be deployed.
   */
  async buildServiceCommand(strategy, targetDir) {
    const text = await IOUtils.readUTF8(
      PathUtils.join(this.#stagingDir, strategy)
    );
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
      BIN: PathUtils.join(targetDir, "bin") + "\\",
      LISTS: PathUtils.join(targetDir, "lists") + "\\",
      "~dp0": targetDir + "\\",
      ...(await this.#gameFilter(this.#stagingDir)),
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
    return `"${PathUtils.join(targetDir, "bin", PROCESS_NAME)}" ${command}`;
  }

  /**
   * Deploys the verified binaries into %ProgramFiles% and (re)creates the
   * service in one elevated step. Returns the UAC/script outcome.
   */
  async configureService(strategy) {
    const pf = this.#programFilesDir;
    const rel = this.#stagingDir
      .slice(Services.prefs.getStringPref(PREF_EXTRACT_ROOT, "").length)
      .replace(/^[\\/]+/, "");
    const svcDir = rel
      ? PathUtils.join(pf, ...rel.split(/[\\/]+/))
      : pf;
    const binPath = await this.buildServiceCommand(strategy, svcDir);
    const sid = await lazy.PatriumDownloader.currentUserSid();
    if (!sid) {
      throw new Error("Could not determine the current user SID");
    }
    // SYSTEM & Administrators: full control. The installing user: start/stop
    // and query only (no reconfigure/delete). No access for anyone else.
    const sddl =
      "D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)" +
      "(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)" +
      `(A;;CCLCSWRPWPLORC;;;${sid})`;

    const q = s => `'${String(s).replace(/'/g, "''")}'`;
    const listWrites = Object.entries(USER_LISTS)
      .map(
        ([name, content]) =>
          `  $f = Join-Path $lists ${q(name)}; ` +
          `if (-not (Test-Path $f)) { Set-Content -LiteralPath $f -Value ${q(content)} -Encoding ascii }`
      )
      .join("\n");

    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$zip = ${q(this.#zipPath)}`,
      `$sha = ${q(Services.prefs.getStringPref(PREF_ZIP_SHA, ""))}`,
      `$pf = ${q(pf)}`,
      `$svc = ${q(svcDir)}`,
      `$name = ${q(SERVICE_NAME)}`,
      "# Re-verify the archive against the upstream hash before trusting it.",
      "if ((Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash -ne $sha.ToUpper()) { exit 3 }",
      "$tar = Join-Path $env:SystemRoot 'System32\\tar.exe'",
      "if (Get-Service -Name $name -ErrorAction SilentlyContinue) {",
      "  & $env:SystemRoot\\System32\\sc.exe stop $name | Out-Null",
      "  Start-Sleep -Milliseconds 800",
      "  & $env:SystemRoot\\System32\\sc.exe delete $name | Out-Null",
      "  Start-Sleep -Milliseconds 800",
      "}",
      "if (Test-Path $pf) { Remove-Item -LiteralPath $pf -Recurse -Force }",
      "New-Item -ItemType Directory -Force -Path $pf | Out-Null",
      "& $tar -xf $zip -C $pf",
      "if ($LASTEXITCODE -ne 0) { exit 4 }",
      "$lists = Join-Path $svc 'lists'",
      "New-Item -ItemType Directory -Force -Path $lists | Out-Null",
      listWrites,
      `New-Service -Name $name -BinaryPathName ${q(binPath)} -DisplayName 'Patrium Zapret' -StartupType Manual -Description 'zapret-discord-youtube (Flowseal) managed by Patrium' | Out-Null`,
      `& $env:SystemRoot\\System32\\sc.exe sdset $name ${q(sddl)} | Out-Null`,
      "if ($LASTEXITCODE -ne 0) { exit 5 }",
      "# Several strategies rely on TCP timestamps, like service.bat's tcp_enable.",
      "& $env:SystemRoot\\System32\\netsh.exe interface tcp set global timestamps=enabled | Out-Null",
      "exit 0",
    ].join("\n");

    const { accepted, exitCode } =
      await lazy.PatriumDownloader.runElevatedPowerShell(script, { wait: true });
    if (!accepted) {
      return { ok: false, declined: true };
    }
    if (exitCode != 0) {
      const reasons = {
        3: "the downloaded archive failed its integrity check",
        4: "the archive could not be extracted",
        5: "the service permissions could not be set",
      };
      return {
        ok: false,
        error: reasons[exitCode] ?? `setup failed (code ${exitCode})`,
      };
    }
    Services.prefs.setStringPref(
      PREF_SERVICE_CONFIG,
      JSON.stringify({ version: this.version, strategy })
    );
    return { ok: true };
  }

  #serviceMatchesSettings(strategy) {
    try {
      const config = JSON.parse(
        Services.prefs.getStringPref(PREF_SERVICE_CONFIG, "{}")
      );
      return config.version == this.version && config.strategy == strategy;
    } catch {
      return false;
    }
  }

  async #sc(command) {
    return lazy.PatriumDownloader.run(system32("sc.exe"), [
      command,
      SERVICE_NAME,
    ]);
  }

  async start() {
    if (this.#busy) {
      return;
    }
    const strategies = await this.listStrategies();
    const strategy = strategies.includes(this.strategy)
      ? this.strategy
      : strategies[0];
    if (!strategy) {
      this.#setState("error", "No strategy files found");
      return;
    }
    this.#busy = true;
    this.#setState("starting");
    try {
      if (
        (await this.serviceState()) === null ||
        !this.#serviceMatchesSettings(strategy)
      ) {
        const result = await this.configureService(strategy);
        if (!result.ok) {
          if (result.error) {
            this.#setState("error", result.error);
          } else {
            await this.refresh(); // UAC declined.
          }
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
    } finally {
      this.#setBusy(false);
    }
  }

  async stop() {
    if (this.#busy) {
      return;
    }
    this.#busy = true;
    this.#setState("stopping");
    try {
      const { exitCode, output } = await this.#sc("stop");
      if (exitCode != 0 && exitCode != ERROR_SERVICE_NOT_ACTIVE) {
        throw new Error(`sc stop failed (${exitCode}): ${output.trim()}`);
      }
      await this.#waitFor(false);
    } catch (e) {
      console.error("Patrium: failed to stop zapret", e);
      this.#setState("error", e.message);
    } finally {
      this.#setBusy(false);
    }
  }

  async toggle() {
    if (this.#busy) {
      return;
    }
    if (this.#state == "on") {
      await this.stop();
    } else if (this.#state == "off" || this.#state == "error") {
      await this.start();
    }
  }

  async #waitFor(running, timeoutMs = 20000) {
    const token = ++this.#pollToken;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && token == this.#pollToken) {
      const state = await this.serviceState();
      const settled = running
        ? state == "RUNNING"
        : state != "RUNNING" && state != "STOP_PENDING";
      if (settled) {
        await this.refresh();
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (token != this.#pollToken) {
      return; // Superseded by a newer operation.
    }
    await this.refresh();
    if ((this.#state == "on") != running) {
      this.#setState(
        "error",
        running
          ? "The zapret service did not start"
          : "The zapret service did not stop"
      );
    }
  }
}

export const PatriumZapret = new PatriumZapretClass();
