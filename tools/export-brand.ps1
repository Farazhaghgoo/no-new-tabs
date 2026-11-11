Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'BrandPixels.cs') -ReferencedAssemblies System.Drawing
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
# face and the green/grey colour stay readable at toolbar size. Optional
# desaturation greys the OFF face; optional sharpening counters the softening
# of a big downscale.
function Export-Disc($image, $cx, $cy, $radius, $size, $destination, $desaturate = 0, $sharpen = 0) {
  $rect = [System.Drawing.Rectangle]::new($cx - $radius, $cy - $radius, 2 * $radius, 2 * $radius)
  $art = Get-Scaled $image $rect $size
  if ($desaturate -gt 0) { [BrandPixels]::Desaturate($art, $desaturate) }
  if ($sharpen -gt 0) { [BrandPixels]::Sharpen($art, $sharpen) }
  $bitmap, $graphics = New-Canvas $size
  $brush = [System.Drawing.TextureBrush]::new($art)
  $graphics.FillEllipse($brush, 0, 0, $size, $size)
  Save-Png $bitmap $destination
  $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose(); $art.Dispose()
}

# Whole region with the OFF greying applied.
function Export-Greyed($image, $rect, $size, $destination, $desaturate) {
  $bitmap = Get-Scaled $image $rect $size
  [BrandPixels]::Desaturate($bitmap, $desaturate)
  Save-Png $bitmap $destination
  $bitmap.Dispose()
}

# ------------------------------------------------------------ face icons
# Toolbar and app icons use the faces from toggle-sheet.png (happy on green,
# sad on grey): the standing mascot is unreadable at 16-48 px.
# Disc centres were measured from the sheet. A 340 px crop makes the face
# fill most of the icon while keeping a visible green/grey ring; the OFF face
# is 60% greyed so the two states differ even when the ring is tiny.
$faces = [System.Drawing.Image]::FromFile((Join-Path $source 'toggle-sheet.png'))
$cell = [int]($faces.Width / 2)
$discs = @{ on = @(440, 480); off = @(1318, 480) }
$radius = 340
$grey = @{ on = 0; off = 0.6 }
$sharpen = @{ 16 = 0.6; 32 = 0.35 }
for ($i = 0; $i -lt 2; $i++) {
  $name = @('on', 'off')[$i]
  $rect = [System.Drawing.Rectangle]::new($i * $cell, 0, $cell, $faces.Height)
  # Toolbar sizes: disc only.
  foreach ($size in @(16, 32)) {
    Export-Disc $faces $discs[$name][0] $discs[$name][1] $radius $size "icons/$name-$size.png" $grey[$name] $sharpen[$size]
  }
  # Larger sizes keep the ears.
  foreach ($size in @(48, 128, 512)) {
    if ($grey[$name] -gt 0) { Export-Greyed $faces $rect $size "icons/$name-$size.png" $grey[$name] }
    else { Export-Region $faces $rect $size "icons/$name-$size.png" }
  }
}

# App icon (extensions page, menus, Web Store): the happy face.
$happy = [System.Drawing.Rectangle]::new(0, 0, $cell, $faces.Height)
foreach ($size in @(16, 32)) { Export-Disc $faces $discs.on[0] $discs.on[1] $radius $size "icons/logo-$size.png" 0 $sharpen[$size] }
Export-Region $faces $happy 48 'icons/logo-48.png'
# Web Store guideline: 96 px of artwork inside a 128 px canvas.
Export-Padded $faces $happy 96 128 'icons/logo-128.png'
$faces.Dispose()

# ------------------------------------------------------- standing mascot
# Full-size standing poses for the preview page and other large uses.
$standing = [System.Drawing.Image]::FromFile((Join-Path $source 'standing-sheet.png'))
$cell = [int]($standing.Width / 2)
for ($i = 0; $i -lt 2; $i++) {
  $name = @('on', 'off')[$i]
  Export-Region $standing ([System.Drawing.Rectangle]::new($i * $cell, 0, $cell, $standing.Height)) 1024 "assets/brand/nuts-standing-$name.png"
}
$standing.Dispose()

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

# Switch-off pose: the sad standing squirrel from standing-sheet.png, cut out
# of its grey circle (measured at 122,122,123). Pixels within 18 of that grey
# vanish, beyond 48 are kept, with a soft edge in between.
$standing = [System.Drawing.Bitmap]::FromFile((Join-Path $source 'standing-sheet.png'))
$half = [int]($standing.Width / 2)
$sad = $standing.Clone([System.Drawing.Rectangle]::new($half, 0, $standing.Width - $half, $standing.Height),
  [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$standing.Dispose()
$seeds = [BrandPixels]::GridSeeds($sad, 122, 122, 123, 18, 12)
[void][BrandPixels]::KeyOut($sad, 122, 122, 123, $seeds, 18, 48)
Export-Region $sad ([System.Drawing.Rectangle]::new(0, 0, $sad.Width, $sad.Height)) 512 'assets/animation/off.png'
$sad.Dispose()

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

Write-Output 'Exported face icons, standing mascots, animation poses and logo sizes.'
