@echo off
title Receipt Taker
cls
echo.
echo  ============================================
echo         Receipt Taker - Starting...
echo  ============================================
echo.

set CLOUDFLARED="C:\Program Files (x86)\cloudflared\cloudflared.exe"

:: Build frontend if needed
if not exist "frontend\dist\index.html" (
    echo  Building frontend...
    cd frontend
    call npm run build >nul 2>&1
    cd ..
    echo  Frontend built.
)

:: Start backend
echo  Starting backend server...
cd backend
start /B cmd /c "npm run dev 2>nul"
cd ..

:: Wait for backend
echo  Waiting for backend...
timeout /t 4 /nobreak >nul

:: Verify backend
curl -s http://localhost:3001/api/health >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [!] Backend failed to start. Check backend\.env
    pause
    exit /b 1
)
echo  Backend ready.

:: Get local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do set LOCAL_IP=%%b
)

:: Start Cloudflare Tunnel
echo  Starting tunnel for anywhere access...
start /B %CLOUDFLARED% tunnel --url http://localhost:3001 2>tunnel_log.tmp
timeout /t 8 /nobreak >nul

:: Extract tunnel URL from log
set TUNNEL_URL=
for /f "tokens=*" %%a in ('findstr /C:"trycloudflare.com" tunnel_log.tmp 2^>nul') do (
    for %%u in (%%a) do (
        echo %%u | findstr /C:"https://" >nul 2>&1
        if not errorlevel 1 set TUNNEL_URL=%%u
    )
)

cls
echo.
echo  ============================================
echo     RECEIPT TAKER IS RUNNING!
echo  ============================================
echo.
echo   AT HOME (same WiFi):
echo     http://%LOCAL_IP%:3001
echo.
if defined TUNNEL_URL (
echo   ANYWHERE (phone bookmark this!):
echo     %TUNNEL_URL%
) else (
echo   ANYWHERE: Tunnel starting...
echo     Run: type tunnel_log.tmp
echo     Look for the trycloudflare.com URL
)
echo.
echo   Spreadsheet: data\receipts.xlsx
echo.
echo   Press Ctrl+C to stop.
echo  ============================================
echo.

cmd /k
