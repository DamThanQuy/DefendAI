$ts = 'C:\Program Files\Tailscale\tailscale.exe'
Write-Output "=== attempt A: funnel --bg --https=8443 localhost:9000 ==="
& $ts funnel --bg --https=8443 localhost:9000 2>&1
Write-Output "=== funnel status ==="
& $ts funnel status 2>&1
Write-Output "=== serve status ==="
& $ts serve status 2>&1
