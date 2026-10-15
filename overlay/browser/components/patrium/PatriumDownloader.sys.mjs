/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
});

/**
 * Shared helpers for the Patrium components that fetch third-party tools
 * (zapret, Tor) on demand into the local profile directory.
 */
export const PatriumDownloader = {
  get toolsDir() {
    return PathUtils.join(PathUtils.localProfileDir, "patrium-tools");
  },

  async fetchJSON(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
  },

  async fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.text();
  },

  sha256Hex(bytes) {
    const hasher = Cc["@mozilla.org/security/hash;1"].createInstance(
      Ci.nsICryptoHash
    );
    hasher.init(Ci.nsICryptoHash.SHA256);
    hasher.update(bytes, bytes.length);
    const binary = hasher.finish(false);
    return Array.from(binary, c =>
      c.charCodeAt(0).toString(16).padStart(2, "0")
    ).join("");
  },

  /**
   * Downloads url into destPath, refusing the file unless its SHA-256 matches
   * expectedSha256 (lowercase hex).
   */
  async downloadVerified(url, destPath, expectedSha256) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = this.sha256Hex(bytes);
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

  /**
   * Runs an executable elevated through UAC, hidden. Without `wait`, resolves
   * to true if the user accepted the prompt. With `wait`, resolves to true
   * only if the elevated process also exited with code 0.
   */
  async runElevated(file, args = [], { workingDirectory, wait = false } = {}) {
    const quote = s => `'${String(s).replace(/'/g, "''")}'`;
    // Start-Process passes a single string through verbatim, so quote each
    // argument for the Windows command line ourselves.
    const commandLine = args
      .map(a => (/[\s"]/.test(a) ? `"${String(a).replace(/"/g, '\\"')}"` : a))
      .join(" ");
    let script =
      `$p = Start-Process -FilePath ${quote(file)} -Verb RunAs -WindowStyle Hidden -PassThru` +
      (args.length ? ` -ArgumentList ${quote(commandLine)}` : "") +
      (workingDirectory
        ? ` -WorkingDirectory ${quote(workingDirectory)}`
        : "") +
      (wait ? " -Wait; exit $p.ExitCode" : "");
    const powershell = PathUtils.join(
      Services.dirsvc.get("SysD", Ci.nsIFile).path,
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe"
    );
    const { exitCode } = await this.run(powershell, [
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-Command",
      script,
    ]);
    return exitCode == 0;
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
