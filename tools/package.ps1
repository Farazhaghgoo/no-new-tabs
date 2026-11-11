$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
$name = "NUTS-guardian-$version"
$release = Join-Path $root 'releases'
$stage = Join-Path $release $name
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($file in @('manifest.json','background.js','content.js','site.js','animation.js','activation.js','preview.html','preview.css','preview.js','README.md')) {
  Copy-Item -LiteralPath (Join-Path $root $file) -Destination $stage
}
foreach ($folder in @('icons','assets/animation','assets/source','tools','test','assets/brand')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $stage $folder) | Out-Null
}
foreach ($folder in @('icons','assets/animation','assets/source')) {
  Get-ChildItem -LiteralPath (Join-Path $root $folder) -File | Copy-Item -Destination (Join-Path $stage $folder)
}
foreach ($file in @('nuts-logo.png','nuts-logo-square.png','ARTWORK.md')) {
  Copy-Item -LiteralPath (Join-Path $root "assets/brand/$file") -Destination (Join-Path $stage 'assets/brand')
}
foreach ($file in @('export-brand.ps1','make-icons.mjs','package.ps1')) {
  Copy-Item -LiteralPath (Join-Path $root "tools/$file") -Destination (Join-Path $stage 'tools')
}
Copy-Item -Path (Join-Path $root 'test/*') -Destination (Join-Path $stage 'test') -Recurse -Force
$zip = Join-Path $release "$name.zip"
Compress-Archive -LiteralPath $stage -DestinationPath $zip -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
  $manifestEntry = $archive.Entries | Where-Object { $_.FullName.Replace('\','/') -eq "$name/manifest.json" }
  if (-not $manifestEntry) { throw 'Archive is missing the extension manifest.' }
  Write-Output "Verified $($archive.Entries.Count) files in $zip"
} finally { $archive.Dispose() }
