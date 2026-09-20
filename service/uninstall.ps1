# ============================================
# Receipt Taker — Uninstall Auto-Start
# ============================================

. "$PSScriptRoot\config.ps1"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   Receipt Taker — Removing Auto-Start"        -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# Stop services first
Write-Host "  Stopping services..." -ForegroundColor Yellow
& "$PSScriptRoot\stop.ps1"

# Remove registry entry
$regEntry = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $script:TASK_NAME -ErrorAction SilentlyContinue
if ($regEntry) {
    Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $script:TASK_NAME -ErrorAction SilentlyContinue
    Write-Host "  [OK] Auto-start removed from registry." -ForegroundColor Green
} else {
    Write-Host "  [--] Auto-start was not installed." -ForegroundColor DarkGray
}

# Also remove Task Scheduler task if it exists (from older installs)
$task = Get-ScheduledTask -TaskName $script:TASK_NAME -ErrorAction SilentlyContinue
if ($task) {
    Unregister-ScheduledTask -TaskName $script:TASK_NAME -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "  [OK] Task Scheduler entry removed." -ForegroundColor Green
}

# Clean up PID files
if (Test-Path $script:PID_DIR) {
    Remove-Item $script:PID_DIR -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] PID files cleaned up." -ForegroundColor Green
}

Write-Host ""
Write-Host "  Auto-start removed. You can still run start.ps1 manually." -ForegroundColor Cyan
Write-Host ""
