$ErrorActionPreference = 'Stop'
$base = 'https://defend-ai.vercel.app'

# 1. Login (fresh token)
$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType 'application/json' `
  -Body '{"email":"student@defendai.dev","password":"DefendAI@123"}' -TimeoutSec 60
$tok = $login.token
$H = @{ Authorization = "Bearer $tok" }
Write-Output "login OK"

# 2. Init 1-part 8MB session
$size = 8 * 1024 * 1024
$init = Invoke-RestMethod -Uri "$base/api/documents/multipart/init" -Method Post -Headers $H -ContentType 'application/json' `
  -Body (@{ filename='speedtest.zip'; size=$size; mime='application/zip'; purpose='student_project' } | ConvertTo-Json) -TimeoutSec 60
$uid = $init.upload_id
Write-Output "init OK upload_id=$uid"

# 3. PUT one 8MB chunk with valid SHA-256 (matches mandatory-checksum guard)
$payload = New-Object 'byte[]' $size
(New-Object Random).NextBytes($payload)
$sha = ([BitConverter]::ToString(( [Security.Cryptography.SHA256]::Create().ComputeHash($payload) )).Replace('-','')).ToLower()
$H2 = @{ Authorization = "Bearer $tok"; 'X-Part-Sha256' = $sha }
$sw = [Diagnostics.Stopwatch]::StartNew()
$put = Invoke-RestMethod -Uri "$base/api/documents/multipart/$uid/part/1" -Method Put -Headers $H2 -ContentType 'application/octet-stream' -Body $payload -TimeoutSec 300
$sw.Stop()
$secs = [Math]::Round($sw.Elapsed.TotalSeconds,1)
$mbps = [Math]::Round(8/$secs,2)
Write-Output ("PUT 8MB: etag=" + $put.etag + " in ${secs}s -> ${mbps} MB/s")

# 4. Repeat x2 for a second/third sample
foreach ($n in 2,3) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $put = Invoke-RestMethod -Uri "$base/api/documents/multipart/$uid/part/1" -Method Put -Headers $H2 -ContentType 'application/octet-stream' -Body $payload -TimeoutSec 300
    $sw.Stop()
    $secs = [Math]::Round($sw.Elapsed.TotalSeconds,1)
    Write-Output ("PUT 8MB #$n : ${secs}s -> $([Math]::Round(8/$secs,2)) MB/s")
  } catch { $sw.Stop(); Write-Output ("PUT 8MB #$n : FAIL after $($sw.Elapsed.TotalSeconds)s : $($_.Exception.Message)") }
}

# 5. Cleanup
try { Invoke-RestMethod -Uri "$base/api/documents/multipart/$uid/abort" -Method Delete -Headers $H -TimeoutSec 60 | Out-Null; Write-Output "aborted" } catch { Write-Output "abort failed" }
