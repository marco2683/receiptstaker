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

:: Kill any existing processes
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start backend
echo  Starting backend server...
cd backend
start /B cmd /c "npm run dev 2>nul"
cd ..

:: Wait for backend
echo  Waiting for backend...
timeout /t 5 /nobreak >nul

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

:: Check if ngrok is configured (permanent URL)
where ngrok >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    ngrok config check >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo  Starting ngrok tunnel...
        
        :: Check for saved static domain
        if exist "ngrok_domain.txt" (
            set /p NGROK_DOMAIN=<ngrok_domain.txt
            start /B ngrok http 3001 --domain=%NGROK_DOMAIN% >nul 2>&1
        ) else (
            start /B ngrok http 3001 --log=stdout >ngrok_log.tmp 2>&1
        )
        timeout /t 4 /nobreak >nul
        goto :show_status
    )
)

:: Fallback: Cloudflare quick tunnel
echo  Starting Cloudflare tunnel...
start /B %CLOUDFLARED% tunnel --url http://localhost:3001 2>tunnel_log.tmp

timeout /t 8 /nobreak >nul

:: Extract tunnel URL
set TUNNEL_URL=
for /f "delims=" %%a in ('findstr /C:"trycloudflare.com" tunnel_log.tmp 2^>nul') do (
    for %%u in (%%a) do (
        echo %%u | findstr /C:"https://" >nul 2>&1
        if not errorlevel 1 set TUNNEL_URL=%%u
    )
)

:show_status
cls
echo.
echo  ============================================
echo      RECEIPT TAKER IS RUNNING!
echo  ============================================
echo.
echo   AT HOME (same WiFi):
echo     http://%LOCAL_IP%:3001
echo.
if defined NGROK_DOMAIN (
echo   ANYWHERE (permanent URL!):
echo     https://%NGROK_DOMAIN%
) else if defined TUNNEL_URL (
echo   ANYWHERE (changes on restart):
echo     %TUNNEL_URL%
) else (
echo   ANYWHERE: Check tunnel_log.tmp for URL
)
echo.
echo   Spreadsheet: data\receipts.xlsx
echo.
echo   Press Ctrl+C to stop.
echo  ============================================
echo.

cmd /k
