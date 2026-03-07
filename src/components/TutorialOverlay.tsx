'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface TutorialOverlayProps {
  targetId: string; // matches data-tutorial attribute
  message: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  onDismiss?: () => void;
}

export const TutorialOverlay = ({ targetId, message, position = 'bottom', onDismiss }: TutorialOverlayProps) => {
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updatePosition = () => {
      const element = document.querySelector(`[data-tutorial="${targetId}"]`);
      if (element) {
        const rect = element.getBoundingClientRect();
        setCoords({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height,
        });
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);
    
    // Check periodically in case layout shifts or element appears
    const interval = setInterval(updatePosition, 1000);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
      clearInterval(interval);
    };
  }, [targetId]);

  if (!isVisible || !coords) return null;

  // Calculate arrow and tooltip position
  // Simple logic for "bottom" (arrow points up to element) and "left" (arrow points right to element)
  // For this specific use case (input and list), we likely want:
  // Input: Arrow points UP to the input (if input is top) or DOWN to it? 
  // Actually user asked for "arrow to add task". Input is usually at top. So arrow should be BELOW input pointing UP, or LEFT of input pointing RIGHT.
  // Let's implement a specific design for the "hand drawn" arrow look.

  // We'll render using a portal to ensure it's on top
  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[9999] flex items-start justify-start">
      {/* Dim background optional? User didn't ask for it, but it helps focus. Let's keep it transparent for now so they can interact. */}
      
      <div 
        className="absolute transition-all duration-300 ease-out flex flex-col items-center animate-in fade-in slide-in-from-bottom-4"
        style={{
          top: coords.top + coords.height + 20, // 20px below element
          left: coords.left + (coords.width / 2) - 100, // Centered-ish
          width: 200,
        }}
      >
        <div className="relative">
             {/* Arrow pointing up */}
             <svg 
               className="absolute -top-12 left-1/2 -translate-x-1/2 w-12 h-12 text-black dark:text-white drop-shadow-md" 
               viewBox="0 0 100 100" 
               fill="none" 
               stroke="currentColor" 
               strokeWidth="2"
             >
               <path d="M50 100 C 50 100 20 50 50 10" />
               <path d="M50 10 L 30 30" />
               <path d="M50 10 L 70 30" />
             </svg>
             
             <div className="accent-solid-btn px-6 py-4 rounded-2xl shadow-xl text-center relative pointer-events-auto">
                <p className="font-handwriting text-lg font-medium">{message}</p>
                {onDismiss && (
                  <button 
                    onClick={onDismiss}
                    className="mt-2 text-xs opacity-70 hover:opacity-100 underline"
                  >
                    Got it
                  </button>
                )}
             </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
