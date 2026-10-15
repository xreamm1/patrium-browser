/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
});

// AbortSignal.timeout is not exposed in the system-module global, so build an
// abortable timeout from AbortController, which is.
export function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  controller.signal.addEventListener("abort", () => clearTimeout(timer), {
    once: true,
  });
  return controller.signal;
}

/**
 * Shared helpers for the Patrium components that fetch third-party tools
 * (zapret, Tor) on demand into the local profile directory.
 */
export const PatriumDownloader = {
  get toolsDir() {
    return PathUtils.join(PathUtils.localProfileDir, "patrium-tools");
  },

  // 60s network timeout so a stalled download can't wedge a flow forever.
  fetch(url, options = {}) {
    return fetch(url, {
      cache: "no-store",
      signal: timeoutSignal(60000),
      ...options,
    });
  },

  async fetchJSON(url) {
    const response = await this.fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
  },

  async fetchText(url) {
    const response = await this.fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.text();
  },

  // WebCrypto hashes on a background thread, unlike nsICryptoHash on the main
  // thread, so a large installer doesn't jank the UI.
  async sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), b =>
      b.toString(16).padStart(2, "0")
    ).join("");
  },

  /**
   * Downloads url into destPath, refusing the file unless its SHA-256 matches
   * expectedSha256 (lowercase hex).
   */
  async downloadVerified(url, destPath, expectedSha256) {
    const response = await this.fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = await this.sha256Hex(bytes);
    if (actual != expectedSha256.toLowerCase()) {
      throw new Error(
        `Checksum mismatch for ${url}: expected ${expectedSha256}, got ${actual}`
      );
    }
    await IOUtils.makeDirectory(PathUtils.parent(destPath));
    await IOUtils.write(destPath, bytes);
    return destPath;
  },

  /**
   * Extracts a .zip or .tar.gz archive with the tar.exe shipped in
   * Windows 10+ (bsdtar handles both formats).
   */
  async extract(archivePath, destDir) {
    await IOUtils.makeDirectory(destDir);
    const tar = PathUtils.join(
      Services.dirsvc.get("SysD", Ci.nsIFile).path,
      "tar.exe"
    );
    const { exitCode, output } = await this.run(tar, [
      "-xf",
      archivePath,
      "-C",
      destDir,
    ]);
    if (exitCode != 0) {
      throw new Error(`tar failed (${exitCode}): ${output}`);
    }
  },

  async run(command, args, options = {}) {
    const proc = await lazy.Subprocess.call({
      command,
      arguments: args,
      stderr: "stdout",
      ...options,
    });
    let output = "";
    let chunk;
    while ((chunk = await proc.stdout.readString())) {
      output += chunk;
    }
    const { exitCode } = await proc.wait();
    return { exitCode, output };
  },

  get powershellPath() {
    return PathUtils.join(
      Services.dirsvc.get("SysD", Ci.nsIFile).path,
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe"
    );
  },

  // Base64 of the UTF-16LE encoding of a script, as PowerShell -EncodedCommand
  // expects. Iterates code units so surrogate pairs survive.
  encodePowerShell(script) {
    let binary = "";
    for (let i = 0; i < script.length; i++) {
      const code = script.charCodeAt(i);
      binary += String.fromCharCode(code & 0xff, code >> 8);
    }
    return btoa(binary);
  },

  /**
   * Runs a PowerShell script elevated through a single UAC prompt, hidden.
   * The script is passed as -EncodedCommand (no temp file on disk, so it
   * cannot be swapped between writing it and the elevated run).
   *
   * @returns {Promise<{accepted: boolean, exitCode: number}>}
   *   accepted is false when the user dismissed the UAC prompt. Otherwise
   *   exitCode is the script's own exit code.
   */
  async runElevatedPowerShell(script, { wait = true } = {}) {
    const CANCELLED = 1223; // ERROR_CANCELLED, when the UAC prompt is declined.
    const encoded = this.encodePowerShell(script);
    const inner =
      `@('-NoProfile','-NonInteractive','-WindowStyle','Hidden'` +
      `,'-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}')`;
    const launcher = [
      "$ErrorActionPreference='Stop'",
      "try {",
      `  $p = Start-Process -FilePath '${this.powershellPath.replace(/'/g, "''")}'` +
        ` -Verb RunAs -WindowStyle Hidden -PassThru${wait ? " -Wait" : ""} -ArgumentList ${inner}`,
      wait ? "  exit $p.ExitCode" : "  exit 0",
      "} catch {",
      `  exit ${CANCELLED}`,
      "}",
    ].join("\n");
    const { exitCode } = await this.run(this.powershellPath, [
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-Command",
      launcher,
    ]);
    return { accepted: exitCode != CANCELLED, exitCode };
  },

  // The SID of the user Firefox runs as, e.g. "S-1-5-21-...-1001".
  async currentUserSid() {
    const whoami = PathUtils.join(
      Services.dirsvc.get("SysD", Ci.nsIFile).path,
      "whoami.exe"
    );
    const { output } = await this.run(whoami, ["/user", "/fo", "list"]);
    // Matches classic (S-1-5-21-...) and Azure AD / Entra (S-1-12-1-...) SIDs.
    return output.match(/S-1-\d+(?:-\d+)+/)?.[0] ?? null;
  },

  async isProcessRunning(imageName) {
    const tasklist = PathUtils.join(
      Services.dirsvc.get("SysD", Ci.nsIFile).path,
      "tasklist.exe"
    );
    const { output } = await this.run(tasklist, [
      "/FI",
      `IMAGENAME eq ${imageName}`,
      "/NH",
    ]);
    return output.toLowerCase().includes(imageName.toLowerCase());
  },

  /**
   * Returns the first file named fileName below dir (breadth-first).
   */
  async findFile(dir, fileName) {
    const queue = [dir];
    while (queue.length) {
      const current = queue.shift();
      let children;
      try {
        children = await IOUtils.getChildren(current);
      } catch {
        continue;
      }
      for (const child of children) {
        if (PathUtils.filename(child).toLowerCase() == fileName.toLowerCase()) {
          return child;
        }
      }
      for (const child of children) {
        const info = await IOUtils.stat(child);
        if (info.type == "directory") {
          queue.push(child);
        }
      }
    }
    return null;
  },
};
