import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PAYPAL_CONFIG, getPayPalAccessToken } from '@/lib/paypal';

/**
 * POST /api/paypal/webhook
 * Handles PayPal webhook events for subscription updates
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const webhookId = PAYPAL_CONFIG.webhookId;

    // Verify webhook signature (important for security)
    if (webhookId) {
      const verified = await verifyWebhookSignature(request, body, webhookId);
      if (!verified) {
        console.error('Invalid webhook signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    const eventType = body.event_type;
    const resource = body.resource;

    console.log('PayPal webhook event:', eventType);

    // Handle different event types
    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handleSubscriptionActivated(resource);
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handleSubscriptionCancelled(resource);
        break;

      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await handleSubscriptionExpired(resource);
        break;

      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await handleSubscriptionSuspended(resource);
        break;

      case 'BILLING.SUBSCRIPTION.UPDATED':
        await handleSubscriptionUpdated(resource);
        break;

      case 'PAYMENT.SALE.COMPLETED':
        // Payment successful
        console.log('Payment completed for subscription:', resource.billing_agreement_id);
        break;

      case 'PAYMENT.SALE.REFUNDED':
        // Payment refunded
        await handlePaymentRefunded(resource);
        break;

      default:
        console.log('Unhandled webhook event:', eventType);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Verify PayPal webhook signature
 */
async function verifyWebhookSignature(
  request: NextRequest,
  body: any,
  webhookId: string
): Promise<boolean> {
  try {
    const accessToken = await getPayPalAccessToken();
    const baseUrl =
      PAYPAL_CONFIG.mode === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    const headers = {
      'paypal-transmission-id': request.headers.get('paypal-transmission-id') || '',
      'paypal-transmission-time': request.headers.get('paypal-transmission-time') || '',
      'paypal-transmission-sig': request.headers.get('paypal-transmission-sig') || '',
      'paypal-cert-url': request.headers.get('paypal-cert-url') || '',
      'paypal-auth-algo': request.headers.get('paypal-auth-algo') || '',
    };

    const response = await fetch(
      `${baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transmission_id: headers['paypal-transmission-id'],
          transmission_time: headers['paypal-transmission-time'],
          cert_url: headers['paypal-cert-url'],
          auth_algo: headers['paypal-auth-algo'],
          transmission_sig: headers['paypal-transmission-sig'],
          webhook_id: webhookId,
          webhook_event: body,
        }),
      }
    );

    const result = await response.json();
    return result.verification_status === 'SUCCESS';
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Handle subscription activated event
 */
async function handleSubscriptionActivated(resource: any) {
  if (!supabase) throw new Error('Supabase not configured');

  const userId = resource.custom_id;
  if (!userId) {
    console.error('No user ID in subscription resource');
    return;
  }

  await supabase
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      is_premium: true,
      subscription_id: resource.id,
      subscription_status: 'ACTIVE',
      plan_id: resource.plan_id,
      payment_provider: 'paypal',
      subscription_start_date: resource.start_time || new Date().toISOString(),
      subscription_end_date: resource.billing_info?.next_billing_time || null,
    });
}

/**
 * Handle subscription cancelled event
 */
async function handleSubscriptionCancelled(resource: any) {
  if (!supabase) throw new Error('Supabase not configured');

  await supabase
    .from('user_subscriptions')
    .update({
      is_premium: false,
      subscription_status: 'CANCELLED',
    })
    .eq('subscription_id', resource.id);
}

/**
 * Handle subscription expired event
 */
async function handleSubscriptionExpired(resource: any) {
  if (!supabase) throw new Error('Supabase not configured');

  await supabase
    .from('user_subscriptions')
    .update({
      is_premium: false,
      subscription_status: 'EXPIRED',
    })
    .eq('subscription_id', resource.id);
}

/**
 * Handle subscription suspended event
 */
async function handleSubscriptionSuspended(resource: any) {
  if (!supabase) throw new Error('Supabase not configured');

  await supabase
    .from('user_subscriptions')
    .update({
      is_premium: false,
      subscription_status: 'SUSPENDED',
    })
    .eq('subscription_id', resource.id);
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(resource: any) {
  if (!supabase) throw new Error('Supabase not configured');

  await supabase
    .from('user_subscriptions')
    .update({
      subscription_status: resource.status,
      is_premium: resource.status === 'ACTIVE',
      subscription_end_date: resource.billing_info?.next_billing_time || null,
    })
    .eq('subscription_id', resource.id);
}

/**
 * Handle payment refunded event
 */
async function handlePaymentRefunded(resource: any) {
  if (!supabase) throw new Error('Supabase not configured');

  const subscriptionId = resource.billing_agreement_id;
  if (subscriptionId) {
    // Mark subscription as inactive due to refund
    await supabase
      .from('user_subscriptions')
      .update({
        is_premium: false,
        subscription_status: 'REFUNDED',
      })
      .eq('subscription_id', subscriptionId);
  }
}
