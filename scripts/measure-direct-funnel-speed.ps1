$ErrorActionPreference = 'Stop'
$base = 'https://tkm1.taildec640.ts.net'   # Tailscale funnel -> 127.0.0.1:8000, BYPASS Vercel

# Login direct to backend
$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType 'application/json' `
  -Body '{"email":"student@defendai.dev","password":"DefendAI@123"}' -TimeoutSec 60
$tok = $login.token
$H = @{ Authorization = "Bearer $tok" }
Write-Output "login OK (direct funnel)"

$size = 8 * 1024 * 1024
$init = Invoke-RestMethod -Uri "$base/api/documents/multipart/init" -Method Post -Headers $H -ContentType 'application/json' `
  -Body (@{ filename='speedtest.zip'; size=$size; mime='application/zip'; purpose='student_project' } | ConvertTo-Json) -TimeoutSec 60
$uid = $init.upload_id
Write-Output "init OK (direct funnel)"

$payload = New-Object 'byte[]' $size
(New-Object Random).NextBytes($payload)
$sha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($payload)).Replace('-','').ToLower()
$H2 = @{ Authorization = "Bearer $tok"; 'X-Part-Sha256' = $sha }

foreach ($n in 1,2,3) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $put = Invoke-RestMethod -Uri "$base/api/documents/multipart/$uid/part/1" -Method Put -Headers $H2 -ContentType 'application/octet-stream' -Body $payload -TimeoutSec 300
    $sw.Stop(); $secs=[Math]::Round($sw.Elapsed.TotalSeconds,1)
    Write-Output ("DIRECT funnel PUT 8MB #$n : ${secs}s -> $([Math]::Round(8/$secs,2)) MB/s etag=$($put.etag)")
  } catch { $sw.Stop(); Write-Output ("DIRECT funnel PUT 8MB #$n : FAIL $($sw.Elapsed.TotalSeconds)s : $($_.Exception.Message)") }
}
try { Invoke-RestMethod -Uri "$base/api/documents/multipart/$uid/abort" -Method Delete -Headers $H -TimeoutSec 60 | Out-Null } catch {}
