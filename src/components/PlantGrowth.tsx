'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';

interface PlantGrowthProps {
  /** Elapsed time in seconds */
  elapsedSeconds: number;
  /** Whether the timer is currently active */
  isActive: boolean;
  /** Optional className for positioning */
  className?: string;
}

/**
 * PlantGrowth Component
 * A subtle, calming visual that grows as the user stays focused.
 * The plant sprouts and grows based on focus time (1 stage per minute).
 */
export function PlantGrowth({ elapsedSeconds, isActive, className }: PlantGrowthProps) {
  const [growthStage, setGrowthStage] = useState(0);

  useEffect(() => {
    // Calculate growth stage (0-5 based on minutes focused)
    // Stage 0: seed, Stage 1-4: growing, Stage 5: full bloom
    const minutes = Math.floor(elapsedSeconds / 60);
    const newStage = Math.min(minutes, 5);
    setGrowthStage(newStage);
  }, [elapsedSeconds]);

  // Stem height grows with each stage
  const stemHeight = growthStage * 20; // 0 to 100px
  const stemOpacity = growthStage > 0 ? 1 : 0;

  // Leaves appear at stage 2+
  const leafOpacity = growthStage >= 2 ? 1 : 0;
  const leafScale = growthStage >= 2 ? Math.min((growthStage - 1) * 0.33, 1) : 0;

  // Flower appears at stage 4+
  const flowerOpacity = growthStage >= 4 ? 1 : 0;
  const flowerScale = growthStage >= 4 ? Math.min((growthStage - 3) * 0.5, 1) : 0;

  return (
    <div className={clsx('flex items-end justify-center', className)}>
      <svg
        width="120"
        height="140"
        viewBox="0 0 120 140"
        className="opacity-40 dark:opacity-30 transition-opacity duration-1000"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}
      >
        {/* Pot/Ground */}
        <ellipse
          cx="60"
          cy="130"
          rx="25"
          ry="5"
          fill="currentColor"
          className="text-gray-400 dark:text-gray-600"
        />

        {/* Seed (always visible as base) */}
        <ellipse
          cx="60"
          cy="125"
          rx="4"
          ry="3"
          fill="currentColor"
          className="text-amber-700 dark:text-amber-800"
        />

        {/* Stem - grows upward */}
        <rect
          x="58"
          y={130 - stemHeight}
          width="4"
          height={stemHeight}
          rx="2"
          fill="currentColor"
          className="text-green-600 dark:text-green-700 transition-all duration-1000 ease-out"
          style={{
            opacity: stemOpacity,
            transformOrigin: 'bottom center',
          }}
        />

        {/* Left Leaf */}
        <ellipse
          cx="45"
          cy={110 - stemHeight * 0.4}
          rx="12"
          ry="8"
          fill="currentColor"
          className="text-green-500 dark:text-green-600 transition-all duration-1000 ease-out"
          style={{
            opacity: leafOpacity,
            transform: `scale(${leafScale}) rotate(-20deg)`,
            transformOrigin: 'center',
          }}
        />

        {/* Right Leaf */}
        <ellipse
          cx="75"
          cy={110 - stemHeight * 0.4}
          rx="12"
          ry="8"
          fill="currentColor"
          className="text-green-500 dark:text-green-600 transition-all duration-1000 ease-out"
          style={{
            opacity: leafOpacity,
            transform: `scale(${leafScale}) rotate(20deg)`,
            transformOrigin: 'center',
          }}
        />

        {/* Flower - appears at final stages */}
        {/* Center of flower */}
        <circle
          cx="60"
          cy={35}
          r="6"
          fill="currentColor"
          className="text-yellow-400 dark:text-yellow-500 transition-all duration-1000 ease-out"
          style={{
            opacity: flowerOpacity,
            transform: `scale(${flowerScale})`,
            transformOrigin: 'center',
          }}
        />

        {/* Flower petals */}
        {[0, 72, 144, 216, 288].map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          const px = 60 + Math.cos(rad) * 10;
          const py = 35 + Math.sin(rad) * 10;

          return (
            <ellipse
              key={i}
              cx={px}
              cy={py}
              rx="6"
              ry="4"
              fill="currentColor"
              className="text-pink-400 dark:text-pink-500 transition-all duration-1000 ease-out"
              style={{
                opacity: flowerOpacity,
                transform: `scale(${flowerScale}) rotate(${angle}deg)`,
                transformOrigin: `${px}px ${py}px`,
              }}
            />
          );
        })}
      </svg>

      {/* Optional stage indicator for testing */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-0 right-0 text-xs text-gray-400 opacity-20">
          Stage {growthStage}/5
        </div>
      )}
    </div>
  );
}
