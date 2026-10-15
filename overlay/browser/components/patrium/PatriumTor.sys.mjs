/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PatriumDownloader:
    "moz-src:///browser/components/patrium/PatriumDownloader.sys.mjs",
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
});

const DOWNLOADS_JSON =
  "https://aus1.torproject.org/torbrowser/update_3/release/downloads.json";
const DIST_BASE = "https://dist.torproject.org/torbrowser";
const CHECKSUM_FILES = [
  "sha256sums-unsigned-build.txt",
  "sha256sums-signed-build.txt",
];

const PREF_INSTALLED_DIR = "patrium.tor.installedDir";
const PREF_VERSION = "patrium.tor.version";
const PREF_BRIDGES = "patrium.tor.bridges";
const PREF_SOCKS_PORT = "patrium.tor.socksPort";
const PREF_SAVED_PROXY = "patrium.tor.savedProxy";

// Prefs overridden while Tor is on; their previous values are saved in
// PREF_SAVED_PROXY so they can be restored even after a crash.
const PROXY_PREFS = {
  "network.proxy.type": 1,
  "network.proxy.socks": "127.0.0.1",
  "network.proxy.socks_port": 0,
  "network.proxy.socks_version": 5,
  "network.proxy.socks_remote_dns": true, // SOCKS4 remote DNS (legacy)
  "network.proxy.socks5_remote_dns": true, // SOCKS5 remote DNS (the one in use)
  "network.proxy.share_proxy_settings": false,
  "network.proxy.http": "",
  "network.proxy.ssl": "",
  "network.trr.mode": 5, // Disable DoH; DNS must go through Tor.
  "media.peerconnection.ice.proxy_only_if_behind_proxy": true,
  "media.peerconnection.ice.no_host": true, // No local IP via WebRTC.
};

/**
 * Runs a private tor.exe (from the Tor Expert Bundle, downloaded on first
 * use) and routes the browser's traffic through its SOCKS port.
 *
 * States: "missing", "installing", "off", "starting", "on", "error".
 */
class PatriumTorClass {
  #state = "off";
  #error = null;
  #progress = 0;
  #proc = null;
  #listeners = new Set();
  #stopping = false;
  #startToken = 0;

  get state() {
    return this.#state;
  }

  get error() {
    return this.#error;
  }

  get progress() {
    return this.#progress;
  }

  // True whenever the browser's traffic is routed through Tor's proxy,
  // including a failed-closed state after a crash. The UI uses this to keep a
  // "Disconnect" action available so the user is never stuck offline.
  get routing() {
    return Services.prefs.prefHasUserValue(PREF_SAVED_PROXY);
  }

  get installedDir() {
    return Services.prefs.getStringPref(PREF_INSTALLED_DIR, "");
  }

  get version() {
    return Services.prefs.getStringPref(PREF_VERSION, "");
  }

  get bridges() {
    return Services.prefs.getStringPref(PREF_BRIDGES, "snowflake");
  }

  set bridges(value) {
    Services.prefs.setStringPref(PREF_BRIDGES, value);
  }

  get socksPort() {
    return Services.prefs.getIntPref(PREF_SOCKS_PORT, 9350);
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

  async init() {
    this.#restoreProxy();
    Services.obs.addObserver(this, "quit-application");
    this.#setState((await this.isInstalled()) ? "off" : "missing");
  }

  observe(subject, topic) {
    if (topic == "quit-application") {
      this.#restoreProxy();
      this.#proc?.kill();
    }
  }

  async isInstalled() {
    const dir = this.installedDir;
    return !!dir && !!(await lazy.PatriumDownloader.findFile(dir, "tor.exe"));
  }

  async install() {
    this.#setState("installing");
    try {
      const { version } =
        await lazy.PatriumDownloader.fetchJSON(DOWNLOADS_JSON);
      const fileName = `tor-expert-bundle-windows-x86_64-${version}.tar.gz`;
      const sha256 = await this.#findChecksum(version, fileName);

      const toolsDir = PathUtils.join(lazy.PatriumDownloader.toolsDir, "tor");
      const archive = PathUtils.join(toolsDir, fileName);
      await lazy.PatriumDownloader.downloadVerified(
        `${DIST_BASE}/${version}/${fileName}`,
        archive,
        sha256
      );
      const extractDir = PathUtils.join(toolsDir, version);
      await IOUtils.remove(extractDir, { recursive: true, ignoreAbsent: true });
      await lazy.PatriumDownloader.extract(archive, extractDir);
      await IOUtils.remove(archive);

      if (!(await lazy.PatriumDownloader.findFile(extractDir, "tor.exe"))) {
        throw new Error("Unexpected archive layout: tor.exe not found");
      }
      const previous = this.installedDir;
      Services.prefs.setStringPref(PREF_INSTALLED_DIR, extractDir);
      Services.prefs.setStringPref(PREF_VERSION, version);
      if (previous && previous != extractDir && !this.#proc) {
        await IOUtils.remove(previous, {
          recursive: true,
          ignoreAbsent: true,
        }).catch(console.error);
      }
      this.#setState("off");
    } catch (e) {
      console.error("Patrium: Tor install failed", e);
      this.#setState("error", e.message);
    }
  }

  async #findChecksum(version, fileName) {
    for (const list of CHECKSUM_FILES) {
      let text;
      try {
        text = await lazy.PatriumDownloader.fetchText(
          `${DIST_BASE}/${version}/${list}`
        );
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        const [hash, name] = line.trim().split(/\s+/);
        if (name == fileName && /^[0-9a-f]{64}$/i.test(hash)) {
          return hash;
        }
      }
    }
    throw new Error(`No published checksum for ${fileName}`);
  }

  // tor on Windows accepts forward slashes, and quoting handles spaces and
  // "#" in a config value. The ClientTransportPlugin "exec" path, though, is
  // split on whitespace with no quoting, so it must be relative to the working
  // directory (tor.exe's folder) and therefore free of spaces.
  #quoteTorPath(absolutePath) {
    return `"${absolutePath.replaceAll("\\", "/")}"`;
  }

  #relativeToWorkdir(workdir, target) {
    const w = workdir.replace(/[\\/]+$/, "");
    if (!target.toLowerCase().startsWith(w.toLowerCase() + "\\")) {
      return null;
    }
    return target.slice(w.length + 1).replaceAll("\\", "/");
  }

  async #buildTorrc(torExe) {
    const dir = this.installedDir;
    const workdir = PathUtils.parent(torExe);
    const find = name => lazy.PatriumDownloader.findFile(dir, name);
    const dataDir = PathUtils.join(PathUtils.localProfileDir, "patrium-tor");
    await IOUtils.makeDirectory(dataDir);

    const lines = [
      `SocksPort 127.0.0.1:${this.socksPort}`,
      `DataDirectory ${this.#quoteTorPath(dataDir)}`,
      "ClientOnly 1",
      "AvoidDiskWrites 1",
      "Log notice stdout",
      // Make tor exit if Patrium dies, so it never lingers holding the port.
      `__OwningControllerProcess ${Services.appinfo.processID}`,
    ];
    const geoip = await find("geoip");
    const geoip6 = await find("geoip6");
    if (geoip) {
      lines.push(`GeoIPFile ${this.#quoteTorPath(geoip)}`);
    }
    if (geoip6) {
      lines.push(`GeoIPv6File ${this.#quoteTorPath(geoip6)}`);
    }

    const bridgeType = this.bridges;
    if (bridgeType != "none") {
      const ptConfigPath = await find("pt_config.json");
      if (!ptConfigPath) {
        throw new Error("pt_config.json not found in the Tor bundle");
      }
      const ptConfig = await IOUtils.readJSON(ptConfigPath);
      const ptDirAbs = PathUtils.parent(ptConfigPath);
      const relPtDir = this.#relativeToWorkdir(workdir, ptDirAbs);
      // Relative (no spaces) for the exec line; absolute fallback otherwise.
      const ptPath = relPtDir !== null ? relPtDir + "/" : ptDirAbs + "\\";
      const bridgeKey = Object.keys(ptConfig.bridges ?? {}).find(
        key => key == bridgeType || key.startsWith(`${bridgeType}-`)
      );
      const bridgeLines = bridgeKey && ptConfig.bridges[bridgeKey];
      if (!bridgeLines?.length) {
        throw new Error(`No built-in "${bridgeType}" bridges`);
      }
      lines.push("UseBridges 1");
      for (const value of Object.values(ptConfig.pluggableTransports ?? {})) {
        lines.push(
          value
            .replaceAll("${pt_path}", ptPath)
            .replaceAll("${pt_extension}", ".exe")
        );
      }
      for (const bridge of bridgeLines) {
        lines.push(`Bridge ${bridge}`);
      }
    }

    const torrc = PathUtils.join(dataDir, "torrc");
    await IOUtils.writeUTF8(torrc, lines.join("\n") + "\n");
    return torrc;
  }

  async start() {
    if (this.#proc) {
      return;
    }
    this.#progress = 0;
    this.#stopping = false;
    const token = ++this.#startToken;
    // We still own proxy/state only if no stop() or newer start() has bumped
    // the token. If superseded, the other call owns them — we just bow out.
    const current = () => token == this.#startToken && !this.#stopping;
    this.#setState("starting");
    try {
      const torExe = await lazy.PatriumDownloader.findFile(
        this.installedDir,
        "tor.exe"
      );
      if (!torExe) {
        throw new Error("tor.exe not found in the Tor bundle");
      }
      const torrc = await this.#buildTorrc(torExe);
      if (!current()) {
        return; // stop() already restored; a newer start() owns the proxy.
      }
      // Fail closed: route through Tor from the moment it is enabled, so
      // traffic cannot leak directly while bootstrapping or if tor dies.
      this.#applyProxy();
      const proc = await lazy.Subprocess.call({
        command: torExe,
        arguments: ["-f", torrc],
        workdir: PathUtils.parent(torExe),
        stderr: "stdout",
      });
      if (!current()) {
        proc.kill(); // Abandon this launch; don't touch proxy/state.
        return;
      }
      this.#proc = proc;
      this.#readOutput(this.#proc);
    } catch (e) {
      console.error("Patrium: failed to start Tor", e);
      if (!current()) {
        return; // A newer stop()/start() owns proxy and state now.
      }
      this.#proc = null;
      this.#restoreProxy();
      this.#setState("error", e.message);
    }
  }

  async #readOutput(proc) {
    let buffer = "";
    let lastError = null;
    let chunk;
    while ((chunk = await proc.stdout.readString())) {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) != -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        const match = line.match(/Bootstrapped (\d+)%/);
        if (match) {
          this.#progress = parseInt(match[1], 10);
          if (this.#progress == 100) {
            this.#setState("on");
          } else {
            this.#notify();
          }
        } else if (/\[(err|warn)\]/.test(line)) {
          lastError = line.replace(/^.*\[(err|warn)\]\s*/, "");
        }
      }
    }
    const { exitCode } = await proc.wait();
    if (this.#proc == proc) {
      this.#proc = null;
    }
    if (this.#stopping) {
      this.#restoreProxy();
      this.#setState("off");
    } else {
      // Fail closed: keep the proxy pointed at the now-dead Tor rather than
      // letting traffic fall back to a direct connection. Disconnect restores.
      this.#setState("error", lastError ?? `tor.exe exited (${exitCode})`);
    }
  }

  async stop() {
    this.#stopping = true;
    this.#startToken++; // Supersede any in-flight start().
    this.#restoreProxy();
    if (this.#proc) {
      this.#proc.kill();
    } else {
      this.#setState("off");
    }
  }

  async toggle() {
    // If the proxy is applied (on, connecting, or failed-closed after a crash)
    // a toggle should tear it down; only start when nothing is routed.
    if (
      this.#state == "on" ||
      this.#state == "starting" ||
      (this.#state == "error" &&
        Services.prefs.prefHasUserValue(PREF_SAVED_PROXY))
    ) {
      await this.stop();
    } else {
      await this.start();
    }
  }

  #applyProxy() {
    if (Services.prefs.prefHasUserValue(PREF_SAVED_PROXY)) {
      return;
    }
    const saved = {};
    for (const name of Object.keys(PROXY_PREFS)) {
      saved[name] = Services.prefs.prefHasUserValue(name)
        ? this.#getPref(name)
        : null;
    }
    Services.prefs.setStringPref(PREF_SAVED_PROXY, JSON.stringify(saved));
    for (const [name, value] of Object.entries(PROXY_PREFS)) {
      this.#setPref(
        name,
        name == "network.proxy.socks_port" ? this.socksPort : value
      );
    }
    // Drop sockets opened directly so nothing keeps bypassing Tor.
    Services.obs.notifyObservers(null, "net:prune-all-connections");
  }

  #restoreProxy() {
    if (!Services.prefs.prefHasUserValue(PREF_SAVED_PROXY)) {
      return;
    }
    let saved = {};
    try {
      saved = JSON.parse(Services.prefs.getStringPref(PREF_SAVED_PROXY));
    } catch (e) {
      console.error(e);
    }
    for (const name of Object.keys(PROXY_PREFS)) {
      if (saved[name] === null || saved[name] === undefined) {
        Services.prefs.clearUserPref(name);
      } else {
        this.#setPref(name, saved[name]);
      }
    }
    Services.prefs.clearUserPref(PREF_SAVED_PROXY);
    Services.obs.notifyObservers(null, "net:prune-all-connections");
  }

  #getPref(name) {
    switch (Services.prefs.getPrefType(name)) {
      case Ci.nsIPrefBranch.PREF_INT:
        return Services.prefs.getIntPref(name);
      case Ci.nsIPrefBranch.PREF_BOOL:
        return Services.prefs.getBoolPref(name);
      default:
        return Services.prefs.getStringPref(name, "");
    }
  }

  #setPref(name, value) {
    if (typeof value == "number") {
      Services.prefs.setIntPref(name, value);
    } else if (typeof value == "boolean") {
      Services.prefs.setBoolPref(name, value);
    } else {
      Services.prefs.setStringPref(name, value);
    }
  }
}

export const PatriumTor = new PatriumTorClass();
