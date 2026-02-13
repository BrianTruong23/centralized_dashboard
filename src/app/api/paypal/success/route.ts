import { NextRequest, NextResponse } from 'next/server';
import { getSubscription } from '@/lib/paypal';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/paypal/success
 * Handles successful PayPal subscription approval
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const subscriptionId = searchParams.get('subscription_id');
    const token = searchParams.get('token');

    if (!subscriptionId) {
      return NextResponse.redirect(new URL('/?error=no_subscription_id', request.url));
    }

    // Get subscription details from PayPal
    const subscription = await getSubscription(subscriptionId);
    const userId = subscription.custom_id;

    if (!userId) {
      throw new Error('No user ID found in subscription');
    }

    // Update user subscription in database
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    // Check if subscription record exists
    const { data: existingSubscription } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    const subscriptionData = {
      user_id: userId,
      is_premium: subscription.status === 'ACTIVE',
      subscription_id: subscriptionId,
      subscription_status: subscription.status,
      plan_id: subscription.plan_id,
      payment_provider: 'paypal',
      subscription_start_date: subscription.start_time || new Date().toISOString(),
      subscription_end_date: subscription.billing_info?.next_billing_time || null,
    };

    if (existingSubscription) {
      // Update existing subscription
      const { error } = await supabase
        .from('user_subscriptions')
        .update(subscriptionData)
        .eq('user_id', userId);

      if (error) throw error;
    } else {
      // Create new subscription record
      const { error } = await supabase
        .from('user_subscriptions')
        .insert(subscriptionData);

      if (error) throw error;
    }

    // Redirect to success page
    return NextResponse.redirect(new URL('/?upgrade=success', request.url));
  } catch (error: any) {
    console.error('Error processing subscription success:', error);
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error.message)}`, request.url)
    );
  }
}
