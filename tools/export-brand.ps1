Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root 'assets/source'
foreach ($folder in @('icons', 'assets/animation', 'assets/brand')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $root $folder) | Out-Null
}
function Export-Region($image, $rect, $size, $destination) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.DrawImage($image, [System.Drawing.Rectangle]::new(0, 0, $size, $size), $rect, [System.Drawing.GraphicsUnit]::Pixel)
  $bitmap.Save((Join-Path $root $destination), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}
$faces = [System.Drawing.Image]::FromFile((Join-Path $source 'toggle-sheet.png'))
for ($i = 0; $i -lt 2; $i++) {
  $name = @('on','off')[$i]
  $width = [int]($faces.Width / 2)
  $rect = [System.Drawing.Rectangle]::new($i * $width, 0, $width, $faces.Height)
  foreach ($size in @(16,32,48,128,512)) { Export-Region $faces $rect $size "icons/$name-$size.png" }
}
$faces.Dispose()
$poses = [System.Drawing.Image]::FromFile((Join-Path $source 'poses.png'))
for ($i = 0; $i -lt 3; $i++) {
  $width = [int]($poses.Width / 3)
  $rect = [System.Drawing.Rectangle]::new($i * $width, 0, $width, $poses.Height)
  Export-Region $poses $rect 512 ('assets/animation/' + @('approach','block','offer')[$i] + '.png')
}
$poses.Dispose()
$hearts = [System.Drawing.Image]::FromFile((Join-Path $source 'hearts.png'))
$width = [int]($hearts.Width / 3)
Export-Region $hearts ([System.Drawing.Rectangle]::new(2 * $width, 0, $width, $hearts.Height)) 512 'assets/animation/hearts.png'
$hearts.Dispose()
$logo = [System.Drawing.Image]::FromFile((Join-Path $root 'assets/brand/nuts-logo.png'))
# Pad the approved square artwork without modifying the character.
$side = [int]([Math]::Max($logo.Width, $logo.Height) * 1.12)
$padded = [System.Drawing.Bitmap]::new($side, $side)
$g = [System.Drawing.Graphics]::FromImage($padded)
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImageUnscaled($logo, [int](($side-$logo.Width)/2), [int](($side-$logo.Height)/2))
$padded.Save((Join-Path $root 'assets/brand/nuts-logo-square.png'), [System.Drawing.Imaging.ImageFormat]::Png)
foreach ($size in @(16,32,48,128)) {
  Export-Region $padded ([System.Drawing.Rectangle]::new(0,0,$side,$side)) $size "icons/logo-$size.png"
}
$g.Dispose(); $padded.Dispose(); $logo.Dispose()
Write-Output 'Exported toolbar icons, logo sizes, and animation poses.'
