'use client';

import { useState } from 'react';
import { X, Crown, Check, Loader2, AlertCircle } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
}

export function UpgradeModal({ isOpen, onClose, user }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get user session token
      const sessionData = localStorage.getItem('sb-127-0-0-1-auth-token');
      if (!sessionData) {
        throw new Error('Not authenticated');
      }

      const session = JSON.parse(sessionData);
      const accessToken = session.access_token;

      // Create subscription via API
      const response = await fetch('/api/paypal/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create subscription');
      }

      const { approvalUrl } = await response.json();

      // Redirect to PayPal for approval
      window.location.href = approvalUrl;
    } catch (err: any) {
      console.error('Upgrade error:', err);
      setError(err.message || 'Failed to start upgrade process');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-amber-500 to-yellow-500 p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Crown size={32} />
              <h2 className="text-2xl font-bold">Upgrade to Premium</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <p className="text-white/90">
            Unlock all features and supercharge your productivity!
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={16} />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Pricing */}
          <div className="text-center py-4">
            <div className="text-5xl font-bold mb-2">
              $9.99<span className="text-lg text-gray-500 dark:text-gray-400">/month</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Cancel anytime, no questions asked
            </p>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Premium Features:
            </h3>
            {[
              'Unlimited tasks and projects',
              'Advanced filters and search',
              'Focus analytics and insights',
              'Export data to CSV/JSON',
              'Custom themes and colors',
              'Priority email support',
              'Early access to new features',
            ].map((feature, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <Check className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" size={18} />
                <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
              </div>
            ))}
          </div>

          {/* Payment info */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Secure Payment:</strong> You will be redirected to PayPal to complete your
              subscription. Your payment information is never stored on our servers.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Maybe Later
            </button>
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Processing...
                </>
              ) : (
                <>
                  <Crown size={18} />
                  Upgrade Now
                </>
              )}
            </button>
          </div>

          {/* Test mode notice */}
          {process.env.NEXT_PUBLIC_PAYPAL_MODE === 'sandbox' && (
            <p className="text-xs text-center text-gray-500">
              🧪 Running in test mode
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
