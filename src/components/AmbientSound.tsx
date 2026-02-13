'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, CloudRain, Wind, Waves, Coffee, Play, Pause } from 'lucide-react';

type SoundType = 'rain' | 'whitenoise' | 'brownnoise' | 'wind' | 'cafe';

interface SoundConfig {
  name: string;
  icon: React.ReactNode;
  description: string;
}

const SOUNDS: Record<SoundType, SoundConfig> = {
  rain: { name: 'Rain', icon: <CloudRain size={18} />, description: 'Gentle rain' },
  whitenoise: { name: 'White Noise', icon: <Waves size={18} />, description: 'Pure white noise' },
  brownnoise: { name: 'Brown Noise', icon: <Wind size={18} />, description: 'Deep, rumbling noise' },
  wind: { name: 'Wind', icon: <Wind size={18} />, description: 'Soft wind' },
  cafe: { name: 'Cafe', icon: <Coffee size={18} />, description: 'Coffee shop ambience' },
};

export function AmbientSound() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSound, setActiveSound] = useState<SoundType>('rain');
  const [volume, setVolume] = useState(0.3);
  const [isExpanded, setIsExpanded] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);

  // Create noise buffer
  const createNoiseBuffer = useCallback((type: SoundType): AudioBuffer => {
    const ctx = audioContextRef.current!;
    const bufferSize = ctx.sampleRate * 2; // 2 seconds of audio
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate white noise base
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Apply coloring based on type
    if (type === 'brownnoise') {
      // Brown noise - integrate white noise
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; // Boost volume
      }
    } else if (type === 'rain') {
      // Rain - white noise with random droplets
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Add occasional "droplet" sounds
        if (Math.random() < 0.001) {
          data[i] = white * 2;
        } else {
          data[i] = white * 0.5;
        }
      }
    } else if (type === 'wind') {
      // Wind - slowly modulated noise
      for (let i = 0; i < bufferSize; i++) {
        const mod = Math.sin(i / (ctx.sampleRate * 0.5)) * 0.5 + 0.5;
        data[i] = (Math.random() * 2 - 1) * mod * 0.7;
      }
    } else if (type === 'cafe') {
      // Cafe - mix of frequencies with subtle variations
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        const mod = Math.sin(i / (ctx.sampleRate * 2)) * 0.3 + 0.7;
        data[i] = white * mod * 0.4;
      }
    }

    return buffer;
  }, []);

  // Start audio
  const startAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;

    // Resume context if suspended
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Create gain node
    gainNodeRef.current = ctx.createGain();
    gainNodeRef.current.gain.value = volume;
    gainNodeRef.current.connect(ctx.destination);

    // Create filter for shaping sound
    filterRef.current = ctx.createBiquadFilter();
    filterRef.current.connect(gainNodeRef.current);

    // Configure filter based on sound type
    if (activeSound === 'rain') {
      filterRef.current.type = 'lowpass';
      filterRef.current.frequency.value = 3000;
    } else if (activeSound === 'brownnoise') {
      filterRef.current.type = 'lowpass';
      filterRef.current.frequency.value = 500;
    } else if (activeSound === 'wind') {
      filterRef.current.type = 'bandpass';
      filterRef.current.frequency.value = 800;
      filterRef.current.Q.value = 0.5;
    } else if (activeSound === 'cafe') {
      filterRef.current.type = 'lowpass';
      filterRef.current.frequency.value = 2000;
    } else {
      filterRef.current.type = 'allpass';
    }

    // Create noise source
    const buffer = createNoiseBuffer(activeSound);
    noiseSourceRef.current = ctx.createBufferSource();
    noiseSourceRef.current.buffer = buffer;
    noiseSourceRef.current.loop = true;
    noiseSourceRef.current.connect(filterRef.current);
    noiseSourceRef.current.start();

    setIsPlaying(true);
  }, [activeSound, volume, createNoiseBuffer]);

  // Stop audio
  const stopAudio = useCallback(() => {
    if (noiseSourceRef.current) {
      noiseSourceRef.current.stop();
      noiseSourceRef.current.disconnect();
      noiseSourceRef.current = null;
    }
    if (filterRef.current) {
      filterRef.current.disconnect();
      filterRef.current = null;
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect();
      gainNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopAudio();
    } else {
      startAudio();
    }
  }, [isPlaying, startAudio, stopAudio]);

  // Change sound type
  const changeSound = useCallback((type: SoundType) => {
    setActiveSound(type);
    if (isPlaying) {
      stopAudio();
      // Small delay to allow cleanup
      setTimeout(() => {
        startAudio();
      }, 50);
    }
  }, [isPlaying, stopAudio, startAudio]);

  // Update volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopAudio]);

  return (
    <div className="fixed bottom-4 right-4 z-[300]">
      {isExpanded ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 w-72 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Ambient Sounds</h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <VolumeX size={18} />
            </button>
          </div>

          {/* Sound selector */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {(Object.keys(SOUNDS) as SoundType[]).map((type) => (
              <button
                key={type}
                onClick={() => changeSound(type)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                  activeSound === type
                    ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 border border-transparent'
                }`}
              >
                {SOUNDS[type].icon}
                <span className="text-xs font-medium">{SOUNDS[type].name}</span>
              </button>
            ))}
          </div>

          {/* Volume slider */}
          <div className="flex items-center gap-3 mb-4">
            <VolumeX size={16} className="text-gray-400" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <Volume2 size={16} className="text-gray-400" />
          </div>

          {/* Play/Pause button */}
          <button
            onClick={togglePlay}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-all ${
              isPlaying
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause size={18} /> Stop
              </>
            ) : (
              <>
                <Play size={18} /> Play {SOUNDS[activeSound].name}
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-3">
            {SOUNDS[activeSound].description}
          </p>
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(true)}
          className={`p-3 rounded-full shadow-lg transition-all ${
            isPlaying
              ? 'bg-indigo-600 text-white animate-pulse'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          title="Ambient sounds"
        >
          <Volume2 size={20} />
        </button>
      )}
    </div>
  );
}
