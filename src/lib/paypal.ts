/**
 * PayPal Configuration and Utilities
 * Provides client setup and helper functions for PayPal payments
 */

import { paypalSdk } from '@paypal/paypal-server-sdk';

// PayPal configuration
export const PAYPAL_CONFIG = {
  mode: (process.env.PAYPAL_MODE as 'sandbox' | 'live') || 'sandbox',
  clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  planId: process.env.PAYPAL_PLAN_ID || '',
  webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
};

// Create PayPal client for server-side operations
export function createPayPalClient() {
  if (!PAYPAL_CONFIG.clientId || !PAYPAL_CONFIG.clientSecret) {
    throw new Error('PayPal credentials not configured');
  }

  return paypalSdk.client({
    environment: PAYPAL_CONFIG.mode === 'live' ? 'production' : 'sandbox',
    auth: {
      clientId: PAYPAL_CONFIG.clientId,
      clientSecret: PAYPAL_CONFIG.clientSecret,
    },
    logging: {
      logLevel: 'info',
      logRequest: { logBody: true },
      logResponse: { logHeaders: true },
    },
  });
}

/**
 * Get PayPal access token for API calls
 */
export async function getPayPalAccessToken(): Promise<string> {
  const auth = Buffer.from(
    `${PAYPAL_CONFIG.clientId}:${PAYPAL_CONFIG.clientSecret}`
  ).toString('base64');

  const baseUrl =
    PAYPAL_CONFIG.mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error('Failed to get PayPal access token');
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Create a PayPal subscription
 */
export async function createSubscription(userId: string) {
  const accessToken = await getPayPalAccessToken();
  const baseUrl =
    PAYPAL_CONFIG.mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

  const response = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan_id: PAYPAL_CONFIG.planId,
      custom_id: userId, // Store user ID for reference
      application_context: {
        brand_name: 'Task Dashboard Premium',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/paypal/success`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/paypal/cancel`,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create subscription: ${error}`);
  }

  return response.json();
}

/**
 * Get subscription details
 */
export async function getSubscription(subscriptionId: string) {
  const accessToken = await getPayPalAccessToken();
  const baseUrl =
    PAYPAL_CONFIG.mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

  const response = await fetch(
    `${baseUrl}/v1/billing/subscriptions/${subscriptionId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get subscription details');
  }

  return response.json();
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(subscriptionId: string, reason: string = 'User requested cancellation') {
  const accessToken = await getPayPalAccessToken();
  const baseUrl =
    PAYPAL_CONFIG.mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';

  const response = await fetch(
    `${baseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to cancel subscription');
  }

  return { success: true };
}
