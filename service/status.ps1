# ============================================
# Receipt Taker — Service Status
# ============================================

. "$PSScriptRoot\config.ps1"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "       Receipt Taker — Service Status"         -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# Backend status
$backendStatus = "STOPPED"
$backendColor = "Red"
if (Test-Path $script:BACKEND_PID) {
    $procId = (Get-Content $script:BACKEND_PID -ErrorAction SilentlyContinue).Trim()
    if ($procId -and (Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue)) {
        $backendStatus = "RUNNING (PID: $procId)"
        $backendColor = "Green"
    }
}
Write-Host "  Backend:    $backendStatus" -ForegroundColor $backendColor

# Health check
try {
    $response = Invoke-WebRequest -Uri $script:HEALTH_URL -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    Write-Host "  Health:     HEALTHY" -ForegroundColor Green
} catch {
    Write-Host "  Health:     UNREACHABLE" -ForegroundColor Red
}

# Ngrok status
$ngrokStatus = "STOPPED"
$ngrokColor = "Red"
if (Test-Path $script:NGROK_PID) {
    $procId = (Get-Content $script:NGROK_PID -ErrorAction SilentlyContinue).Trim()
    if ($procId -and (Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue)) {
        $ngrokStatus = "RUNNING (PID: $procId)"
        $ngrokColor = "Green"
    }
}
Write-Host "  Ngrok:      $ngrokStatus" -ForegroundColor $ngrokColor

# Public URL
Write-Host ""
Write-Host "  Public URL: https://$($script:NGROK_DOMAIN)" -ForegroundColor White

# Auto-start check (registry-based)
$regEntry = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $script:TASK_NAME -ErrorAction SilentlyContinue
if ($regEntry) {
    Write-Host "  Auto-start: INSTALLED (runs at login)" -ForegroundColor Green
} else {
    Write-Host "  Auto-start: NOT INSTALLED (run install.ps1)" -ForegroundColor Yellow
}

# Logs
Write-Host ""
if (Test-Path $script:LOG_FILE) {
    Write-Host "  Latest log: $($script:LOG_FILE)" -ForegroundColor DarkGray
    Write-Host "  Last 5 entries:" -ForegroundColor DarkGray
    Get-Content $script:LOG_FILE -Tail 5 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
