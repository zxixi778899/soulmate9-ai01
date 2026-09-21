#!/usr/bin/env node
/**
 * NOWPayments Configuration Test Script
 * Verifies all necessary environment variables and API connectivity
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// Load environment variables
function loadEnv() {
  try {
    const envContent = readFileSync('.env.local', 'utf-8');
    const envVars = {};
    
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) {
        envVars[match[1]] = match[2];
      }
    });
    
    return envVars;
  } catch (err) {
    log(`Error loading .env.local: ${err.message}`, 'red');
    process.exit(1);
  }
}

// Test 1: Environment Variables Check
function checkEnvironment(env) {
  log('\n🔍 Testing Environment Variables', 'blue');
  log('='.repeat(50));
  
  const required = [
    'NOWPAYMENTS_API_KEY',
    'NOWPAYMENTS_IPN_SECRET',
    'NOWPAYMENTS_PAY_CURRENCY',
    'NEXT_PUBLIC_APP_URL',
  ];
  
  const optional = [
    'CRYPTO_TOKENS_500_PRICE',
    'CRYPTO_TOKENS_1000_PRICE',
    'CRYPTO_TOKENS_2500_PRICE',
    'CRYPTO_TOKENS_5000_PRICE',
    'CRYPTO_TOKENS_10000_PRICE',
  ];
  
  let passed = 0;
  let failed = 0;
  
  // Check required
  for (const key of required) {
    if (env[key] && env[key].length > 5) {
      log(`✓ ${key}: ${env[key].substring(0, 4)}...${'•'.repeat(10)}`, 'green');
      passed++;
    } else {
      log(`✗ ${key}: NOT SET`, 'red');
      failed++;
    }
  }
  
  // Check optional
  log('\n💰 Token Pricing Configuration:', 'yellow');
  for (const key of optional) {
    const value = env[key] || 'NOT SET';
    const displayValue = typeof value === 'string' ? value : '—';
    
    if (displayValue !== 'NOT SET' && !isNaN(displayValue)) {
      const usd = parseFloat(displayValue) / 100;
      log(`  ✓ ${key}: $${usd.toFixed(2)}`, 'green');
      passed++;
    } else {
      log(`  ✗ ${key}: ${value}`, 'red');
      failed++;
    }
  }
  
  return { passed, failed };
}

// Test 2: API Connectivity
async function testApiConnectivity(env) {
  log('\n🌐 Testing NOWPayments API Connectivity', 'blue');
  log('='.repeat(50));
  
  try {
    log('Testing /status endpoint...', 'yellow');
    
    const response = await fetch('https://api.nowpayments.io/v1/status', {
      method: 'GET',
      headers: {
        'x-api-key': env.NOWPAYMENTS_API_KEY,
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      const data = await response.json();
      log(`✓ API Status: ${data?.message || 'OK'}`, 'green');
      
      if (data.message.includes('online')) {
        log('  → NOWPayments API is ONLINE', 'green');
        return true;
      } else {
        log('  ⚠ API returned but status unclear', 'yellow');
        return false;
      }
    } else {
      const errorText = await response.text().catch(() => '');
      log(`✗ API Error: HTTP ${response.status}`, 'red');
      log(`  Response: ${errorText.substring(0, 100)}`, 'red');
      return false;
    }
  } catch (err) {
    log(`✗ Connection Failed: ${err.message}`, 'red');
    return false;
  }
}

// Test 3: List Available Currencies
async function testCurrencies(env) {
  log('\n💵 Testing Currency Availability', 'blue');
  log('='.repeat(50));
  
  try {
    const response = await fetch('https://api.nowpayments.io/v1/currencies', {
      method: 'GET',
      headers: {
        'x-api-key': env.NOWPAYMENTS_API_KEY,
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      const data = await response.json();
      const currencies = data.currencies || [];
      
      log(`✓ Total currencies available: ${currencies.length}`, 'green');
      
      // Check for popular cryptocurrencies
      const popular = ['btc', 'eth', 'usdt'];
      const found = popular.filter(c => currencies.includes(c));
      
      log('Popular currencies found:', 'yellow');
      found.forEach(c => log(`  ✓ ${c.toUpperCase()}`, 'green'));
      
      if (found.length < popular.length) {
        const missing = popular.filter(c => !found.includes(c));
        log('Notable currencies not in list:', 'yellow');
        missing.forEach(c => log(`  ⚠ ${c.toUpperCase()}`, 'yellow'));
      }
      
      return true;
    } else {
      log('✗ Failed to fetch currencies', 'red');
      return false;
    }
  } catch (err) {
    log(`✗ Currency test failed: ${err.message}`, 'red');
    return false;
  }
}

// Test 4: Estimate Price
async function testPriceEstimate(env) {
  log('\n💲 Testing Price Estimation', 'blue');
  log('='.repeat(50));
  
  try {
    const amount = 10.00;
    const currencyFrom = 'usd';
    const currencyTo = env.NOWPAYMENTS_PAY_CURRENCY || 'usdttrc20';
    
    const url = new URL('https://api.nowpayments.io/v1/price');
    url.searchParams.set('amount', amount.toString());
    url.searchParams.set('currency_from', currencyFrom);
    url.searchParams.set('currency_to', currencyTo);
    
    log(`Getting price for $${amount} USD → ${currencyTo.toUpperCase()}`, 'yellow');
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': env.NOWPAYMENTS_API_KEY,
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (response.ok) {
      const data = await response.json();
      log(`✓ Estimated amount: ${data.estimated_amount} ${currencyTo.toUpperCase()}`, 'green');
      log(`  Rate: ${data.rate} ${currencyTo.toUpperCase()}/USD`, 'yellow');
      return true;
    } else {
      log('✗ Price estimate failed', 'red');
      return false;
    }
  } catch (err) {
    log(`✗ Price test failed: ${err.message}`, 'red');
    return false;
  }
}

// Main execution
async function main() {
  log('\n🚀 NOWPayments Configuration Validator', 'blue');
  log('='.repeat(50));
  
  // Load environment
  const env = loadEnv();
  
  // Run tests
  const { passed, failed } = checkEnvironment(env);
  
  let apiOk = false;
  let currenciesOk = false;
  let priceOk = false;
  
  if (passed > 0) {
    apiOk = await testApiConnectivity(env);
    currenciesOk = await testCurrencies(env);
    priceOk = await testPriceEstimate(env);
  }
  
  // Summary
  log('\n' + '='.repeat(50), 'blue');
  log('📊 Test Summary', 'blue');
  log('='.repeat(50));
  
  const totalTests = 4;
  const passedTests = 
    (passed > 0 ? 1 : 0) + 
    (apiOk ? 1 : 0) + 
    (currenciesOk ? 1 : 0) + 
    (priceOk ? 1 : 0);
  
  log(`Passed: ${passedTests}/${totalTests}`, passedTests === totalTests ? 'green' : 'yellow');
  
  if (failed > 0) {
    log(`⚠ Environment issues: ${failed} missing fields`, 'yellow');
  }
  
  log('\n🎯 Recommendations:', 'blue');
  if (failed > 0) {
    log('  • Complete all required environment variables', 'yellow');
  }
  if (!apiOk) {
    log('  • Check API Key validity', 'yellow');
    log('  • Verify network can reach api.nowpayments.io', 'yellow');
  }
  if (!currenciesOk) {
    log('  • Add preferred currencies in NOWPayments dashboard', 'yellow');
  }
  if (!priceOk) {
    log('  • Contact NOWPayments support if issue persists', 'yellow');
  }
  
  if (passedTests === totalTests) {
    log('\n✅ All tests passed! Ready for production use.', 'green');
  } else {
    log('\n⚠ Some tests failed. Please review above output.', 'yellow');
    process.exit(1);
  }
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'red');
  process.exit(1);
});
