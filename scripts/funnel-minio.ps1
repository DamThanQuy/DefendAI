$ts = 'C:\Program Files\Tailscale\tailscale.exe'
Write-Output "=== serve 10000 -> minio 9000 ==="
& $ts serve --bg --https=10000 http://127.0.0.1:9000 2>&1
Start-Sleep -Seconds 2
Write-Output "=== funnel on 10000 ==="
& $ts funnel --bg 10000 2>&1
Start-Sleep -Seconds 2
Write-Output "=== serve status ==="
& $ts serve status 2>&1
Write-Output "=== local minio health ==="
try { $r = Invoke-WebRequest 'http://127.0.0.1:9000/minio/health/live' -TimeoutSec 10 -UseBasicParsing; Write-Output "minio local = $($r.StatusCode)" } catch { Write-Output "minio local ERR: $($_.Exception.Message)" }
