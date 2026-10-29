# 공유 미리보기 이미지(1200x630) 생성. icons/icon-maskable-512.png 를 왼쪽에, 앱 이름을 오른쪽에 둔다.
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAlias'
$rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.ColorTranslator]::FromHtml('#7B5CF0')), ([System.Drawing.ColorTranslator]::FromHtml('#5236C9')), 35
$g.FillRectangle($bg, $rect)
# 아이콘 (둥근 모서리 클립)
$icon = [System.Drawing.Image]::FromFile((Join-Path $root 'icons\icon-maskable-512.png'))
$s = 380; $x = 90; $y = 125; $r = 80
$p = New-Object System.Drawing.Drawing2D.GraphicsPath
$p.AddArc($x, $y, $r, $r, 180, 90); $p.AddArc($x + $s - $r, $y, $r, $r, 270, 90)
$p.AddArc($x + $s - $r, $y + $s - $r, $r, $r, 0, 90); $p.AddArc($x, $y + $s - $r, $r, $r, 90, 90); $p.CloseFigure()
$g.SetClip($p); $g.DrawImage($icon, $x, $y, $s, $s); $g.ResetClip()
$white = [System.Drawing.Brushes]::White
$soft = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(225, 255, 255, 255))
$f1 = New-Object System.Drawing.Font 'Malgun Gothic', 88, ([System.Drawing.FontStyle]::Bold), 'Pixel'
$f2 = New-Object System.Drawing.Font 'Malgun Gothic', 36, ([System.Drawing.FontStyle]::Regular), 'Pixel'
$g.DrawString('English', $f1, $white, 520, 190)
$g.DrawString("유아부터 직장인까지`n단어 · 문법 · 회화를 게임처럼", $f2, $soft, 526, 330)
$out = Join-Path $root 'icons\og-image.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $icon.Dispose()
Write-Host "saved $out"
