@echo off
cd /d "%~dp0"

echo ===================================================
echo  Starting Panda Studio...
echo ===================================================
echo.

python server.py %*

if errorlevel 1 (
    echo.
    echo Failed to start Python server. Is Python installed and in your PATH?
    pause
)
