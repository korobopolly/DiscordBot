@echo off
REM Stop Discord Bot
taskkill /F /IM node.exe /FI "WINDOWTITLE eq npm*" 2>nul
taskkill /F /IM node.exe 2>nul
echo Bot stopped.
pause
