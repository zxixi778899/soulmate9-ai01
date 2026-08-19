# RunPod Endpoint Recovery Script
# Usage: Replace the endpoint below with your new working one

$apiKey = "rpa_REDACTED"
$newEndpoint = "YOUR_NEW_ENDPOINT_HERE"  # ← Replace with actual endpoint from RunPod Console

$headers = @{
    Authorization = "Bearer $apiKey"
}

Write-Host "Testing endpoint: $newEndpoint" -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod `
        -Uri "https://api.runpod.ai/v2/$newEndpoint/status" `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 10
    
    Write-Host "✅ Endpoint is valid!" -ForegroundColor Green
    Write-Host "Name: $($response.name)"
    Write-Host "Status: $($response.status)"
    Write-Host "Pod Status: $($response.podStatus)"
    
    if ($response.status -eq "OFFLINE") {
        Write-Host "⚠️ Warning: Pod is offline. Spin it up in RunPod Console." -ForegroundColor Yellow
    } else {
        Write-Host "✅ Ready to use!" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Endpoint failed: $_" -ForegroundColor Red
    exit 1
}
