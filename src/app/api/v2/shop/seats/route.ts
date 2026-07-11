import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe-server';
import { logger } from '@/lib/logger';
import { COMPANION_SEAT_PACKAGES } from '@/lib/constants';
import { getSeatStatus, packageById } from '@/lib/companion-seats';

/**
 * GET  /api/v2/shop/seats — packages + current seat status
 * POST /api/v2/shop/seats — Stripe checkout for permanent seat packs
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user || !auth.client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const seats = await getSeatStatus(auth.client, auth.user.id);
    return NextResponse.json({
      packages: COMPANION_SEAT_PACKAGES,
      seats,
    });
  } catch (err: unknown) {
    logger.error('[shop/seats] GET error', { error: String(err) });
    return NextResponse.json({ error: 'Failed to load seat packages' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user || !auth.client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const packageId = body.package_id as string | undefined;
    if (!packageId) {
      return NextResponse.json({ error: 'Missing package_id' }, { status: 400 });
    }

    const pack = packageById(packageId);
    if (!pack) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:5000';

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: pack.price_cents,
            product_data: {
              name: pack.name,
              description: `Permanent +${pack.seats} companion seat(s)`,
              tax_code: 'txcd_10000000',
            },
            tax_behavior: 'exclusive',
          },
          quantity: 1,
        },
      ],
      customer_email: auth.user.email || undefined,
      client_reference_id: auth.user.id,
      metadata: {
        type: 'companion_seats',
        user_id: auth.user.id,
        package_id: pack.id,
        seats: String(pack.seats),
        price_cents: String(pack.price_cents),
      },
      success_url: `${origin}/shop?checkout=success&seats=${pack.seats}`,
      cancel_url: `${origin}/shop?checkout=canceled`,
      automatic_tax: { enabled: true },
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
    });

    return NextResponse.json({
      status: 'checkout_created',
      url: session.url,
      package: pack,
    });
  } catch (err: unknown) {
    logger.error('[shop/seats] POST error', { error: String(err) });
    const msg = err instanceof Error ? err.message : 'Failed to purchase seats';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
