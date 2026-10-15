# Renders four candidate Patrium icon concepts side by side for review.
# Usage: powershell -ExecutionPolicy Bypass -File tools\icon-concepts.ps1 -Out branding-src\concepts.png
param([string]$Out = "$PSScriptRoot\..\branding-src\concepts.png")

Add-Type -AssemblyName System.Drawing
. "$PSScriptRoot\icon-shapes.ps1"

$cell = 256; $gap = 40; $labelH = 50
$sheet = New-Object System.Drawing.Bitmap (4 * $cell + 5 * $gap), ($cell + 2 * $gap + $labelH)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::FromArgb(255, 245, 245, 248))
$font = New-Object System.Drawing.Font 'Segoe UI Semibold', 22, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$names = @('A', 'B', 'C', 'D')
for ($i = 0; $i -lt 4; $i++) {
    $icon = New-PatriumConcept $names[$i] $cell
    $x = $gap + $i * ($cell + $gap)
    $g.DrawImage($icon, $x, $gap, $cell, $cell)
    $icon.Dispose()
    $sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'
    $g.DrawString($names[$i], $font, [System.Drawing.Brushes]::DimGray, (New-Object System.Drawing.RectangleF $x, ($gap + $cell + 10), $cell, $labelH), $sf)
}
$g.Dispose()
$sheet.Save((Join-Path (Resolve-Path (Split-Path $Out)) (Split-Path $Out -Leaf)), [System.Drawing.Imaging.ImageFormat]::Png)
"Saved $Out"
