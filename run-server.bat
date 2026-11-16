@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Bitte zuerst Node.js 18 oder neuer installieren: https://nodejs.org/ & pause & exit /b 1)
if not exist node_modules call npm install
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
npm start
pause
