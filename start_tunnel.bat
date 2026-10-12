@echo off
cd /d "%~dp0"
echo ===================================================
echo   Starting Aromas Server & Cloudflare Tunnel
echo ===================================================
start "" python -m http.server 8085
timeout /t 2 /nobreak >nul
echo.
echo Launching Cloudflare Tunnel...
echo Look for your 'https://*.trycloudflare.com' link below:
echo.
cloudflared.exe tunnel --url http://localhost:8085
pause
