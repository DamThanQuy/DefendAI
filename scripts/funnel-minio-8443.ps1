$ts = 'C:\Program Files\Tailscale\tailscale.exe'
Write-Output "=== version ==="
& $ts version 2>&1 | Select-Object -First 2
Write-Output "=== serve 8443 -> 127.0.0.1:9000 (MinIO) ==="
& $ts serve --bg --https=8443 http://127.0.0.1:9000 2>&1
Write-Output "=== serve status ==="
& $ts serve status 2>&1
Write-Output "=== funnel on 8443 ==="
& $ts funnel 8443 2>&1
Write-Output "=== funnel status ==="
& $ts funnel status 2>&1
