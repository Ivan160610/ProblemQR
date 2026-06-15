@echo off
REM Helper to install dependencies and start the Pro Max server.
cd /d "%~dp0"

echo Checking Node.js and npm...
node -v
if ERRORLEVEL 1 goto node_error
npm -v
if ERRORLEVEL 1 goto node_error

echo Installing npm dependencies...
npm install
if ERRORLEVEL 1 goto npm_error

echo Starting Node server on port 3000...
start "ProMax Server" cmd /k "node server.js"
echo Server started. Open http://localhost:3000 on this PC.

echo.
echo If you want to use ngrok, run:
echo   ngrok http 3000

goto end

:node_error
echo Node.js is not installed or not available in PATH. Install Node.js from https://nodejs.org.
goto end

:npm_error
echo npm install failed. Check the output above.
goto end

:end
pause
