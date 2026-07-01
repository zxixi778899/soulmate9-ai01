import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('Stripe secret key not configured');
    }
    stripeInstance = new Stripe(key, {
      apiVersion: '2025-03-31.basil' as any,
    });
  }
  return stripeInstance;
}

export function getStripeCustomerId(userId: string): string {
  return `soulmate_${userId}`;
}