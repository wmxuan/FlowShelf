@echo off
chcp 65001 >nul 2>&1
REM FlowShelf Windows Install Script
REM Registers Native Messaging Host via Windows Registry

setlocal enabledelayedexpansion

set HOST_NAME=com.flowshelf.backend
set SCRIPT_DIR=%~dp0
set BACKEND_BIN=%SCRIPT_DIR%flowshelf-backend.exe
set EXTENSION_ID=dkkdefbjgcoepbdjdddaidllmkhpnadn

echo ========================================
echo   FlowShelf Windows Install
echo ========================================
echo.

REM 1. Check backend binary
if not exist "%BACKEND_BIN%" (
  echo [X] Backend binary not found: %BACKEND_BIN%
  echo    Please ensure flowshelf-backend.exe is in the same directory.
  pause
  exit /b 1
)
echo [OK] Backend binary found

REM 2. Create Native Messaging Host manifest
set MANIFEST_DIR=%SCRIPT_DIR%native-host
if not exist "%MANIFEST_DIR%" mkdir "%MANIFEST_DIR%"
set MANIFEST_FILE=%MANIFEST_DIR%\%HOST_NAME%.json

REM Write JSON manifest (escape backslashes in path)
set ESCAPED_BIN=%BACKEND_BIN:\=\\%
(
  echo {
  echo   "name": "%HOST_NAME%",
  echo   "description": "FlowShelf Backend Server",
  echo   "path": "%ESCAPED_BIN%",
  echo   "type": "stdio",
  echo   "allowed_origins": [
  echo     "chrome-extension://%EXTENSION_ID%/"
  echo   ]
  echo }
) > "%MANIFEST_FILE%"

echo [OK] Native Messaging Host manifest created
echo    Location: %MANIFEST_FILE%

REM 3. Write to Windows Registry (Google Chrome)
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_FILE%" /f >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [OK] Registry updated ^(Google Chrome^)
) else (
  echo [WARN] Registry write failed, please register manually
)

REM Also register for Chromium (optional)
reg add "HKCU\Software\Chromium\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_FILE%" /f >nul 2>&1

REM 4. Create data directory
if not exist "%USERPROFILE%\.flowshelf" mkdir "%USERPROFILE%\.flowshelf"
echo [OK] Data directory created: %USERPROFILE%\.flowshelf

echo.
echo ========================================
echo   Next steps:
echo.
echo   1. Open Chrome browser
echo   2. Go to chrome://extensions
echo   3. Enable "Developer mode" (top right)
echo   4. Click "Load unpacked"
echo   5. Select folder: %SCRIPT_DIR%flowshelf-extension
echo.
echo   After loading the extension, FlowShelf backend
echo   will start automatically!
echo ========================================

pause
