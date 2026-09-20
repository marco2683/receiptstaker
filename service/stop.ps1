# ============================================
# Receipt Taker — Stop Service
# ============================================

. "$PSScriptRoot\config.ps1"

Write-Host ""
Write-Host "  Stopping Receipt Taker..." -ForegroundColor Yellow
Write-Host ""

# Stop backend
if (Test-Path $script:BACKEND_PID) {
    $procId = (Get-Content $script:BACKEND_PID -ErrorAction SilentlyContinue).Trim()
    if ($procId -and (Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue)) {
        # Kill child processes first
        Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq [int]$procId } | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Backend stopped (PID: $procId)" -ForegroundColor Green
    } else {
        Write-Host "  [--] Backend was not running" -ForegroundColor DarkGray
    }
    Remove-Item $script:BACKEND_PID -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "  [--] No backend PID file found" -ForegroundColor DarkGray
}

# Stop ngrok
if (Test-Path $script:NGROK_PID) {
    $procId = (Get-Content $script:NGROK_PID -ErrorAction SilentlyContinue).Trim()
    if ($procId -and (Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue)) {
        Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Ngrok stopped (PID: $procId)" -ForegroundColor Green
    } else {
        Write-Host "  [--] Ngrok was not running" -ForegroundColor DarkGray
    }
    Remove-Item $script:NGROK_PID -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "  [--] No ngrok PID file found" -ForegroundColor DarkGray
}

# Also stop any monitoring loop (the start.ps1 script itself)
$monitorProcs = Get-Process -Name "powershell", "pwsh" -ErrorAction SilentlyContinue | Where-Object {
    try {
        $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
        $cmdLine -match "service\\start\.ps1"
    } catch { $false }
}
foreach ($p in $monitorProcs) {
    if ($p.Id -ne $PID) {
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Monitor loop stopped (PID: $($p.Id))" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "  Receipt Taker stopped." -ForegroundColor Cyan
Write-Host ""
