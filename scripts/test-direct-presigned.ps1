$ErrorActionPreference = 'Stop'
$base = 'https://defend-ai.vercel.app'

$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType 'application/json' `
  -Body '{"email":"student@defendai.dev","password":"DefendAI@123"}' -TimeoutSec 60
$H = @{ Authorization = "Bearer $($login.token)" }

$size = 8 * 1024 * 1024
$init = Invoke-RestMethod -Uri "$base/api/documents/multipart/init" -Method Post -Headers $H -ContentType 'application/json' `
  -Body (@{ filename='directtest.zip'; size=$size; mime='application/zip'; purpose='student_project' } | ConvertTo-Json) -TimeoutSec 60
$uid = $init.upload_id
$presigned = $init.parts[0].url
Write-Output "upload_id=$uid"
Write-Output ("presigned host: " + ([Uri]$presigned).Host + ":" + ([Uri]$presigned).Port)

$payload = New-Object 'byte[]' $size
(New-Object Random).NextBytes($payload)

$sw = [Diagnostics.Stopwatch]::StartNew()
try {
  $r = Invoke-WebRequest -Uri $presigned -Method Put -Body $payload -ContentType 'application/octet-stream' `
       -Headers @{ Origin = 'https://defend-ai.vercel.app' } -TimeoutSec 300 -UseBasicParsing
  $sw.Stop()
  Write-Output ("DIRECT PUT 8MB: HTTP $($r.StatusCode) in $([Math]::Round($sw.Elapsed.TotalSeconds,1))s -> $([Math]::Round(8/$sw.Elapsed.TotalSeconds,2)) MB/s")
  Write-Output "  ETag: $($r.Headers['ETag'])"
  Write-Output "  Access-Control-Expose-Headers: $($r.Headers['Access-Control-Expose-Headers'])"
  Write-Output "  Access-Control-Allow-Origin: $($r.Headers['Access-Control-Allow-Origin'])"
} catch {
  $sw.Stop()
  Write-Output ("DIRECT PUT FAILED after $([Math]::Round($sw.Elapsed.TotalSeconds,1))s : $($_.Exception.Message)")
  if ($_.Exception.Response) {
    $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Output ("body: " + $sr.ReadToEnd().Substring(0,400))
  }
}

try { Invoke-RestMethod -Uri "$base/api/documents/multipart/$uid/abort" -Method Delete -Headers $H -TimeoutSec 60 | Out-Null; Write-Output "aborted" } catch {}
