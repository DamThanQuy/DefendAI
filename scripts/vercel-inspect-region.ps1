$ErrorActionPreference = 'Stop'
$TokenFile = 'C:\Tools\.vercel-token'
$Project   = 'defend-ai'
$TeamId    = 'team_QCRCT0j9VK52N7CKhobmhqLn'
$token = (Get-Content $TokenFile -Raw).Trim()
$H = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
$p = Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$Project`?teamId=$TeamId" -Headers $H -TimeoutSec 30
Write-Output "=== region-ish fields ==="
$p.PSObject.Properties | Where-Object { $_.Name -match 'region|Region|edge|serverless|functions' } | ForEach-Object {
  Write-Output ($_.Name + " = " + ($_.Value | ConvertTo-Json -Compress -Depth 4))
}
Write-Output "=== full top-level keys ==="
Write-Output (($p.PSObject.Properties.Name) -join ', ')
