import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('Stripe secret key not configured');
    }
    stripeInstance = new Stripe(key, {
      // Pin API version; cast needed when installed stripe types lag pin string
      apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
    });
  }
  return stripeInstance;
}

export function getStripeCustomerId(userId: string): string {
  return `soulmate_${userId}`;
}