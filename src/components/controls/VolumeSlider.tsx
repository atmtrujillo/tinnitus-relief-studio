import { Volume2, VolumeX } from 'lucide-react';
import { volumeToPercent } from '../../utils';

interface VolumeSliderProps {
  volume: number;
  onChange: (volume: number) => void;
  max?: number;
  label?: string;
  className?: string;
}

export function VolumeSlider({
  volume,
  onChange,
  max = 1,
  label = 'Volume',
  className = '',
}: VolumeSliderProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <VolumeX className="w-4 h-4 text-gray-500 shrink-0" />
      <div className="flex-1">
        {label && (
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">{label}</span>
            <span className="text-xs font-mono text-gray-300">
              {volumeToPercent(volume)}%
            </span>
          </div>
        )}
        <input
          type="range"
          min={0}
          max={max}
          step={0.01}
          value={volume}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="slider-track"
        />
      </div>
      <Volume2 className="w-4 h-4 text-gray-500 shrink-0" />
    </div>
  );
}
