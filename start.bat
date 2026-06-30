@echo off
:: desktop-touch-mcp — 一键启动
:: 解压后双击此文件即可，无需其他操作

setlocal
title desktop-touch-mcp

:: 检查 Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [错误] 未检测到 Node.js
    echo  请从 https://nodejs.org 下载安装后重试
    echo.
    pause
    exit /b 1
)

:: 首次运行：自动安装依赖
if not exist "%~dp0node_modules" (
    echo.
    echo  [首次运行] 正在安装依赖，请稍候...
    echo.
    cd /d "%~dp0"
    call npm install --omit=dev --no-fund --no-audit 2>nul
    if errorlevel 1 (
        echo.
        echo  [错误] 依赖安装失败，请检查网络连接
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  [完成] 依赖安装成功
    echo.
)

:: 启动服务器
cd /d "%~dp0"
if "%1"=="" (
    echo  正在启动 desktop-touch-mcp (stdio 模式)...
    echo  按 Ctrl+C 停止
    echo.
    node dist\index.js
) else (
    node dist\index.js %*
)

endlocal
