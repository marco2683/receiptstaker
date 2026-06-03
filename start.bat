@echo off
title Receipt Taker
cls
echo.
echo  ============================================
echo         Receipt Taker - Starting...
echo  ============================================
echo.

set NGROK="C:\Users\sebas\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
set NGROK_DOMAIN=zoom-cortex-esophagus.ngrok-free.dev

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
taskkill /F /IM ngrok.exe >nul 2>&1
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

:: Start ngrok
echo  Starting tunnel...
start /B "" %NGROK% http 3001 --url=%NGROK_DOMAIN% >nul 2>&1
timeout /t 3 /nobreak >nul

:: Get local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do set LOCAL_IP=%%b
)

cls
echo.
echo  ============================================
echo      RECEIPT TAKER IS RUNNING!
echo  ============================================
echo.
echo   OPEN ON YOUR PHONE:
echo     https://%NGROK_DOMAIN%
echo.
echo   LOCAL (same WiFi):
echo     http://%LOCAL_IP%:3001
echo.
echo   Spreadsheet: data\receipts.xlsx
echo.
echo   Press Ctrl+C to stop.
echo  ============================================
echo.

cmd /k
