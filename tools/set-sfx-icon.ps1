# Writes a copy of Mozilla's 7-Zip SFX installer stub with the Patrium icon.
# Usage: powershell -ExecutionPolicy Bypass -File tools\set-sfx-icon.ps1
param(
    [string]$Source = "$PSScriptRoot\..\src\other-licenses\7zstub\firefox\7zSD.Win32.sfx",
    [string]$Dest = "$PSScriptRoot\..\src\other-licenses\7zstub\patrium\7zSD.Win32.sfx",
    [string]$Icon = "$PSScriptRoot\..\branding-src\patrium.ico"
)
$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ResUpdate {
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern IntPtr BeginUpdateResource(string file, bool deleteExisting);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool UpdateResource(IntPtr h, IntPtr type, IntPtr name, ushort lang, byte[] data, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool EndUpdateResource(IntPtr h, bool discard);
}
"@

$RT_ICON = [IntPtr]3
$RT_GROUP_ICON = [IntPtr]14
$LANG = 1033

New-Item -ItemType Directory -Force (Split-Path $Dest) | Out-Null
Copy-Item $Source $Dest -Force
$Dest = (Resolve-Path $Dest).Path

# Parse the .ico: ICONDIR (6 bytes) + ICONDIRENTRY (16 bytes) per image.
$ico = [IO.File]::ReadAllBytes((Resolve-Path $Icon).Path)
$count = [BitConverter]::ToUInt16($ico, 4)
$group = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $group
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$count)

$h = [ResUpdate]::BeginUpdateResource($Dest, $false)
if ($h -eq [IntPtr]::Zero) { throw "BeginUpdateResource failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
for ($i = 0; $i -lt $count; $i++) {
    $e = 6 + 16 * $i
    $size = [BitConverter]::ToUInt32($ico, $e + 8)
    $offset = [BitConverter]::ToUInt32($ico, $e + 12)
    $data = New-Object byte[] $size
    [Array]::Copy($ico, $offset, $data, 0, $size)
    $id = $i + 1
    if (-not [ResUpdate]::UpdateResource($h, $RT_ICON, [IntPtr]$id, $LANG, $data, $size)) {
        throw "UpdateResource(icon $id) failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    }
    # GRPICONDIRENTRY: same first 12 bytes as ICONDIRENTRY, then a WORD id.
    $w.Write($ico, $e, 12)
    $w.Write([UInt16]$id)
}
$w.Flush()
$groupBytes = $group.ToArray()
if (-not [ResUpdate]::UpdateResource($h, $RT_GROUP_ICON, [IntPtr]1, $LANG, $groupBytes, [uint32]$groupBytes.Length)) {
    throw "UpdateResource(group) failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}
if (-not [ResUpdate]::EndUpdateResource($h, $false)) {
    throw "EndUpdateResource failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}
"Patrium SFX stub written to $Dest"
