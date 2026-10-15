"""Launches Patrium under Marionette and runs a chrome-context JS snippet
from a file, printing the JSON result.

Run: tools\\mach.ps1 python /c/patrium/tools/debug_ui.py <script.js> [--visible] [--keep-profile DIR]
The script is the body of an async function; its return value is printed.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, r"C:\patrium\src\testing\marionette\client")
from marionette_driver.marionette import Marionette  # noqa: E402

EXE = os.environ.get("PATRIUM_EXE", r"C:\patrium\src\obj-patrium\dist\bin\patrium.exe")

script_path = sys.argv[1]
headless = "--visible" not in sys.argv
keep = None
if "--keep-profile" in sys.argv:
    keep = sys.argv[sys.argv.index("--keep-profile") + 1]

profile = keep or tempfile.mkdtemp(prefix="patrium-debug-")
os.makedirs(profile, exist_ok=True)
args = [EXE, "-no-remote", "-profile", profile, "--marionette", "-width", "1400", "-height", "900"]
if headless:
    args.append("-headless")
proc = subprocess.Popen(args, env={**os.environ, "MOZ_REMOTE_ALLOW_SYSTEM_ACCESS": "1"})
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
    with open(script_path, encoding="utf-8") as f:
        body = f.read()
    result = m.execute_async_script(
        "const resolve = arguments[arguments.length - 1];\n"
        "(async () => {\n" + body + "\n})().then(resolve, e => resolve({error: String(e), stack: e.stack}));"
    )
    if "--screenshot" in sys.argv:
        import base64

        out = sys.argv[sys.argv.index("--screenshot") + 1]
        with open(out, "wb") as f:
            f.write(base64.b64decode(m.screenshot()))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    m.delete_session()
finally:
    try:
        proc.terminate()
        proc.wait(timeout=20)
    except Exception:
        proc.kill()
    if not keep:
        shutil.rmtree(profile, ignore_errors=True)
