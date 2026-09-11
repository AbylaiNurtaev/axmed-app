param([Parameter(Mandatory = $true)][string]$SdkPath)
$ErrorActionPreference = 'Stop'
$sdkRoot = (Resolve-Path -LiteralPath $SdkPath).Path
$demoRoot = Join-Path $sdkRoot 'iOS_sdk_source\Demo\VeepooBleSDKDemo\VeepooBleSDKDemo'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$destination = Join-Path $repoRoot 'modules\axmed-hband\ios\Vendor'
$frameworkNames = @('VeepooBleSDK', 'ABParTool', 'DFUnits', 'GRDFUSDK', 'JLDialUnit', 'JL_BLEKit', 'ZipZap')
$manifest = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'modules\axmed-hband\vendor-manifest.json') | ConvertFrom-Json

foreach ($name in $frameworkNames) {
  $sourceBinary = Join-Path $demoRoot "$name.framework\$name"
  if (-not (Test-Path -LiteralPath $sourceBinary -PathType Leaf)) {
    throw "SDK is incomplete: $sourceBinary"
  }
  if ((Get-FileHash -LiteralPath $sourceBinary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.frameworks.$name) {
    throw "Unexpected SDK version for $name. No files have been copied."
  }
  $targetBundle = Join-Path $destination "$name.framework"
  if (Test-Path -LiteralPath $targetBundle) {
    throw "Already exists; will not overwrite vendor files: $targetBundle"
  }
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach ($name in $frameworkNames) {
  $sourceBundle = Join-Path $demoRoot "$name.framework"
  $targetBundle = Join-Path $destination "$name.framework"
  Copy-Item -LiteralPath $sourceBundle -Destination $targetBundle -Recurse
}
Write-Output 'Imported SDK frameworks. Vendor binaries stay out of Git but are included in EAS builds.'
