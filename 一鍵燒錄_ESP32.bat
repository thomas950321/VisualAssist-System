@echo off
setlocal
cd /d "%~dp0"
echo ==============================================================
echo  [VisualAssist System] Initializing ESP32 Flasher...
echo ==============================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $code = [System.IO.File]::ReadAllText('scripts\flash_esp32.ps1', [System.Text.Encoding]::UTF8); & ([ScriptBlock]::Create($code))"
if %errorlevel% neq 0 (
    echo.
    echo ==============================================================
    echo [ERROR] Flasher stopped unexpectedly with code %errorlevel%.
    echo ==============================================================
    pause
)
