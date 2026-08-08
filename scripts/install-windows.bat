@echo off
REM FlowShelf Windows 安装脚本
REM 注册 Native Messaging Host（通过注册表）

setlocal enabledelayedexpansion

set HOST_NAME=com.flowshelf.backend
set SCRIPT_DIR=%~dp0
set BACKEND_BIN=%SCRIPT_DIR%flowshelf-backend.exe

REM TODO: 替换为实际的扩展 ID（由 manifest.json 中的 key 决定）
REM 当前 key 对应的扩展 ID 为 3aa3451962e4f139333083bbca7fd03d
set EXTENSION_ID=3aa3451962e4f139333083bbca7fd03d

echo ========================================
echo   FlowShelf Windows 安装
echo ========================================
echo.

REM 1. 检查后端二进制
if not exist "%BACKEND_BIN%" (
  echo [X] 找不到后端二进制: %BACKEND_BIN%
  echo    请确认 flowshelf-backend.exe 位于脚本同级目录
  pause
  exit /b 1
)
echo [OK] 后端二进制已找到

REM 2. 创建 Native Messaging Host 清单文件
set MANIFEST_DIR=%SCRIPT_DIR%native-host
if not exist "%MANIFEST_DIR%" mkdir "%MANIFEST_DIR%"
set MANIFEST_FILE=%MANIFEST_DIR%\%HOST_NAME%.json

echo {> "%MANIFEST_FILE%"
echo   "name": "%HOST_NAME%",>> "%MANIFEST_FILE%"
echo   "description": "FlowShelf Backend Server",>> "%MANIFEST_FILE%"
echo   "path": "%BACKEND_BIN:\=\\%",>> "%MANIFEST_FILE%"
echo   "type": "stdio",>> "%MANIFEST_FILE%"
echo   "allowed_origins": [>> "%MANIFEST_FILE%"
echo     "chrome-extension://%EXTENSION_ID%/">> "%MANIFEST_FILE%"
echo   ]>> "%MANIFEST_FILE%"
echo }>> "%MANIFEST_FILE%"

echo [OK] Native Messaging Host 清单已创建
echo    位置: %MANIFEST_FILE%

REM 3. 写入注册表
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_FILE%" /f >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo [OK] 注册表已写入 (Google Chrome^)
) else (
  echo [WARN] 注册表写入失败，请手动注册
)

REM 4. 创建数据目录
if not exist "%USERPROFILE%\.flowshelf" mkdir "%USERPROFILE%\.flowshelf"
echo [OK] 数据目录已创建: %USERPROFILE%\.flowshelf

echo.
echo ========================================
echo   接下来请手动完成以下步骤：
echo.
echo   1. 打开 Chrome 浏览器
echo   2. 访问 chrome://extensions
echo   3. 开启右上角「开发者模式」
echo   4. 点击「加载已解压的扩展程序」
echo   5. 选择目录: %SCRIPT_DIR%flowshelf-extension
echo.
echo   扩展加载后，FlowShelf 后端会自动启动！
echo ========================================

pause
