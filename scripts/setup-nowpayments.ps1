# NOWPayments Environment Variables Setup Script
# This script automates adding environment variables to Vercel

$apiKey = "162736a2-82ea-4a6b-85b5-18b0f72cd132"
$ipnSecret = "GFCGj/3nMWA7wRuW0FRcFfC6/1KfEtPU"

$envVars = @(
    @{ Name="NOWPAYMENTS_API_KEY"; Value=$apiKey },
    @{ Name="NOWPAYMENTS_IPN_SECRET"; Value=$ipnSecret },
    @{ Name="NOWPAYMENTS_PAY_CURRENCY"; Value="usdttrc20" },
    @{ Name="CRYPTO_TOKENS_500_PRICE"; Value="599" },
    @{ Name="CRYPTO_TOKENS_1000_PRICE"; Value="999" },
    @{ Name="CRYPTO_TOKENS_2500_PRICE"; Value="2299" },
    @{ Name="CRYPTO_TOKENS_5000_PRICE"; Value="3999" },
    @{ Name="CRYPTO_TOKENS_10000_PRICE"; Value="6999" }
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "NOWPayments Configuration Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nThis will add 8 environment variables to your Vercel project." -ForegroundColor Yellow
Write-Host "Make sure you are logged into Vercel: vercel login`n" -ForegroundColor Yellow

$confirm = Read-Host "Do you want to proceed? (y/n)"

if ($confirm -ne 'y') {
    Write-Host "Aborted by user." -ForegroundColor Yellow
    exit 0
}

foreach ($var in $envVars) {
    Write-Host "Adding ${Name}: ****" -ForegroundColor Green
    
    # Create JSON body for the API call
    $body = @{
        name = $var.Name
        value = $var.Value
        target = @("production")
    } | ConvertTo-Json

    try {
        # Use Vercel API to add environment variable
        $response = Invoke-RestMethod -Uri "https://api.vercel.com/v1/projects/soulmate9-ai01/env" `
            -Method Post `
            -Headers @{ Authorization = "Bearer $(Get-Content $env:VERCEL_TOKEN -ErrorAction SilentlyContinue)" } `
            -ContentType "application/json" `
            -Body $body
        
        Write-Host "✅ Added ${var.Name}" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to add ${var.Name}: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nAll environment variables configured! Now go to Vercel Dashboard and redeploy.`n" -ForegroundColor Cyan
