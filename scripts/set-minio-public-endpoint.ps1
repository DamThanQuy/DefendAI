$ErrorActionPreference = 'Stop'
$envFile = 'F:\DefendAI\.env'
$newVal  = 'https://tkm1.taildec640.ts.net:8443'

Write-Output "=== backup .env ==="
Copy-Item $envFile "$envFile.bak-minio-$(Get-Date -Format yyyyMMddHHmmss)" -Force

Write-Output "=== before ==="
Select-String -Path $envFile -Pattern 'MINIO_PUBLIC_ENDPOINT' | ForEach-Object { $_.Line }

$lines = Get-Content $envFile
$found = $false
$lines = $lines | ForEach-Object {
    if ($_ -match '^MINIO_PUBLIC_ENDPOINT=') { $script:found = $true; "MINIO_PUBLIC_ENDPOINT=$newVal" } else { $_ }
}
if (-not $found) { $lines += "MINIO_PUBLIC_ENDPOINT=$newVal" }
Set-Content -Path $envFile -Value $lines -Encoding UTF8

Write-Output "=== after ==="
Select-String -Path $envFile -Pattern 'MINIO_PUBLIC_ENDPOINT' | ForEach-Object { $_.Line }

Write-Output "=== recreate api container (no build) ==="
Set-Location F:\DefendAI
docker compose up -d --no-build api 2>&1

Write-Output "=== wait healthy ==="
for ($i=1; $i -le 12; $i++) {
    Start-Sleep -Seconds 10
    $h = docker inspect defense-api --format '{{.State.Health.Status}}' 2>&1
    Write-Output "poll $i : $h"
    if ($h -eq 'healthy') { break }
}
Write-Output "=== verify env inside container ==="
docker exec defense-api sh -c 'printenv | grep MINIO_PUBLIC'
