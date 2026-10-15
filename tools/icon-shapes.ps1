# Patrium icon concepts. Dot-source and call New-PatriumConcept <A|B|C|D> <size>.
Add-Type -AssemblyName System.Drawing

function New-Color([string]$hex) {
    [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function New-RoundRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    $p
}

function New-PatriumConcept([string]$name, [int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)
    $s = [float]$size
    $pad = [math]::Max(1.0, $s * 0.04)
    $box = New-Object System.Drawing.RectangleF $pad, $pad, ($s - 2 * $pad), ($s - 2 * $pad)
    $white = [System.Drawing.Brushes]::White

    switch ($name) {
        'A' {
            # Rounded square, violet -> cyan, white forward chevron.
            $bg = New-RoundRectPath $pad $pad $box.Width $box.Height ($s * 0.22)
            $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $box, (New-Color '#7C4DFF'), (New-Color '#00C6D7'), 45.0
            $g.FillPath($grad, $bg)
            $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ($s * 0.13)
            $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
            $g.DrawLines($pen, [System.Drawing.PointF[]]@(
                (New-Object System.Drawing.PointF ($s * 0.40), ($s * 0.28)),
                (New-Object System.Drawing.PointF ($s * 0.62), ($s * 0.50)),
                (New-Object System.Drawing.PointF ($s * 0.40), ($s * 0.72))))
            $pen.Dispose(); $grad.Dispose(); $bg.Dispose()
        }
        'B' {
            # Blue -> teal sphere with a tilted white orbit and a satellite.
            $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $box, (New-Color '#2962FF'), (New-Color '#1DE9B6'), 60.0
            $inner = New-Object System.Drawing.RectangleF ($s * 0.14), ($s * 0.14), ($s * 0.72), ($s * 0.72)
            $g.FillEllipse($grad, $inner)
            $state = $g.Save()
            $g.TranslateTransform($s / 2, $s / 2); $g.RotateTransform(-25)
            $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ($s * 0.045)
            $g.DrawEllipse($pen, -($s * 0.46), -($s * 0.17), ($s * 0.92), ($s * 0.34))
            $g.FillEllipse($white, ($s * 0.34), -($s * 0.075), ($s * 0.15), ($s * 0.15))
            $g.Restore($state)
            $pen.Dispose(); $grad.Dispose()
        }
        'C' {
            # Faceted shield: two tones split along the vertical axis.
            $shield = New-Object System.Drawing.Drawing2D.GraphicsPath
            $top = $s * 0.08; $bottom = $s * 0.94; $l = $s * 0.14; $r = $s * 0.86; $mid = $s / 2
            $shield.AddLine($mid, $top, $r, ($s * 0.20))
            $shield.AddBezier($r, ($s * 0.20), $r, ($s * 0.62), ($s * 0.70), ($s * 0.82), $mid, $bottom)
            $shield.AddBezier($mid, $bottom, ($s * 0.30), ($s * 0.82), $l, ($s * 0.62), $l, ($s * 0.20))
            $shield.CloseFigure()
            $g.FillPath((New-Object System.Drawing.SolidBrush (New-Color '#311B92')), $shield)
            $g.SetClip((New-Object System.Drawing.RectangleF $mid, 0, $s, $s))
            $g.FillPath((New-Object System.Drawing.SolidBrush (New-Color '#7C4DFF')), $shield)
            $g.ResetClip()
            $facet = New-Object System.Drawing.Drawing2D.GraphicsPath
            $facet.AddPolygon([System.Drawing.PointF[]]@(
                (New-Object System.Drawing.PointF $mid, ($s * 0.30)),
                (New-Object System.Drawing.PointF ($s * 0.68), ($s * 0.40)),
                (New-Object System.Drawing.PointF $mid, ($s * 0.74)),
                (New-Object System.Drawing.PointF ($s * 0.32), ($s * 0.40))))
            $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 255, 255, 255))), $facet)
            $shield.Dispose(); $facet.Dispose()
        }
        'D' {
            # Violet -> pink circle with three flowing white waves.
            $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $box, (New-Color '#651FFF'), (New-Color '#FF4081'), 45.0
            $g.FillEllipse($grad, $box)
            $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ($s * 0.065)
            $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
            foreach ($i in 0..2) {
                $y = $s * (0.36 + 0.14 * $i)
                $x0 = $s * (0.24 + 0.04 * $i); $x1 = $s * (0.76 - 0.04 * $i)
                $w = ($x1 - $x0) / 2
                $g.DrawBezier($pen, $x0, $y, ($x0 + $w * 0.5), ($y - $s * 0.08), ($x0 + $w * 0.5), ($y + $s * 0.08), ($x0 + $w), $y)
                $g.DrawBezier($pen, ($x0 + $w), $y, ($x0 + $w * 1.5), ($y - $s * 0.08), ($x0 + $w * 1.5), ($y + $s * 0.08), $x1, $y)
            }
            $pen.Dispose(); $grad.Dispose()
        }
    }
    $g.Dispose()
    return $bmp
}
