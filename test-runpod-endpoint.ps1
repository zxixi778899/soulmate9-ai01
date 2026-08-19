# RunPod Endpoints Quick Test Script

$apiKey1 = "rpa_REDACTED"  # Latest provided key
$endpointId = "wozrrlcdipyl3p"

Write-Host "Testing endpoint: $endpointId" -ForegroundColor Cyan
Write-Host "Using API Key: $($apiKey1.Substring(0,20))..." -ForegroundColor Yellow

# Test with the new API Key
try {
    $response = Invoke-RestMethod `
        -Uri "https://api.runpod.ai/v2/$endpointId/status" `
        -Method Get `
        -Headers @{ Authorization = "Bearer $apiKey1" } `
        -TimeoutSec 10
    
    Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
    Write-Host "Endpoint Status: $($response.status)"
    Write-Host "Pod Status: $($response.podStatus)"
    Write-Host "Network Type: $($response.networkType)"
} catch {
    Write-Host "`n=== ERROR ===" -ForegroundColor Red
    Write-Host "Error Code: $($_.Exception.Response.StatusCode)"
    Write-Host "Error Message: $($_.Exception.Message)"
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader $_.Exception.Response.GetResponseStream()
        $reader.DiscardEntityBody = $true
        Write-Host "Response Body: $(($reader.ReadToEnd()).Trim())"
    }
}
