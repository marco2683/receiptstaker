@echo off
title Receipt Taker - Local Server
echo.
echo ========================================
echo   Receipt Taker - Starting Servers
echo ========================================
echo.

:: Get local IP
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" ^| findstr /c:"192." /c:"10." /c:"172."') do (
    set LOCAL_IP=%%a
)
set LOCAL_IP=%LOCAL_IP: =%

echo  Your local network IP: %LOCAL_IP%
echo.
echo  After both servers start:
echo  - PC Browser:    http://localhost:5173
echo  - Phone Browser: http://%LOCAL_IP%:5173
echo.
echo  To install as app on your phone:
echo  - Android Chrome: Menu → "Add to Home Screen"
echo  - iOS Safari: Share → "Add to Home Screen"
echo.
echo ========================================
echo.

:: Start backend in background
echo Starting backend server...
start "Receipt Taker Backend" cmd /c "cd backend && npm run dev"

:: Wait for backend to be ready
timeout /t 3 /nobreak > nul

:: Start frontend (blocks this terminal)
echo Starting frontend server...
cd frontend
npm run dev
