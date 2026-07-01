import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe-server';
import { getAuthUser } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { plan } = await req.json() as { plan: string };

    const priceMap: Record<string, string> = {
      pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID || '',
      unlimited: process.env.NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID || process.env.STRIPE_UNLIMITED_PRICE_ID || '',
    };

    const priceId = priceMap[plan];
    if (!priceId) {
      return NextResponse.json({ error: 'Stripe not configured - please set price IDs' }, { status: 400 });
    }

    const origin = req.headers.get('origin') || 'http://localhost:5000';

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      metadata: { user_id: user.id, plan },
      success_url: `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}