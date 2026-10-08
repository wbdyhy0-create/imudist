@echo off
title Imudist in WebKit
cd /d "%~dp0"
rem the engine is kept inside this folder (not in the user's AppData), so that it is found whoever installed it
set PLAYWRIGHT_BROWSERS_PATH=0
if not exist node_modules (
  echo First run: installing the test library ^(a few MB^)...
  call npm install || goto failed
)
if not exist node_modules\playwright-core\.local-browsers\webkit-* (
  echo Installing the WebKit engine ^(about 170 MB, once^)...
  call npx playwright install webkit || goto failed
)
call node open.mjs %1
if errorlevel 1 pause
exit /b 0

:failed
echo The installation failed.
pause
exit /b 1
