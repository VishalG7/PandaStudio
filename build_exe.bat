@echo off
cd /d "%~dp0"

echo ===================================================
echo  Building 🐼 Panda Studio Standalone Executable...
echo ===================================================
echo.

python -m PyInstaller --clean PandaStudio.spec

if errorlevel 1 (
    echo.
    echo Build failed. Make sure PyInstaller is installed (python -m pip install pyinstaller).
    pause
    exit /b 1
)

echo.
echo ===================================================
echo  Build Succeeded!
echo  Executable created at: dist\PandaStudio.exe
echo ===================================================
echo.
pause
