Add-Type -AssemblyName System.IO.Compression.FileSystem
$vertexZip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path 'artifacts/Vertex-MVP-1.5.apk'))
$vertexChecked = 0
try {
  foreach ($vertexEntry in $vertexZip.Entries) {
    if (!$vertexEntry.FullName.StartsWith('assets/site/') -or !$vertexEntry.Name) { continue }
    $vertexRelative = $vertexEntry.FullName.Substring(12)
    $vertexAsset = Join-Path 'android/app/src/main/assets/site' $vertexRelative
    $vertexStream = $vertexEntry.Open()
    try { $vertexHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($vertexStream)) } finally { $vertexStream.Dispose() }
    if ($vertexHash -ne (Get-FileHash -LiteralPath $vertexAsset).Hash) { throw "APK asset mismatch: $vertexRelative" }
    $vertexChecked++
  }
} finally { $vertexZip.Dispose() }
@{version='1.5-demo';versionCode=7;assetsChecked=$vertexChecked;apkSha256=(Get-FileHash 'artifacts/Vertex-MVP-1.5.apk').Hash.ToLower();signingCertificate='4c500d0a57c6fdacf73dd6b7a27640c09bedf026f7af3dd1c3dfefcdcaee79a9';physicalDeviceTested=$false} | ConvertTo-Json | Set-Content -Encoding utf8 artifacts/release/android-verification.json
Write-Output "PASS APK: $vertexChecked embedded assets match source"
