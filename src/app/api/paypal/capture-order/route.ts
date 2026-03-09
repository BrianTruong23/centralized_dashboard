import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getPaypalBaseUrl, resolvePaypalMode } from '@/lib/paypal';

async function getPaypalAccessToken(baseUrl: string, clientId: string, secret: string): Promise<string> {
  const basic = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token error (${res.status}): ${text}`);
  }

  const json = await res.json();
  return json.access_token;
}

async function getUserFromAccessToken(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase auth is not configured');
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data?.user) throw new Error('Unauthorized');
  return data.user;
}

async function upsertProSubscription(userToken: string, userId: string, paypalOrderId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase anon key is not configured');
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/user_subscriptions?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      tier: 'pro',
      status: 'active',
      provider: 'paypal',
      provider_subscription_id: paypalOrderId,
      plan_type: 'one_time',
      last_payment_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to persist subscription (${res.status}): ${text}`);
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_SECRET;
    const mode = resolvePaypalMode(process.env.PAYPAL_MODE);

    if (!clientId || !secret) {
      return NextResponse.json({ error: 'PayPal is not configured' }, { status: 503 });
    }

    const user = await getUserFromAccessToken(token);

    const baseUrl = getPaypalBaseUrl(mode);
    const paypalToken = await getPaypalAccessToken(baseUrl, clientId, secret);

    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paypalToken}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const captureJson = await captureRes.json();

    if (!captureRes.ok) {
      return NextResponse.json(
        { error: captureJson?.message || 'Payment capture failed', details: captureJson },
        { status: 400 }
      );
    }

    if (captureJson?.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Payment was not completed', details: captureJson }, { status: 400 });
    }

    await upsertProSubscription(token, user.id, orderId);

    return NextResponse.json({ ok: true, isPro: true });
  } catch (err: unknown) {
    console.error('[paypal/capture-order] error:', err);
    const message = err instanceof Error ? err.message : 'Failed to complete upgrade';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
