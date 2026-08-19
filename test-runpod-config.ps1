# RunPod Configuration Test
Write-Host "=== RunPod API Connection Test ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  API Key: rpa_REDACTED" -ForegroundColor White
Write-Host "  Endpoint: e40cgshtouocg8" -ForegroundColor White
Write-Host ""

$apiKey = "rpa_REDACTED"
$endpointId = "e40cgshtouocg8"

# Test 1: Check endpoint status
Write-Host "[1/4] Testing endpoint status..." -ForegroundColor Gray
try {
    $response = Invoke-RestMethod `
        -Uri "https://api.runpod.ai/v2/$endpointId/status" `
        -Method Get `
        -Headers @{ Authorization = "Bearer $apiKey" } `
        -TimeoutSec 10
    
    Write-Host "✅ SUCCESS! Endpoint is accessible!" -ForegroundColor Green
    Write-Host "   Status: $($response.status)"
    Write-Host "   PodStatus: $($response.podStatus)"
} catch {
    Write-Host "❌ FAILED! Error code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader $_.Exception.Response.GetResponseStream()
        $responseBody = $reader.ReadToEnd().Trim()
        Write-Host "   Response: $($responseBody.Substring(0, [Math]::Min($responseBody.Length, 100)))" -ForegroundColor DarkGray
    }
    
    # Suggest manual test in browser
    Write-Host ""
    Write-Host "⚠️  Possible Issues:" -ForegroundColor Yellow
    Write-Host "   • API Key might be invalid or expired" -ForegroundColor Gray
    Write-荷 "   • You don't have permission to access this endpoint" -ForegroundColor Gray
    Write-Host "   • Network/Firewall blocking RunPod API" -ForegroundColor Gray
    Write-Host "   • Try generating a NEW API Key from RunPod Console" -ForegroundColor Cyan
}
