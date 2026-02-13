'use client';

import { useState, useRef, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { Settings, LogOut, ChevronDown, User as UserIcon, Bell, Layout } from 'lucide-react';


interface UserDropdownProps {
  user: User;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenActivityLog: () => void;
}

export function UserDropdown({ user, onLogout, onOpenSettings, onOpenActivityLog }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Internal settings state no longer needed, lifted to parent
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close clicks outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitial = () => {
    const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
    if (metaName) return metaName[0].toUpperCase();
    return user.email?.[0]?.toUpperCase() || 'U';
  };
  
  const getName = () => {
    return user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors w-full"
        >
          <div className="w-5 h-5 rounded bg-orange-500/10 text-orange-600 flex items-center justify-center text-[10px] font-bold">
            {getInitial()}
          </div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate flex-1 text-left">
            {getName()}
          </span>
          <ChevronDown size={14} className="text-gray-400" />
        </button>

        {isOpen && (
          <div className="absolute top-10 left-0 w-64 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 mb-1">
               <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{getName()}</p>
               <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
            
            <div className="px-1 space-y-0.5">
                <button 
                  onClick={() => { onOpenSettings(); setIsOpen(false); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <Settings size={16} />
                        <span>Settings</span>
                    </div>
                </button>
                {/* Placeholders from screenshot request */}
                <button 
                   onClick={() => { onOpenActivityLog(); setIsOpen(false); }}
                   className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                     <div className="flex items-center gap-3">
                        <Layout size={16} />
                        <span>Activity Log</span>
                     </div>
                </button>
            </div>

            <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
            
            <div className="px-1">
                <button 
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                >
                    <LogOut size={16} />
                    <span>Log out</span>
                </button>
            </div>
          </div>
        )}
      </div>

    </>
  );
}
