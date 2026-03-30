@echo off
:: ════════════════════════════════════════════════════════════════════════
:: P2N — Enable Windows Sandbox
:: Enables the Windows Sandbox (Containers-DisposableClientVM) feature
:: Requires Windows 10/11 Pro, Enterprise, or Education with Admin rights
:: ════════════════════════════════════════════════════════════════════════

title P2N — Enable Windows Sandbox

:: ── Check admin privileges ──────────────────────────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] This script must be run as Administrator.
    echo.
    echo  Right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

:: ── Check Windows edition ───────────────────────────────────────────────
for /f "tokens=*" %%i in ('wmic os get Caption /value 2^>nul') do (
    set "%%i" 2>nul
)

echo %Caption% | findstr /i "Home" >nul
if %errorlevel% equ 0 (
    echo.
    echo  [ERROR] Windows Sandbox is NOT available on Windows Home edition.
    echo.
    echo  You need Windows 10/11 Pro, Enterprise, or Education.
    echo  Consider upgrading your Windows edition to use this feature.
    echo.
    pause
    exit /b 1
)

:: ── Check if already enabled ────────────────────────────────────────────
dism /online /get-featureinfo /featurename:Containers-DisposableClientVM 2>nul | findstr /i "State : Enabled" >nul
if %errorlevel% equ 0 (
    echo.
    echo  [OK] Windows Sandbox is already enabled!
    echo.
    echo  You can use the Sandbox button in P2N to safely inspect files.
    echo.
    pause
    exit /b 0
)

:: ── Check virtualization ────────────────────────────────────────────────
echo.
echo  Checking hardware virtualization support...
systeminfo | findstr /i "Virtualization Enabled In Firmware: Yes" >nul
if %errorlevel% neq 0 (
    echo.
    echo  [WARNING] Hardware virtualization may not be enabled.
    echo  Please enable VT-x / AMD-V in your BIOS settings.
    echo  Windows Sandbox requires hardware virtualization.
    echo.
)

:: ── Enable Windows Sandbox ──────────────────────────────────────────────
echo.
echo  Enabling Windows Sandbox (Containers-DisposableClientVM)...
echo.

dism /online /enable-feature /featurename:Containers-DisposableClientVM /all /norestart

if %errorlevel% equ 0 (
    echo.
    echo  ════════════════════════════════════════════════════════════
    echo  [OK] Windows Sandbox has been enabled successfully!
    echo  ════════════════════════════════════════════════════════════
    echo.
    echo  A restart is required to complete the installation.
    echo.
    choice /M "Restart now"
    if %errorlevel% equ 1 (
        shutdown /r /t 5 /c "Restarting to complete Windows Sandbox setup..."
    ) else (
        echo  Please restart your computer manually before using Sandbox.
    )
) else (
    echo.
    echo  [ERROR] Failed to enable Windows Sandbox.
    echo  Error code: %errorlevel%
    echo.
    echo  Possible causes:
    echo    - Virtualization not enabled in BIOS
    echo    - Unsupported Windows edition (Home)
    echo    - Corrupted system files (try: sfc /scannow)
    echo.
)

pause
exit /b 0
