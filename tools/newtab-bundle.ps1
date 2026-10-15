# Rebuilds the Firefox new-tab (activity-stream) bundle after editing its
# React/SCSS source. The main build packages this prebuilt artifact, so run
# this whenever you change browser/extensions/newtab/content-src, then build.
#
# One-time setup (installs node deps, skipping the root ts-patch prepare hook
# that is unrelated to bundling):
#   cd src\browser\extensions\newtab
#   & "$env:USERPROFILE\.mozbuild\node\npm.cmd" install --ignore-scripts
#
# Usage: powershell -ExecutionPolicy Bypass -File tools\newtab-bundle.ps1
$ErrorActionPreference = "Stop"
$nt = Join-Path $PSScriptRoot "..\src\browser\extensions\newtab"
$node = Join-Path $env:USERPROFILE ".mozbuild\node"
$env:PATH = "$node;$env:PATH"
Push-Location $nt
try {
    & "$nt\node_modules\.bin\webpack-cli.cmd" --config webpack.system-addon.config.js
    & "$nt\node_modules\.bin\sass.cmd" content-src/styles:css --no-source-map
    & "$node\node.exe" ./bin/render-activity-stream-html.js
    "new-tab bundle rebuilt"
} finally {
    Pop-Location
}
