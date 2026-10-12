@echo off
cd /d "%~dp0"
echo ===================================================
echo   Starting Aromas Local Server on port 8085
echo ===================================================
echo.
echo Local URLs:
echo   - Customer App: http://localhost:8085/index.html
echo   - Kitchen KDS:  http://localhost:8085/kitchen.html
echo.
echo Launching server and opening browser...
start "" python -m http.server 8085
timeout /t 2 /nobreak >nul
start http://localhost:8085/index.html
echo.
echo Server is running! Keep this window open or press any key to close this helper.
pause

