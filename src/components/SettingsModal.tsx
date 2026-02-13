'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, X, AlertTriangle, User as UserIcon, Lock, Trash2, Crown } from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onLogout: () => void;
  onUpgradeClick: () => void;
}

export function SettingsModal({ isOpen, onClose, user, onLogout, onUpgradeClick }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription' | 'security' | 'danger'>('profile');
  const [isPremium, setIsPremium] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Form states
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (isOpen && user) {
      fetchSubscriptionStatus();
    }
  }, [isOpen, user]);

  const fetchSubscriptionStatus = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('is_premium, subscription_status')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setIsPremium(data.is_premium);
        setSubscriptionStatus(data.subscription_status);
      }
    } catch (err) {
      console.error('Error fetching subscription:', err);
    }
  };

  if (!isOpen) return null;

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
        if (!supabase) throw new Error("Supabase not configured");
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Password updated successfully' });
        setNewPassword('');
    } catch (err: any) {
        setMessage({ type: 'error', text: err.message });
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
      if (!confirm("Are you SURE? This cannot be undone.")) return;
      setLoading(true);
      try {
          // Note: Standard Supabase client can't delete self via API usually unless using admin or RPC
          // For now we'll simulate or use a function if available, or just log out and show error
          // user.id
          // Since we don't have a backend function for this ready, let's just log out for safety or show "Contact Admin"
          // Or strictly: await supabase.rpc('delete_user') if implemented.
          // Let's assume user wants to just log out effectively for now as "Delete" is complex without backend logic.
          // BUT prompt asked for it. I'll add a placeholder warning.
           setMessage({ type: 'error', text: 'Self-deletion requires admin contact or cloud function.' });
      } catch (err: any) {
          setMessage({ type: 'error', text: err.message });
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl h-[500px] flex overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Sidebar */}
        <div className="w-1/3 bg-gray-50 dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800 p-4">
            <h2 className="text-lg font-bold mb-6 px-2">Settings</h2>
            <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'profile' ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <UserIcon size={16} /> Profile
                </button>
                <button
                  onClick={() => setActiveTab('subscription')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'subscription' ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <Crown size={16} /> Subscription
                </button>
                <button
                  onClick={() => setActiveTab('security')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'security' ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <Lock size={16} /> Security
                </button>
                <button
                  onClick={() => setActiveTab('danger')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'danger' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900'}`}
                >
                    <Trash2 size={16} /> Danger Zone
                </button>
            </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-8 relative overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-black dark:hover:text-white">
                <X size={20} />
            </button>

            {message && (
                <div className={`mb-4 text-sm p-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.text}
                </div>
            )}

            {activeTab === 'profile' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Profile Information</h3>
                        <p className="text-sm text-gray-500">Manage your basic account details.</p>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Email</label>
                            <input type="text" value={user.email} disabled className="w-full p-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm text-gray-500 cursor-not-allowed" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">User ID</label>
                            <code className="block w-full p-2 bg-gray-100 dark:bg-gray-800 rounded-md text-xs font-mono text-gray-500 overflow-hidden text-ellipsis">{user.id}</code>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'subscription' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Subscription</h3>
                        <p className="text-sm text-gray-500">Manage your premium subscription.</p>
                    </div>

                    {isPremium ? (
                        <div className="space-y-4">
                            <div className="p-4 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl">
                                <div className="flex items-center gap-3 mb-2">
                                    <Crown className="text-amber-600 dark:text-amber-400" size={24} />
                                    <h4 className="font-bold text-amber-900 dark:text-amber-100">Premium Member</h4>
                                </div>
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                    You have access to all premium features!
                                </p>
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                    Status: {subscriptionStatus || 'Active'}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Premium Features:</h5>
                                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 pl-5 list-disc">
                                    <li>Unlimited tasks and projects</li>
                                    <li>Advanced filters and search</li>
                                    <li>Focus analytics and insights</li>
                                    <li>Export data to CSV/JSON</li>
                                    <li>Priority support</li>
                                </ul>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                                <h4 className="font-semibold mb-2">Free Plan</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                    You are currently on the free plan with limited features.
                                </p>
                                <ul className="text-sm text-gray-500 dark:text-gray-500 space-y-1 pl-5 list-disc mb-4">
                                    <li>Up to 50 tasks</li>
                                    <li>Up to 3 projects</li>
                                    <li>Basic features only</li>
                                </ul>
                            </div>

                            <button
                                onClick={() => {
                                    onClose();
                                    onUpgradeClick();
                                }}
                                className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                            >
                                <Crown size={20} />
                                Upgrade to Premium
                            </button>

                            <div className="space-y-2 pt-2">
                                <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Unlock Premium Features:</h5>
                                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 pl-5 list-disc">
                                    <li>Unlimited tasks and projects</li>
                                    <li>Advanced filters and search</li>
                                    <li>Focus analytics and insights</li>
                                    <li>Export data to CSV/JSON</li>
                                    <li>Priority support</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'security' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1">Security</h3>
                        <p className="text-sm text-gray-500">Update your password securely.</p>
                    </div>
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">New Password</label>
                            <input 
                                type="password" 
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-transparent"
                                placeholder="Min. 6 characters"
                            />
                        </div>
                        <button 
                            type="submit" 
                            disabled={loading || !newPassword}
                            className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
                        >
                            {loading ? 'Updating...' : 'Update Password'}
                        </button>
                    </form>
                </div>
            )}

            {activeTab === 'danger' && (
                <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold mb-1 text-red-600">Danger Zone</h3>
                        <p className="text-sm text-gray-500">Permanently delete your account and all data.</p>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl space-y-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="text-sm font-bold text-red-700 dark:text-red-400">Delete Account</h4>
                                <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                                    Once you delete your account, there is no going back. Please be certain.
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={handleDeleteAccount}
                            className="w-full py-2 bg-white dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-bold rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/40 transition-colors"
                        >
                            Delete Personal Account
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}
