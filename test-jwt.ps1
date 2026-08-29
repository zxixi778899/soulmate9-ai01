# Test JWT parsing
$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2Ymxya25nenV5eGVlb3NsemtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTcxNDgsImV4cCI6MjA5ODQ5MzE0OH0.MrWduKdUaJf8V5r-S14XLERHQijV8wF74Pvko72TNkQ"
$parts = $key -split '\.'

$payload = $parts[1]
Write-Host "Payload: $payload"
Write-Host "Length: $($payload.Length)"

# Add padding if needed
$paddingNeeded = (4 - ($payload.Length % 4))
if ($paddingNeeded -eq 4) { $paddingNeeded = 0 }
$padded = $payload + ("=" * $paddingNeeded)

try {
    $decodedBytes = [Convert]::FromBase64String($padded)
    $jsonStr = [System.Text.Encoding]::UTF8.GetString($decodedBytes)
    $json = $jsonStr | ConvertFrom-Json
    
    Write-Host "`n✅ Successfully parsed!"
    Write-Host "iss: $($json.iss)"
    Write-Host "ref: $($json.ref)"
    Write-Host "role: $($json.role)"
    Write-Host "exp: $($json.exp)"
    
} catch {
    Write-Host "❌ Failed to parse: $_"
    Write-Host "Error details: $($_.Exception.Message)"
}
