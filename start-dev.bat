@echo off
title Imudist dev server
cd /d "%~dp0"
echo Starting the Imudist dev server. Keep this window open while you work; close it to stop the server.
echo The app opens in your browser at http://127.0.0.1:5174/
echo.
call npm run dev -- --host 127.0.0.1 --port 5174 --open
echo.
echo The server stopped. If the error above says port 5174 is already in use, a server is already running:
echo open http://127.0.0.1:5174/ in the browser, or close the program that holds the port and run this again.
pause
