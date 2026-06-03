@echo off
title Receipt Taker - Local Server
cls
echo.
echo  ======================================
echo   Receipt Taker - Starting...
echo  ======================================
echo.

:: Get local IP for phone access
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do set LOCAL_IP=%%b
)

:: Kill any existing node processes on our ports
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start backend
echo  Starting backend...
cd backend
start /B cmd /c "npm run dev 2>&1 | findstr /V /C:\"tsx\""
cd ..

:: Wait for backend to be ready
timeout /t 3 /nobreak >nul

:: Start frontend  
echo  Starting frontend...
cd frontend
start /B cmd /c "npm run dev 2>&1"
cd ..

:: Wait for frontend to be ready
timeout /t 3 /nobreak >nul

echo.
echo  ======================================
echo   READY! Open this on your phone:
echo.
echo   http://%LOCAL_IP%:5173
echo.
echo   Spreadsheet saves to:
echo   data\receipts.xlsx
echo  ======================================
echo.
echo  Press Ctrl+C to stop.
echo.

:: Keep window open
cmd /k
