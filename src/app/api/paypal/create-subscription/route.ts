import { NextRequest, NextResponse } from 'next/server';
import { createSubscription } from '@/lib/paypal';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/paypal/create-subscription
 * Creates a new PayPal subscription for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user from Supabase auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Create PayPal subscription
    const subscription = await createSubscription(user.id);

    // Find approval URL
    const approvalUrl = subscription.links?.find(
      (link: any) => link.rel === 'approve'
    )?.href;

    if (!approvalUrl) {
      throw new Error('No approval URL returned from PayPal');
    }

    return NextResponse.json({
      subscriptionId: subscription.id,
      approvalUrl,
    });
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create subscription' },
      { status: 500 }
    );
  }
}
