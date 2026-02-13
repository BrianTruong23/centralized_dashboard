'use client';

import { PlantGrowth } from '@/components/PlantGrowth';

/**
 * Demo page to visualize plant growth stages
 * Visit /demo/plant-growth to see all growth stages
 */
export default function PlantGrowthDemoPage() {
  const stages = [
    { seconds: 0, label: 'Stage 0: Seed (0 min)' },
    { seconds: 60, label: 'Stage 1: Sprouting (1 min)' },
    { seconds: 120, label: 'Stage 2: Young Plant (2 min)' },
    { seconds: 180, label: 'Stage 3: Growing (3 min)' },
    { seconds: 240, label: 'Stage 4: Budding (4 min)' },
    { seconds: 300, label: 'Stage 5: Full Bloom (5 min)' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Plant Growth Animation Demo</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Visual progression of the plant as it grows during Focus Mode sessions.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
          {stages.map((stage) => (
            <div
              key={stage.seconds}
              className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm"
            >
              <div className="flex flex-col items-center">
                <div className="mb-4 text-center">
                  <h3 className="font-semibold text-sm mb-1">{stage.label}</h3>
                  <p className="text-xs text-gray-500">
                    {Math.floor(stage.seconds / 60)} min
                  </p>
                </div>

                {/* Show plant in light background for visibility */}
                <div className="bg-black rounded-xl p-8 w-full flex items-center justify-center">
                  <PlantGrowth
                    elapsedSeconds={stage.seconds}
                    isActive={true}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-950 rounded-xl border border-blue-100 dark:border-blue-900">
          <h2 className="font-semibold mb-2">How it works</h2>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <li>• The plant grows 1 stage per minute of focused work</li>
            <li>• Animation is subtle and non-distracting (low opacity)</li>
            <li>• Can be disabled in Settings → Focus tab</li>
            <li>• Persists across sessions via localStorage</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
