$ErrorActionPreference = 'Continue'
$TokenFile = 'C:\Tools\.vercel-token'
$Project   = 'defend-ai'
$TeamId    = 'team_QCRCT0j9VK52N7CKhobmhqLn'
$token = (Get-Content $TokenFile -Raw).Trim()
$H = @{ Authorization = "Bearer $token" }

Write-Output "=== newest production deployment: region ==="
$list = Invoke-RestMethod -Uri "https://api.vercel.com/v6/deployments?projectIdOrName=$Project&teamId=$TeamId&limit=5&target=production" -Headers $H -TimeoutSec 30
$d = @($list.deployments | Where-Object { $_.readyState -eq 'READY' })[0]
Write-Output ("id=" + $d.id + " ready=" + $d.readyState + " region=" + $d.region + " url=" + $d.url)

Write-Output "=== production alias points where ==="
$alias = Invoke-RestMethod -Uri "https://api.vercel.com/v4/aliases?domain=defend-ai.vercel.app&teamId=$TeamId" -Headers $H -TimeoutSec 30
$a = @($alias.aliases)[0]
Write-Output ("alias deployment=" + $a.deploymentId)

Write-Output "=== login latency x5 (through BFF, now in sin1) ==="
for ($i=1; $i -le 5; $i++) {
  $sw=[Diagnostics.Stopwatch]::StartNew()
  try {
    $r = Invoke-WebRequest -Uri 'https://defend-ai.vercel.app/api/auth/login' -Method Post -ContentType 'application/json' -Body '{"email":"student@defendai.dev","password":"DefendAI@123"}' -TimeoutSec 30 -UseBasicParsing
    $sw.Stop()
    Write-Output ("login $i : HTTP $($r.StatusCode) in $([Math]::Round($sw.Elapsed.TotalMilliseconds))ms")
  } catch { $sw.Stop(); Write-Output ("login $i : ERR $($_.Exception.Message.Substring(0,[Math]::Min(40,$_.Exception.Message.Length))) in $([Math]::Round($sw.Elapsed.TotalMilliseconds))ms") }
  Start-Sleep -Seconds 2
}
