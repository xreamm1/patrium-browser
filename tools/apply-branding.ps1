# Creates/refreshes browser/branding/patrium from the "unofficial" template.
# Safe to re-run after updating the Firefox source.
# Usage: powershell -ExecutionPolicy Bypass -File tools\apply-branding.ps1
param([string]$Src = "$PSScriptRoot\..\src")

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path "$PSScriptRoot\..").Path
$Src = (Resolve-Path $Src).Path
$Assets = "$Root\branding-src"
$B = "$Src\browser\branding\patrium"
$Name = 'Patrium'

function Edit-Text($path, [scriptblock]$fn) {
    $text = [System.IO.File]::ReadAllText($path)
    $new = & $fn $text
    [System.IO.File]::WriteAllText($path, $new, (New-Object System.Text.UTF8Encoding $false))
}

# 1. Fresh copy of the template
if (Test-Path $B) { Remove-Item -Recurse -Force $B }
Copy-Item -Recurse "$Src\browser\branding\unofficial" $B

# 2. Names
Edit-Text "$B\configure.sh" { param($t) $t -replace 'MOZ_APP_DISPLAYNAME=.*', "MOZ_APP_DISPLAYNAME=$Name" -replace 'MOZ_MACBUNDLE_ID=.*', 'MOZ_MACBUNDLE_ID=patrium' }
Edit-Text "$B\locales\en-US\brand.ftl" { param($t)
    $t -replace '(?m)^(-brand-(shorter|short|shortcut|full|product)-name) = .*$', "`$1 = $Name" `
       -replace '(?m)^-vendor-short-name = .*$', "-vendor-short-name = $Name" }
Edit-Text "$B\locales\en-US\brand.properties" { param($t) $t -replace 'Nightly', $Name }
Edit-Text "$B\branding.nsi" { param($t)
    $t -replace '(?m)^(!define BrandFullNameInternal\s+).*$', "`$1`"$Name`"" `
       -replace '(?m)^(!define BrandFullName\s+).*$', "`$1`"$Name`"" `
       -replace '(?m)^(!define CompanyName\s+).*$', "`$1`"$Name`"" }

# 3. Prefs: no Mozilla update/welcome URLs + privacy defaults
Edit-Text "$B\pref\firefox-branding.js" { param($t)
    ($t -replace '"https://nightly\.mozilla\.org"', '""') + "`n" + [System.IO.File]::ReadAllText("$Assets\privacy-prefs.js") }

# 4. Icons
& "$PSScriptRoot\make-icon.ps1" -OutDir $Assets | Out-Null
foreach ($s in 16, 22, 24, 32, 48, 64, 128, 256) { Copy-Item "$Assets\default$s.png" "$B\default$s.png" -Force }
foreach ($ico in 'firefox.ico', 'firefox64.ico') { Copy-Item "$Assets\patrium.ico" "$B\$ico" -Force }
$redraw = @(
    "$B\VisualElements_150.png", "$B\VisualElements_70.png",
    "$B\content\about.png", "$B\content\about-logo.png", "$B\content\about-logo@2x.png"
) + (Get-ChildItem "$B\msix\Assets\*.png" | ForEach-Object FullName)
& "$PSScriptRoot\make-icon.ps1" -Targets $redraw | Out-Null

# Vector logo used on about: pages
@'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7c4dff"/><stop offset="1" stop-color="#00c6d7"/>
  </linearGradient></defs>
  <rect x="10" y="10" width="236" height="236" rx="56" fill="url(#g)"/>
  <polyline points="102,72 159,128 102,184" fill="none" stroke="#fff" stroke-width="33" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'@ | Set-Content -Encoding UTF8 "$B\content\about-logo.svg"

# Installer icons: NSIS wizard/uninstaller and the 7-Zip self-extractor stub
Copy-Item "$Assets\patrium.ico" "$Src\toolkit\mozapps\installer\windows\nsis\setup.ico" -Force
& "$PSScriptRoot\set-sfx-icon.ps1" -Source "$Src\other-licenses\7zstub\firefox\7zSD.Win32.sfx" `
    -Dest "$Src\other-licenses\7zstub\patrium\7zSD.Win32.sfx" -Icon "$Assets\patrium.ico" | Out-Null

"Branding applied to $B"
