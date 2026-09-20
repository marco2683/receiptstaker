# ============================================
# Receipt Taker — Install Auto-Start
# ============================================
# Registers a Windows startup entry so the
# service starts silently at user logon.
# No admin rights needed.
# ============================================

. "$PSScriptRoot\config.ps1"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   Receipt Taker — Installing Auto-Start"      -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# Set the registry Run key (no admin needed)
$launcherPath = Join-Path $PSScriptRoot "launcher.bat"
$regValue = "cmd.exe /c `"$launcherPath`""

Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' `
    -Name $script:TASK_NAME `
    -Value $regValue `
    -Type String

# Verify
$result = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $script:TASK_NAME -ErrorAction SilentlyContinue)."$($script:TASK_NAME)"

if ($result) {
    Write-Host "  [OK] Auto-start registered!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  What happens now:" -ForegroundColor White
    Write-Host "    - Backend + ngrok start automatically when you log in" -ForegroundColor Gray
    Write-Host "    - If backend crashes, it auto-restarts within 60 seconds" -ForegroundColor Gray
    Write-Host "    - No cmd window — runs completely hidden" -ForegroundColor Gray
    Write-Host "    - Access from your phone: https://$($script:NGROK_DOMAIN)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Commands (run from service\ folder):" -ForegroundColor White
    Write-Host "    .\status.ps1     — Check if running" -ForegroundColor Gray
    Write-Host "    .\stop.ps1       — Stop the service" -ForegroundColor Gray
    Write-Host "    .\start.ps1      — Start manually" -ForegroundColor Gray
    Write-Host "    .\uninstall.ps1  — Remove auto-start" -ForegroundColor Gray
    Write-Host ""

    # Start the service now
    Write-Host "  Starting service now..." -ForegroundColor Yellow
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$launcherPath`"" -WindowStyle Hidden
    Start-Sleep -Seconds 12
    Write-Host ""
    & "$PSScriptRoot\status.ps1"
} else {
    Write-Host "  [FAIL] Registration failed." -ForegroundColor Red
}

Write-Host ""
