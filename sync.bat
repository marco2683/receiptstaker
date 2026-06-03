@echo off
echo ================================================
echo   Receipt Taker - Sync Spreadsheet from Cloud
echo ================================================
echo.

set API_URL=https://receiptstaker-production.up.railway.app/api
set LOCAL_DATA=data

if not exist "%LOCAL_DATA%" mkdir "%LOCAL_DATA%"

echo Downloading latest spreadsheet...
curl -L -o "%LOCAL_DATA%\receipts.xlsx" "%API_URL%/spreadsheet/download"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ Spreadsheet saved to: %LOCAL_DATA%\receipts.xlsx
    echo    Open it in Excel to review your entries.
) else (
    echo.
    echo ❌ Failed to download. Is the backend running?
)

echo.
pause
