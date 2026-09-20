# ============================================
# Receipt Taker — Start Service
# ============================================
# Starts backend + ngrok tunnel, then monitors.
# Designed to run headless via Task Scheduler.

. "$PSScriptRoot\config.ps1"

# --- Logging ---
function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Write-Host $line
    if (-not (Test-Path $script:LOG_DIR)) { New-Item -ItemType Directory -Path $script:LOG_DIR -Force | Out-Null }
    Add-Content -Path $script:LOG_FILE -Value $line -ErrorAction SilentlyContinue
}

# --- PID Management ---
function Save-ProcessId($pidFile, $processId) {
    if (-not (Test-Path $script:PID_DIR)) { New-Item -ItemType Directory -Path $script:PID_DIR -Force | Out-Null }
    Set-Content -Path $pidFile -Value $processId
}

function Get-SavedProcessId($pidFile) {
    if (Test-Path $pidFile) {
        $savedId = (Get-Content $pidFile -ErrorAction SilentlyContinue).Trim()
        if ($savedId -and (Get-Process -Id ([int]$savedId) -ErrorAction SilentlyContinue)) {
            return [int]$savedId
        }
    }
    return $null
}

function Stop-SavedProcess($pidFile, $name) {
    $procId = Get-SavedProcessId $pidFile
    if ($procId) {
        Log "Stopping $name (PID: $procId)..."
        # Kill child processes first
        Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $procId } | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
}

# --- Health Check ---
function Test-BackendHealth {
    try {
        $response = Invoke-WebRequest -Uri $script:HEALTH_URL -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

# --- Build Frontend ---
function Build-Frontend {
    if (-not (Test-Path $script:FRONTEND_DIST)) {
        Log "Building frontend (first run)..."
        Push-Location $script:FRONTEND_DIR
        & npm run build 2>&1 | ForEach-Object { Log "  [build] $_" }
        Pop-Location
        if (Test-Path $script:FRONTEND_DIST) {
            Log "Frontend build complete."
        } else {
            Log "WARNING: Frontend build may have failed."
        }
    }
}

# --- Start Backend ---
function Start-Backend {
    Stop-SavedProcess $script:BACKEND_PID "backend"
    Start-Sleep -Seconds 1

    # Also kill anything lingering on port 3001
    $existing = netstat -ano 2>$null | Select-String ":$($script:BACKEND_PORT)\s.*LISTENING" | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Select-Object -Unique
    foreach ($existingPid in $existing) {
        if ($existingPid -and $existingPid -ne '0') {
            Log "Killing stale process on port $($script:BACKEND_PORT) (PID: $existingPid)"
            Stop-Process -Id ([int]$existingPid) -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }

    Log "Starting backend server..."
    $logDir = $script:LOG_DIR
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

    $proc = Start-Process -FilePath "node" `
        -ArgumentList "node_modules/tsx/dist/cli.mjs", "src/server.ts" `
        -WorkingDirectory $script:BACKEND_DIR `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput (Join-Path $logDir "backend-stdout.log") `
        -RedirectStandardError (Join-Path $logDir "backend-stderr.log")

    Save-ProcessId $script:BACKEND_PID $proc.Id
    Log "Backend started (PID: $($proc.Id))"

    # Wait for health check
    Log "Waiting for backend to be ready..."
    $ready = $false
    for ($i = 0; $i -lt $script:HEALTH_TIMEOUT; $i++) {
        Start-Sleep -Seconds 1
        if (Test-BackendHealth) {
            $ready = $true
            break
        }
    }

    if ($ready) {
        Log "Backend is healthy."
    } else {
        Log "WARNING: Backend health check failed after $($script:HEALTH_TIMEOUT)s. Check logs\backend-stderr.log"
    }
    return $ready
}

# --- Start Ngrok ---
function Start-Ngrok {
    Stop-SavedProcess $script:NGROK_PID "ngrok"
    Start-Sleep -Seconds 1

    Log "Starting ngrok tunnel ($($script:NGROK_DOMAIN))..."
    $proc = Start-Process -FilePath $script:NGROK_EXE `
        -ArgumentList "http", $script:BACKEND_PORT, "--url=$($script:NGROK_DOMAIN)" `
        -WindowStyle Hidden `
        -PassThru

    Save-ProcessId $script:NGROK_PID $proc.Id
    Log "Ngrok started (PID: $($proc.Id))"
    Start-Sleep -Seconds 3
}

# ============================================
# MAIN
# ============================================
Log "=========================================="
Log "Receipt Taker Service starting..."
Log "Project: $($script:PROJECT_ROOT)"
Log "=========================================="

# Check if already running and healthy
$existingBackend = Get-SavedProcessId $script:BACKEND_PID
$existingNgrok = Get-SavedProcessId $script:NGROK_PID
if ($existingBackend -and $existingNgrok -and (Test-BackendHealth)) {
    Log "Service is already running (Backend PID: $existingBackend, Ngrok PID: $existingNgrok). Exiting."
    exit 0
}

# Build frontend if needed
Build-Frontend

# Start services
$backendOk = Start-Backend
Start-Ngrok

Log "=========================================="
Log "Receipt Taker is LIVE!"
Log "  URL: https://$($script:NGROK_DOMAIN)"
Log "  Backend: http://localhost:$($script:BACKEND_PORT)"
Log "=========================================="

# --- Monitor Loop ---
Log "Entering monitoring loop (checking every $($script:MONITOR_INTERVAL)s)..."
while ($true) {
    Start-Sleep -Seconds $script:MONITOR_INTERVAL

    # Check backend
    if (-not (Test-BackendHealth)) {
        $backendProcId = Get-SavedProcessId $script:BACKEND_PID
        if (-not $backendProcId) {
            Log "ALERT: Backend process died. Restarting..."
        } else {
            Log "WARNING: Backend not responding (PID: $backendProcId still alive). Restarting..."
        }
        Start-Backend
    }

    # Check ngrok
    $ngrokProcId = Get-SavedProcessId $script:NGROK_PID
    if (-not $ngrokProcId) {
        Log "ALERT: Ngrok process died. Restarting..."
        Start-Ngrok
    }
}
