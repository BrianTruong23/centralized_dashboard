import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/paypal/cancel
 * Handles PayPal subscription cancellation by user
 */
export async function GET(request: NextRequest) {
  // User cancelled the subscription process
  return NextResponse.redirect(new URL('/?upgrade=cancelled', request.url));
}
