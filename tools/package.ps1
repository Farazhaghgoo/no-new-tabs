# Builds releases/NUTS-<version>.zip: the files Chrome needs to load the
# extension, plus the offline preview page and README. Source sheets, tools and
# tests stay in the repository.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') { throw 'Invalid package version.' }
$name = "NUTS-$version"
$release = Join-Path $root 'releases'
$stage = Join-Path $release $name
$zip = Join-Path $release "$name.zip"

# Start clean so files removed from the project don't linger in the build.
$resolvedStage = [System.IO.Path]::GetFullPath($stage)
$resolvedRelease = [System.IO.Path]::GetFullPath($release) + [System.IO.Path]::DirectorySeparatorChar
if (-not $resolvedStage.StartsWith($resolvedRelease, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Staging path outside release directory.' }
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

foreach ($file in @('manifest.json', 'background.js', 'content.js', 'site.js', 'animation.js', 'activation.js',
                    'preview.html', 'preview.css', 'preview.js', 'README.md')) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination $stage
}
foreach ($folder in @('icons', 'assets/animation')) {
  $target = Join-Path $stage $folder
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Get-ChildItem -LiteralPath (Join-Path $root $folder) -File -Filter '*.png' | Copy-Item -Destination $target
}
$brand = Join-Path $stage 'assets/brand'
New-Item -ItemType Directory -Force -Path $brand | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'assets/brand/nuts-logo-640.png') -Destination $brand
foreach ($file in @('nuts-standing-on.png', 'nuts-standing-off.png')) {
  Copy-Item -LiteralPath (Join-Path $root "assets/brand/$file") -Destination $brand
}

# Windows' own tar writes zip entries with forward slashes, so the archive
# unpacks correctly on macOS and Linux too (Compress-Archive in Windows
# PowerShell 5.1 writes backslashes).
& (Join-Path $env:SystemRoot 'System32\tar.exe') -a -c -f $zip -C $release $name
if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }

$entries = & (Join-Path $env:SystemRoot 'System32\tar.exe') -t -f $zip
if ($entries -notcontains "$name/manifest.json") { throw 'Archive is missing the extension manifest.' }
if ($entries | Where-Object { $_ -like '*\*' }) { throw 'Archive has backslash paths.' }
$size = [Math]::Round((Get-Item -LiteralPath $zip).Length / 1MB, 1)
Write-Output "Built $zip ($($entries.Count) entries, $size MB)"
