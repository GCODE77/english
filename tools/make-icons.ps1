# 앱 아이콘 생성 (Windows 내장 System.Drawing 사용, 외부 패키지 없음)
# 사용:  powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1
# 디자인: 깊은 남색 그라데이션 바탕 + 금색 그라데이션 세리프 'E' 모노그램 + 작은 반짝임
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'icons'

function C([string]$hex, [int]$a = 255) {
  $h = $hex.TrimStart('#')
  [System.Drawing.Color]::FromArgb($a, [Convert]::ToInt32($h.Substring(0,2),16), [Convert]::ToInt32($h.Substring(2,2),16), [Convert]::ToInt32($h.Substring(4,2),16))
}
function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}
function Sparkle([float]$cx, [float]$cy, [float]$r) {
  # 네 갈래 별 (긴 팔 r, 안쪽 0.26r)
  $pts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
  for ($i = 0; $i -lt 8; $i++) {
    $ang = [Math]::PI / 4 * $i - [Math]::PI / 2
    $rr = if ($i % 2 -eq 0) { $r } else { $r * 0.26 }
    $pts.Add((New-Object System.Drawing.PointF ([float]($cx + $rr * [Math]::Cos($ang))), ([float]($cy + $rr * [Math]::Sin($ang)))))
  }
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddPolygon($pts.ToArray())
  return $p
}

function New-Icon([int]$size, [string]$name, [bool]$fullBleed, [double]$glyphScale) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = [float]$size

  # 1) 바탕: 남색 대각선 그라데이션 (전체 채움 또는 둥근 사각형)
  $bg = if ($fullBleed) { $p = New-Object System.Drawing.Drawing2D.GraphicsPath; $p.AddRectangle((New-Object System.Drawing.RectangleF 0, 0, $s, $s)); $p } else { RoundRect 0 0 $s $s ($s * 0.225) }
  $lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, 0), (New-Object System.Drawing.PointF $s, $s), (C '#26365E'), (C '#0A1022')
  $g.FillPath($lg, $bg)
  # 왼쪽 위의 은은한 빛
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse([float](-0.75 * $s), [float](-0.95 * $s), [float](1.9 * $s), [float](1.75 * $s))
  $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush $glow
  $pg.CenterColor = (C '#FFFFFF' 26); $pg.SurroundColors = @((C '#FFFFFF' 0))
  $g.SetClip($bg); $g.FillPath($pg, $glow); $g.ResetClip()

  # 2) 금색 테두리 (둥근 사각형 아이콘만)
  if (-not $fullBleed) {
    $inset = $s * 0.055
    $ring = RoundRect $inset $inset ($s - 2 * $inset) ($s - 2 * $inset) ($s * 0.18)
    $pen = New-Object System.Drawing.Pen (C '#D9B860' 150), ([float]($s * 0.011))
    $g.DrawPath($pen, $ring)
  }

  # 3) 모노그램 'E' (Bodoni MT Bold, 금색 세로 그라데이션)
  $fam = New-Object System.Drawing.FontFamily 'Bodoni MT'
  $tp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $tp.AddString('E', $fam, [int][System.Drawing.FontStyle]::Bold, [float]1000, (New-Object System.Drawing.PointF 0, 0), [System.Drawing.StringFormat]::GenericTypographic)
  $b = $tp.GetBounds()
  $targetH = $s * 0.50 * $glyphScale
  $k = $targetH / $b.Height
  $m = New-Object System.Drawing.Drawing2D.Matrix
  $cx = $s * 0.47; $cy = $s * 0.52                       # 반짝임 자리를 남기려고 살짝 왼쪽·아래
  $m.Translate([float]($cx - ($b.X + $b.Width / 2) * $k), [float]($cy - ($b.Y + $b.Height / 2) * $k))
  $m.Scale([float]$k, [float]$k)
  $tp.Transform($m)
  $gb = $tp.GetBounds()
  # 그림자
  $sh = $tp.Clone(); $sm = New-Object System.Drawing.Drawing2D.Matrix; $sm.Translate(0, [float]($s * 0.012)); $sh.Transform($sm)
  $g.FillPath((New-Object System.Drawing.SolidBrush (C '#000000' 70)), $sh)
  $gold = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.PointF 0, $gb.Top), (New-Object System.Drawing.PointF 0, $gb.Bottom), (C '#F7E3A3'), (C '#A87A26')
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend 3
  $blend.Colors = @((C '#FBEBB5'), (C '#D9B154'), (C '#9C6F1E')); $blend.Positions = @([float]0, [float]0.55, [float]1)
  $gold.InterpolationColors = $blend
  $g.FillPath($gold, $tp)

  # 4) 반짝임 (E 오른쪽 위)
  $r = $s * 0.075 * $glyphScale
  $sp = Sparkle ([float]($gb.Right + $s * 0.055 * $glyphScale)) ([float]($gb.Top + $s * 0.02 * $glyphScale)) $r
  $g.FillPath((New-Object System.Drawing.SolidBrush (C '#F7E3A3')), $sp)
  $sp2 = Sparkle ([float]($gb.Right + $s * 0.13 * $glyphScale)) ([float]($gb.Top + $s * 0.13 * $glyphScale)) ([float]($r * 0.42))
  $g.FillPath((New-Object System.Drawing.SolidBrush (C '#F7E3A3' 200)), $sp2)

  $path = Join-Path $outDir $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  "{0,-24} {1}x{1}" -f $name, $size
}

New-Icon 512 'icon-512.png'          $false 1.0
New-Icon 192 'icon-192.png'          $false 1.0
New-Icon 512 'icon-maskable-512.png' $true  0.78   # 안드로이드가 원·둥근 모양으로 잘라도 글자가 안전 영역(지름 80%) 안에 있게
New-Icon 180 'apple-touch-icon.png'  $true  0.92   # 아이폰은 투명 배경을 검게 칠하므로 전체를 채운다
New-Icon 32  'favicon-32.png'        $false 1.0
