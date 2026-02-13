import { NextResponse } from 'next/server';
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

export async function POST(req: Request) {
  try {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_SECRET;
    const mode = resolvePaypalMode(process.env.PAYPAL_MODE);
    const amount = process.env.PAYPAL_PRO_PRICE || '9.99';

    if (!clientId || !secret) {
      return NextResponse.json({ error: 'PayPal is not configured' }, { status: 503 });
    }

    const baseUrl = getPaypalBaseUrl(mode);
    const accessToken = await getPaypalAccessToken(baseUrl, clientId, secret);

    const origin = new URL(req.url).origin;
    const returnUrl = `${origin}/upgrade?paypal=success`;
    const cancelUrl = `${origin}/upgrade?paypal=cancel`;

    const createRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: 'USD',
              value: amount,
            },
            description: 'Minima Pro Upgrade',
          },
        ],
        application_context: {
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });

    const createJson = await createRes.json();

    if (!createRes.ok) {
      return NextResponse.json({ error: createJson?.message || 'Failed to create PayPal order' }, { status: 500 });
    }

    const approveUrl = (createJson.links || []).find((l: any) => l.rel === 'approve')?.href;

    if (!approveUrl || !createJson.id) {
      return NextResponse.json({ error: 'Missing approval URL from PayPal response' }, { status: 500 });
    }

    return NextResponse.json({
      orderId: createJson.id,
      approveUrl,
      mode,
    });
  } catch (err: any) {
    console.error('[paypal/create-order] error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to start payment' }, { status: 500 });
  }
}
