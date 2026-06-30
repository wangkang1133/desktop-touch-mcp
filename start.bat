@echo off
:: desktop-touch-mcp — 快速启动脚本
:: 1. 从 https://github.com/Harusame64/desktop-touch-mcp/releases 下载 zip
:: 2. 解压所有文件到当前文件夹
:: 3. 双击此 .bat 文件（或运行: start.bat --http --port 23847 --key YOUR_KEY）

setlocal

:: 检查 Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [错误] Node.js 未安装或不在 PATH 中。
    echo 请从 https://nodejs.org/ 下载安装
    pause
    exit /b 1
)

:: 将所有参数传递给服务器
node "%~dp0dist\index.js" %*

endlocal
