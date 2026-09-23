$ts = 'C:\Program Files\Tailscale\tailscale.exe'
Write-Output "=== try funnel --bg --https=8443 ==="
& $ts funnel --bg --https=8443 2>&1
Write-Output "=== funnel status ==="
& $ts funnel status 2>&1
Write-Output "=== cloudflared? ==="
Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object Source
if (Test-Path 'C:\Tools\cloudflared.exe') { Write-Output 'C:\Tools\cloudflared.exe EXISTS' }
Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object Id,Path
Write-Output "=== how qt-service runs (scheduled task) ==="
schtasks /query /tn CloudflaredQT /xml 2>&1 | Select-String -Pattern 'Command|Arguments' | Select-Object -First 6
