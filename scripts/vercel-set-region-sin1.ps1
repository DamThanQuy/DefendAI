$ErrorActionPreference = 'Stop'
$TokenFile = 'C:\Tools\.vercel-token'
$Project   = 'defend-ai'
$TeamId    = 'team_QCRCT0j9VK52N7CKhobmhqLn'
$token = (Get-Content $TokenFile -Raw).Trim()
$H = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
$projUri = "https://api.vercel.com/v9/projects/$Project" + "?teamId=$TeamId"

Write-Output "=== BEFORE ==="
$p = Invoke-RestMethod -Uri $projUri -Headers $H -TimeoutSec 30
Write-Output ("serverlessFunctionRegion BEFORE = " + $p.serverlessFunctionRegion)

Write-Output "=== PATCH serverlessFunctionRegion -> sin1 ==="
$null = Invoke-RestMethod -Uri $projUri -Method Patch -Headers $H -Body '{"serverlessFunctionRegion":"sin1"}' -TimeoutSec 30

$p2 = Invoke-RestMethod -Uri $projUri -Headers $H -TimeoutSec 30
Write-Output ("serverlessFunctionRegion AFTER  = " + $p2.serverlessFunctionRegion)

Write-Output "=== trigger production redeploy from master ==="
$deployBody = '{"name":"' + $Project + '","project":"' + $Project + '","target":"production","gitSource":{"type":"github","repoId":1260840941,"ref":"master"}}'
$resp = Invoke-RestMethod -Uri ("https://api.vercel.com/v13/deployments?teamId=" + $TeamId) -Method Post -Headers $H -Body $deployBody -TimeoutSec 30
$depId = $resp.id
Write-Output ("REDEPLOY id=$depId url=" + $resp.url)

Write-Output "=== poll until build finishes ==="
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 20
    $d = Invoke-RestMethod -Uri ("https://api.vercel.com/v13/deployments/$depId" + "?teamId=$TeamId") -Headers $H -TimeoutSec 30
    Write-Output ("poll $i ready=" + $d.readyState)
    if ($d.readyState -in @('READY','ERROR')) { break }
}
Write-Output ("FINAL ready=" + $d.readyState)
