@echo off
chcp 65001 > nul
cd /d "%~dp0"

if not defined PORT set PORT=3005

echo.
echo =========================================
echo   CODE 205 local server
echo   http://localhost:%PORT%
echo   (Ctrl+C to stop)
echo =========================================
echo.

if not exist "node_modules" (
    echo node_modules not found. Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

node src/server.js

echo.
echo Server stopped.
pause
