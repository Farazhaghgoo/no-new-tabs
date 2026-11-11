Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root 'assets/source'
foreach ($folder in @('icons', 'assets/animation', 'assets/brand')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $root $folder) | Out-Null
}

function New-Canvas($size) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  return $bitmap, $graphics
}

# Scales $rect of $image into a $size square. Mirrored edge sampling keeps the
# border pixels from fading into transparency.
function Get-Scaled($image, $rect, $size) {
  $bitmap, $graphics = New-Canvas $size
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $attributes = [System.Drawing.Imaging.ImageAttributes]::new()
  $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
  $graphics.DrawImage($image, [System.Drawing.Rectangle]::new(0, 0, $size, $size),
    $rect.X, $rect.Y, $rect.Width, $rect.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
  $attributes.Dispose()
  $graphics.Dispose()
  return $bitmap
}

function Save-Png($bitmap, $destination) {
  $bitmap.Save((Join-Path $root $destination), [System.Drawing.Imaging.ImageFormat]::Png)
}

# Whole region, as drawn (ears and all).
function Export-Region($image, $rect, $size, $destination) {
  $bitmap = Get-Scaled $image $rect $size
  Save-Png $bitmap $destination
  $bitmap.Dispose()
}

# Region drawn at $inner px and centred on a transparent $size canvas.
function Export-Padded($image, $rect, $inner, $size, $destination) {
  $art = Get-Scaled $image $rect $inner
  $bitmap, $graphics = New-Canvas $size
  $offset = [int](($size - $inner) / 2)
  $graphics.DrawImageUnscaled($art, $offset, $offset)
  Save-Png $bitmap $destination
  $graphics.Dispose(); $bitmap.Dispose(); $art.Dispose()
}

# Only the coloured disc, filling the whole icon. The ears are clipped, so the
# face and the green/grey colour stay readable at toolbar size.
function Export-Disc($image, $cx, $cy, $radius, $size, $destination) {
  $rect = [System.Drawing.Rectangle]::new($cx - $radius, $cy - $radius, 2 * $radius, 2 * $radius)
  $art = Get-Scaled $image $rect $size
  $bitmap, $graphics = New-Canvas $size
  $brush = [System.Drawing.TextureBrush]::new($art)
  $graphics.FillEllipse($brush, 0, 0, $size, $size)
  Save-Png $bitmap $destination
  $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $art.Dispose()
}

# -------------------------------------------------------- standing icons
# Two complete standing poses; never crop the body at toolbar sizes.
$faces = [System.Drawing.Image]::FromFile((Join-Path $source 'standing-sheet.png'))
$cell = [int]($faces.Width / 2)
for ($i = 0; $i -lt 2; $i++) {
  $name = @('on', 'off')[$i]
  $rect = [System.Drawing.Rectangle]::new($i * $cell, 0, $cell, $faces.Height)
  foreach ($size in @(16, 32, 48, 128, 512)) { Export-Region $faces $rect $size "icons/$name-$size.png" }
  Export-Region $faces $rect 1024 "assets/brand/nuts-standing-$name.png"
}

# App icon uses the active standing mascot.
$happy = [System.Drawing.Rectangle]::new(0, 0, $cell, $faces.Height)
foreach ($size in @(16, 32, 48)) { Export-Region $faces $happy $size "icons/logo-$size.png" }
# Web Store guideline: 96 px of artwork inside a 128 px canvas.
Export-Padded $faces $happy 96 128 'icons/logo-128.png'
$faces.Dispose()

# ------------------------------------------------------- animation poses
$poses = [System.Drawing.Image]::FromFile((Join-Path $source 'poses.png'))
for ($i = 0; $i -lt 3; $i++) {
  $width = [int]($poses.Width / 3)
  $rect = [System.Drawing.Rectangle]::new($i * $width, 0, $width, $poses.Height)
  Export-Region $poses $rect 512 ('assets/animation/' + @('approach', 'block', 'offer')[$i] + '.png')
}
$poses.Dispose()
$hearts = [System.Drawing.Image]::FromFile((Join-Path $source 'hearts.png'))
$width = [int]($hearts.Width / 3)
Export-Region $hearts ([System.Drawing.Rectangle]::new(2 * $width, 0, $width, $hearts.Height)) 512 'assets/animation/hearts.png'
$hearts.Dispose()

# ------------------------------------------------------- full-body logo
$logo = [System.Drawing.Image]::FromFile((Join-Path $root 'assets/brand/nuts-logo.png'))
# Pad the approved square artwork without modifying the character.
$side = [int]([Math]::Max($logo.Width, $logo.Height) * 1.12)
$padded = [System.Drawing.Bitmap]::new($side, $side)
$g = [System.Drawing.Graphics]::FromImage($padded)
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImageUnscaled($logo, [int](($side - $logo.Width) / 2), [int](($side - $logo.Height) / 2))
$padded.Save((Join-Path $root 'assets/brand/nuts-logo-square.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $padded.Dispose()
# Web-sized copy for the README and preview page.
Export-Region $logo ([System.Drawing.Rectangle]::new(0, 0, $logo.Width, $logo.Height)) 640 'assets/brand/nuts-logo-640.png'
$logo.Dispose()

Write-Output 'Exported standing toolbar states, app icons, animation poses and logo sizes.'
