import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = process.cwd();
const envFile = process.argv[2] || path.join(root, '.env.local');
const fileEnv = fs.existsSync(envFile)
  ? dotenv.parse(fs.readFileSync(envFile, 'utf8'))
  : {};
const env = { ...fileEnv, ...process.env };
const errors = [];
const warnings = [];

function required(name) {
  const value = String(env[name] || '').trim();
  if (!value) errors.push(`${name} is required`);
  if (/^(placeholder|changeme|your[_-])/i.test(value)) errors.push(`${name} must not use a placeholder value`);
}

function oneOf(name, values) {
  const value = String(env[name] || '').trim();
  if (!values.includes(value)) errors.push(`${name} must be one of: ${values.join(', ')}`);
  return value;
}

const contentMode = oneOf('CONTENT_MODE', ['sfw', 'adult']);
const paymentProvider = oneOf('PAYMENT_PROVIDER', ['disabled', 'stripe', 'approved_adult_merchant']);

[
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'COZE_SUPABASE_URL',
  'COZE_SUPABASE_ANON_KEY',
  'COZE_SUPABASE_SERVICE_ROLE_KEY',
  'COZE_SUPABASE_DB_URL',
  'SUPABASE_STORAGE_BUCKET',
  'SUPABASE_PRIVATE_STORAGE_BUCKET',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SITE_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'CRON_SECRET',
  'SENTRY_DSN',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'LEGAL_ENTITY_NAME',
  'LEGAL_CONTACT_EMAIL',
  'PRIVACY_CONTACT_EMAIL',
  'LEGAL_JURISDICTION',
].forEach(required);

if (!env.RUNPOD_VLLM_URL && !env.COZE_WORKLOAD_IDENTITY_API_KEY) {
  errors.push('Configure at least one production chat provider (RUNPOD_VLLM_URL or COZE_WORKLOAD_IDENTITY_API_KEY)');
}
if (!env.RUNPOD_API_KEY && !env.RUNPOD_COMFYUI_API_KEY) {
  errors.push('Configure RUNPOD_API_KEY or RUNPOD_COMFYUI_API_KEY for image generation');
}
required('RUNPOD_ENDPOINT_ID');

if (String(env.ENABLE_DEBUG_ROUTES || '').toLowerCase() === 'true') {
  errors.push('ENABLE_DEBUG_ROUTES must not be true in production');
}

if (contentMode === 'adult') {
  required('AGE_VERIFICATION_PROVIDER');
  required('CONTENT_SAFETY_PROVIDER');
  required('CONTENT_SAFETY_APPROVAL_REF');
  required('HOSTING_CONTENT_APPROVAL_REF');
  required('PAYMENT_PROVIDER_APPROVAL_REF');
  if (paymentProvider === 'stripe') {
    errors.push('Stripe must not be enabled for an adult deployment; use a provider that approved the disclosed business in writing');
  }
  if (paymentProvider === 'disabled') warnings.push('Adult deployment has payments disabled');
}

if (paymentProvider === 'stripe') {
  required('PAYMENT_PROVIDER_APPROVAL_REF');
  [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_PRO_PRICE_ID',
    'STRIPE_UNLIMITED_PRICE_ID',
    'STRIPE_PRO_YEARLY_PRICE_ID',
    'STRIPE_UNLIMITED_YEARLY_PRICE_ID',
    'STRIPE_TOKENS_100_PRICE_ID',
    'STRIPE_TOKENS_500_PRICE_ID',
    'STRIPE_TOKENS_1000_PRICE_ID',
  ].forEach(required);
  if (env.STRIPE_SECRET_KEY && !String(env.STRIPE_SECRET_KEY).startsWith('sk_live_')) {
    errors.push('STRIPE_SECRET_KEY must be a live key for production');
  }
  if (env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && !String(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).startsWith('pk_live_')) {
    errors.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a live key for production');
  }
  if (env.STRIPE_WEBHOOK_SECRET && !String(env.STRIPE_WEBHOOK_SECRET).startsWith('whsec_')) {
    errors.push('STRIPE_WEBHOOK_SECRET must start with whsec_');
  }
}

if (paymentProvider === 'approved_adult_merchant') {
  required('PAYMENT_PROVIDER_APPROVAL_REF');
  warnings.push('Provider-specific credentials and webhook checks must be added before enabling checkout');
}

if (!env.POSTHOG_API_KEY) warnings.push('POSTHOG_API_KEY is unset; funnel and retention telemetry will be incomplete');
if (!env.ADMIN_ALERT_EMAIL) warnings.push('ADMIN_ALERT_EMAIL is unset; operational alerts have no recipient');

console.log(`Launch check: ${errors.length} error(s), ${warnings.length} warning(s)`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length > 0) process.exit(1);
console.log('Launch configuration gate passed. This validates configuration presence, not vendor approval authenticity.');
