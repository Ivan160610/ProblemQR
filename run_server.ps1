<#
Run this script from PowerShell (preferably Admin) inside the project folder:
  cd "C:\Users\NastavnikiSklad\Desktop\Сайт"
  .\run_server.ps1

What it does:
- checks node/npm
- runs `npm install`
- launches `node server.js` in a new background process
- optionally configures ngrok (asks for authtoken) and launches a tunnel

Note: you must have node/npm and (optionally) ngrok installed and available in PATH.
#>

$ErrorActionPreference = 'Stop'

Write-Host "== Pro Max: Local server + optional ngrok helper ==`n"

# Check node
try {
    $node = (node -v) 2>&1
    $npm = (npm -v) 2>&1
    Write-Host "Node version: $node"
    Write-Host "npm version: $npm`
"
} catch {
    Write-Error "Node.js or npm not found. Please install Node.js LTS from https://nodejs.org and re-run this script."
    exit 1
}

# Install deps
Write-Host "Installing npm dependencies..."
npm install

# Start server
Write-Host "Starting server (node server.js) in background..."
$serverLog = Join-Path $PSScriptRoot "server.log"
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $PSScriptRoot -RedirectStandardOutput $serverLog -RedirectStandardError $serverLog -NoNewWindow -WindowStyle Hidden
Start-Sleep -Milliseconds 500
Write-Host "Server started. Logs: $serverLog"

# Show example check URL
Write-Host "You can check the API locally: http://localhost:3000/api/db`n"

# Ask to run ngrok
$useNgrok = Read-Host "Do you want to create a public tunnel with ngrok? (y/N)"
if ($useNgrok -match '^(y|Y)') {
    # Check ngrok availability
    try {
        $ngrokVersion = (ngrok version) 2>&1
        Write-Host "ngrok found: $ngrokVersion"
    } catch {
        Write-Host "ngrok not found in PATH. Please install ngrok from https://ngrok.com/download and add it to PATH."
        $resp = Read-Host "Open ngrok download page? (Y/n)"
        if ($resp -notmatch '^(n|N)') {
            Start-Process "https://ngrok.com/download"
        }
        exit 0
    }

    $token = Read-Host "Enter your ngrok authtoken (leave empty to skip)":
    if ($token) {
        Write-Host "Configuring ngrok authtoken..."
        ngrok authtoken $token
    }

    Write-Host "Starting ngrok http 3000..."
    Start-Process -FilePath "ngrok" -ArgumentList "http 3000" -NoNewWindow

    Write-Host "ngrok started — open ngrok dashboard or check terminal for public URL."
    Write-Host "If you used Start-Process the interactive window may be separate; run 'ngrok http 3000' manually if you need to see the URL here."
}

Write-Host "All done. If you launched the server, open http://localhost:3000 on this PC."
Write-Host "To access from phone on same Wi-Fi: run `ipconfig` and use http://<IPv4>:3000 on phone browser."

# End
