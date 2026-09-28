param([string]$ApkPath = '')

$ErrorActionPreference = 'Stop'
$vertexRoot = Split-Path -Parent $PSScriptRoot
$vertexGradle = Get-Content -LiteralPath (Join-Path $vertexRoot 'android/app/build.gradle') -Raw
$vertexVersionMatch = [regex]::Match($vertexGradle, "versionName\s+'([^']+)'")
$vertexCodeMatch = [regex]::Match($vertexGradle, 'versionCode\s+(\d+)')
if (!$vertexVersionMatch.Success -or !$vertexCodeMatch.Success) { throw 'Android version is missing from build.gradle' }
$vertexVersion = $vertexVersionMatch.Groups[1].Value
$vertexVersionCode = [int]$vertexCodeMatch.Groups[1].Value
if (!$ApkPath) { $ApkPath = Join-Path $vertexRoot "artifacts/Vertex-MVP-$($vertexVersion -replace '-demo$', '').apk" }
$vertexApk = (Resolve-Path -LiteralPath $ApkPath).Path
$vertexSite = Join-Path $vertexRoot 'android/app/src/main/assets/site'
$vertexRelease = Get-Content -LiteralPath (Join-Path $vertexSite 'release.json') -Raw | ConvertFrom-Json
if ($vertexRelease.version -ne $vertexVersion) { throw 'Android release.json does not match build.gradle' }

# Verify the actual signer, retaining the certificate used by earlier Vertex releases.
$env:JAVA_HOME = Join-Path $vertexRoot '.android-tools/jdk/jdk-21.0.12.1+1'
$vertexBuildTools = Join-Path $vertexRoot '.android-tools/sdk/build-tools/35.0.0'
$vertexSigningOutput = & (Join-Path $vertexBuildTools 'apksigner.bat') verify --verbose --print-certs $vertexApk 2>&1
if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed: $($vertexSigningOutput -join [Environment]::NewLine)" }
$vertexSigner = [regex]::Match(($vertexSigningOutput -join "`n"), 'Signer #1 certificate SHA-256 digest:\s*([a-f0-9]+)', 'IgnoreCase')
$vertexExpectedCertificate = '4c500d0a57c6fdacf73dd6b7a27640c09bedf026f7af3dd1c3dfefcdcaee79a9'
if (!$vertexSigner.Success -or $vertexSigner.Groups[1].Value.ToLowerInvariant() -ne $vertexExpectedCertificate) { throw 'APK signing certificate differs from the existing Vertex demo releases' }
$vertexBadging = & (Join-Path $vertexBuildTools 'aapt.exe') dump badging $vertexApk 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect Android package metadata' }
$vertexPackage = [regex]::Match(($vertexBadging -join "`n"), "package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'")
if (!$vertexPackage.Success -or $vertexPackage.Groups[1].Value -ne 'com.vertex.demo' -or $vertexPackage.Groups[2].Value -ne [string]$vertexVersionCode -or $vertexPackage.Groups[3].Value -ne $vertexVersion) { throw 'APK package ID or version does not match the intended release' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$vertexExpectedAssets = @{}
foreach ($vertexAsset in Get-ChildItem -LiteralPath $vertexSite -File -Recurse) {
  $vertexRelative = [IO.Path]::GetRelativePath($vertexSite, $vertexAsset.FullName).Replace('\', '/')
  $vertexExpectedAssets[$vertexRelative] = (Get-FileHash -LiteralPath $vertexAsset.FullName -Algorithm SHA256).Hash
}
$vertexZip = [IO.Compression.ZipFile]::OpenRead($vertexApk)
$vertexSeen = @{}
try {
  foreach ($vertexEntry in $vertexZip.Entries) {
    if (!$vertexEntry.FullName.StartsWith('assets/site/') -or !$vertexEntry.Name) { continue }
    $vertexRelative = $vertexEntry.FullName.Substring(12)
    if (!$vertexExpectedAssets.ContainsKey($vertexRelative)) { throw "Unexpected APK asset: $vertexRelative" }
    if ($vertexSeen.ContainsKey($vertexRelative)) { throw "Duplicate APK asset: $vertexRelative" }
    $vertexStream = $vertexEntry.Open()
    try { $vertexHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($vertexStream)) } finally { $vertexStream.Dispose() }
    if ($vertexHash -ne $vertexExpectedAssets[$vertexRelative]) { throw "APK asset mismatch: $vertexRelative" }
    $vertexSeen[$vertexRelative] = $true
  }
} finally { $vertexZip.Dispose() }
if ($vertexSeen.Count -ne $vertexExpectedAssets.Count) { throw 'One or more source assets are missing from the APK' }

@{
  version = $vertexVersion
  versionCode = $vertexVersionCode
  assetsChecked = $vertexSeen.Count
  apkSha256 = (Get-FileHash -LiteralPath $vertexApk -Algorithm SHA256).Hash.ToLowerInvariant()
  signingCertificate = $vertexSigner.Groups[1].Value.ToLowerInvariant()
  signatureVerified = $true
  packageVerified = $true
  physicalDeviceTested = $false
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $vertexRoot 'artifacts/release/android-verification.json') -Encoding utf8
Write-Output "PASS APK: $vertexVersion (code $vertexVersionCode), signature valid, $($vertexSeen.Count) embedded assets match source"
