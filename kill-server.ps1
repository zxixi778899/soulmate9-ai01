# Kill Next.js dev server script for Windows

$processId = 116992
$port = 5001

Write-Host "Attempting to stop Node.js process on port $port (PID: $processId)..." -ForegroundColor Yellow

try {
    # Method 1: Try Stop-Process with force
    Get-Process | Where-Object {$_.Id -eq $processId} | Stop-Process -Force -ErrorAction SilentlyContinue
    
    if ($?) {
        Write-Host "✅ Process stopped successfully via Stop-Process" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Stop-Process failed or process already gone" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error stopping process: $_" -ForegroundColor Red
}

# Wait a moment
Start-Sleep -Seconds 2

# Check if port is still in use
$status = netstat -ano | findstr ":$port.*LISTENING"

if ($status) {
    Write-Host "❌ Port $port is still in use!" -ForegroundColor Red
    Write-Host "Please manually kill the process using:" -ForegroundColor Yellow
    Write-Host "taskkill /F /PID $processId" -ForegroundColor Cyan
    exit 1
} else {
    Write-Host "✅ Port $port is now free!" -ForegroundColor Green
}
