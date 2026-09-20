# ============================================
# Receipt Taker — Service Configuration
# ============================================
# Edit these values when migrating to a new machine.

# Project root (auto-detected from this script's location)
$script:PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $script:PROJECT_ROOT -or $script:PROJECT_ROOT -eq '') {
    $script:PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
}
# Override: use the known project path
$script:PROJECT_ROOT = "c:\Users\sebas\OneDrive\Desktop\DUMP\Antigravity Projects\005_Receipt taker"

# Ngrok
$script:NGROK_EXE    = "C:\Users\sebas\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
$script:NGROK_DOMAIN = "zoom-cortex-esophagus.ngrok-free.dev"

# Backend
$script:BACKEND_DIR  = Join-Path $script:PROJECT_ROOT "backend"
$script:BACKEND_PORT = 3001

# Frontend
$script:FRONTEND_DIR = Join-Path $script:PROJECT_ROOT "frontend"
$script:FRONTEND_DIST = Join-Path $script:FRONTEND_DIR "dist\index.html"

# PID tracking
$script:PID_DIR      = Join-Path $script:PROJECT_ROOT "service\.pids"
$script:BACKEND_PID  = Join-Path $script:PID_DIR "backend.pid"
$script:NGROK_PID    = Join-Path $script:PID_DIR "ngrok.pid"

# Logs
$script:LOG_DIR      = Join-Path $script:PROJECT_ROOT "service\logs"
$script:LOG_FILE     = Join-Path $script:LOG_DIR ("receipt-taker-{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))

# Task Scheduler
$script:TASK_NAME    = "ReceiptTakerService"

# Health check
$script:HEALTH_URL   = "http://localhost:$($script:BACKEND_PORT)/api/health"
$script:HEALTH_TIMEOUT = 15  # seconds to wait for backend startup
$script:MONITOR_INTERVAL = 60  # seconds between health checks
