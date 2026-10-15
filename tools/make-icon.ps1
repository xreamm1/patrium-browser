# Generates Patrium icon PNGs (several sizes) and a multi-size .ico
# Usage: powershell -ExecutionPolicy Bypass -File make-icon.ps1 -OutDir <dir>
#        powershell -ExecutionPolicy Bypass -File make-icon.ps1 -Targets a.png,b.png
#          (-Targets redraws existing PNGs in place, keeping each file's dimensions)
param([string]$OutDir = "$PSScriptRoot\..\branding-src", [string[]]$Targets)

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

. "$PSScriptRoot\icon-shapes.ps1"

# Chosen concept "A": rounded square, violet -> cyan, white forward chevron.
function New-PatriumIcon([int]$size) {
    New-PatriumConcept 'A' $size
}

if ($Targets) {
    foreach ($t in $Targets) {
        $img = [System.Drawing.Image]::FromFile($t)
        $w = $img.Width; $h = $img.Height
        $img.Dispose()
        $side = [math]::Min($w, $h)
        $icon = New-PatriumIcon $side
        $canvas = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($canvas)
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($icon, [int](($w - $side) / 2), [int](($h - $side) / 2), $side, $side)
        $g.Dispose(); $icon.Dispose()
        $canvas.Save($t, [System.Drawing.Imaging.ImageFormat]::Png)
        $canvas.Dispose()
    }
    "Redrew $($Targets.Count) PNG(s)"
    return
}

$sizes = 16, 22, 24, 32, 48, 64, 128, 256, 512, 1024
$pngBytes = @{}
foreach ($s in $sizes) {
    $bmp = New-PatriumIcon $s
    $path = Join-Path $OutDir "default$s.png"
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $pngBytes[$s] = [System.IO.File]::ReadAllBytes($path)
}

# Multi-size ICO with PNG-compressed entries (supported since Vista)
$icoSizes = 16, 24, 32, 48, 64, 128, 256
$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ms
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$icoSizes.Count)
$offset = 6 + 16 * $icoSizes.Count
foreach ($s in $icoSizes) {
    $dim = if ($s -ge 256) { 0 } else { $s }
    $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([UInt16]1); $w.Write([UInt16]32)
    $w.Write([UInt32]$pngBytes[$s].Length); $w.Write([UInt32]$offset)
    $offset += $pngBytes[$s].Length
}
foreach ($s in $icoSizes) { $w.Write($pngBytes[$s]) }
$w.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $OutDir 'patrium.ico'), $ms.ToArray())
"Icons written to $OutDir"
