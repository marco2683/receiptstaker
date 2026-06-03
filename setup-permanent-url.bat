@echo off
title Receipt Taker - One-Time Setup
cls
echo.
echo  ============================================
echo   Receipt Taker - Permanent URL Setup
echo  ============================================
echo.
echo  This sets up a permanent URL so you can
echo  access the app from anywhere (not just WiFi).
echo.
echo  Step 1: Go to https://dashboard.ngrok.com/signup
echo          Sign up with GitHub (it's free)
echo.
echo  Step 2: Go to https://dashboard.ngrok.com/get-started/your-authtoken
echo          Copy your authtoken
echo.
pause

set /p AUTHTOKEN=Paste your ngrok authtoken here: 

if "%AUTHTOKEN%"=="" (
    echo  [!] No token entered. Exiting.
    pause
    exit /b 1
)

echo.
echo  Configuring ngrok...
ngrok config add-authtoken %AUTHTOKEN%

echo.
echo  Step 3: Go to https://dashboard.ngrok.com/domains
echo          Click "Create Domain" to get your free URL
echo          Copy the domain (e.g. something-random.ngrok-free.app)
echo.
pause

set /p DOMAIN=Paste your ngrok domain here: 

if "%DOMAIN%"=="" (
    echo  [!] No domain entered. Exiting.
    pause
    exit /b 1
)

:: Save domain for start.bat
echo %DOMAIN%> ngrok_domain.txt

echo.
echo  ============================================
echo   SETUP COMPLETE!
echo  ============================================
echo.
echo   Your permanent URL: https://%DOMAIN%
echo   Saved to ngrok_domain.txt
echo.
echo   Now run start.bat to launch everything.
echo  ============================================
echo.
pause
