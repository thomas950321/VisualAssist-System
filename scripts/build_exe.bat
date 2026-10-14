@echo off
chcp 65001 >nul
title 編譯 一鍵啟動_視覺輔助系統.exe

set "CSC_PATH="
if exist "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
    set "CSC_PATH=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
) else if exist "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe" (
    set "CSC_PATH=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if "%CSC_PATH%"=="" (
    echo [提示] 未找到 .NET Framework 4.0 編譯器 csc.exe，跳過 exe 編譯。
    exit /b 1
)

echo [編譯中] 正在使用 Windows 內建 .NET 編譯器生成原生執行檔...
"%CSC_PATH%" /nologo /target:exe /out:"%~dp0..\一鍵啟動_視覺輔助系統.exe" "%~dp0Launcher.cs"

if %errorlevel% equ 0 (
    echo [成功] 原生執行檔已生成於專案根目錄：一鍵啟動_視覺輔助系統.exe
) else (
    echo [失敗] 編譯失敗，錯誤碼: %errorlevel%
)
