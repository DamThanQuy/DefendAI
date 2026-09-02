$files = Get-ChildItem 'd:\Defend AI\apps\web\src\app' -Recurse -Filter 'page.tsx'
foreach ($f in $files) {
    $content = [System.IO.File]::ReadAllText($f.FullName)
    $u = $content
    $u = $u -replace 'text-zinc-100', 'text-foreground'
    $u = $u -replace 'text-zinc-200', 'text-foreground'
    $u = $u -replace 'text-zinc-300', 'text-foreground'
    $u = $u -replace 'text-zinc-400', 'text-muted-foreground'
    $u = $u -replace 'text-zinc-500', 'text-muted-foreground'
    $u = $u -replace 'text-zinc-600', 'text-muted-foreground'
    $u = $u -replace 'text-zinc-700', 'text-muted-foreground'
    $u = $u -replace 'bg-zinc-950', 'bg-card'
    $u = $u -replace 'bg-zinc-900', 'bg-card'
    $u = $u -replace 'bg-zinc-900\/40', 'bg-muted/60'
    $u = $u -replace 'bg-zinc-900\/30', 'bg-muted/40'
    $u = $u -replace 'bg-zinc-800', 'bg-muted'
    $u = $u -replace 'bg-zinc-800\/60', 'bg-muted/60'
    $u = $u -replace 'bg-zinc-800\/50', 'bg-muted/50'
    $u = $u -replace 'bg-zinc-800\/40', 'bg-muted/40'
    $u = $u -replace 'bg-zinc-800\/20', 'bg-muted/30'
    $u = $u -replace 'bg-zinc-700', 'bg-muted'
    $u = $u -replace 'border-zinc-800', 'border-border'
    $u = $u -replace 'border-zinc-800\/60', 'border-border'
    $u = $u -replace 'border-zinc-800\/50', 'border-border'
    $u = $u -replace 'border-zinc-800\/40', 'border-border'
    $u = $u -replace 'border-zinc-700', 'border-border'
    $u = $u -replace 'border-zinc-700\/50', 'border-border'
    $u = $u -replace 'hover:bg-zinc-800', 'hover:bg-muted'
    $u = $u -replace 'hover:bg-zinc-700', 'hover:bg-muted/70'
    $u = $u -replace 'hover:text-zinc-200', 'hover:text-foreground'
    $u = $u -replace 'hover:text-zinc-100', 'hover:text-foreground'
    $u = $u -replace 'divide-zinc-800', 'divide-border'
    $u = $u -replace 'placeholder:text-zinc-600', 'placeholder:text-muted-foreground'
    $u = $u -replace 'placeholder:text-zinc-500', 'placeholder:text-muted-foreground'
    if ($u -ne $content) {
        [System.IO.File]::WriteAllText($f.FullName, $u)
        Write-Host "UPDATED: $($f.Name)"
    }
}
Write-Host "DONE"