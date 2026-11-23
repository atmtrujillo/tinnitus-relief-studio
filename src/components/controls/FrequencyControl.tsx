import { useState, useEffect } from 'react';
import { formatFrequency } from '../../utils';

interface FrequencyControlProps {
  frequency: number;
  onChange: (freq: number) => void;
  min?: number;
  max?: number;
  label?: string;
}

export function FrequencyControl({
  frequency,
  onChange,
  min = 20,
  max = 20000,
  label = 'Frequency',
}: FrequencyControlProps) {
  const [inputValue, setInputValue] = useState(frequency.toString());

  useEffect(() => {
    setInputValue(Math.round(frequency).toString());
  }, [frequency]);

  const handleInputChange = (value: string) => {
    setInputValue(value);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      onChange(num);
    }
  };

  const handleInputBlur = () => {
    const num = parseInt(inputValue, 10);
    if (isNaN(num) || num < min) {
      onChange(min);
      setInputValue(min.toString());
    } else if (num > max) {
      onChange(max);
      setInputValue(max.toString());
    }
  };

  // Use logarithmic scale for the slider
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const logValue = Math.log10(frequency);
  const sliderPosition = ((logValue - logMin) / (logMax - logMin)) * 100;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const position = parseFloat(e.target.value);
    const logFreq = logMin + (position / 100) * (logMax - logMin);
    const freq = Math.round(Math.pow(10, logFreq));
    onChange(Math.max(min, Math.min(max, freq)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-400">{label}</label>
        <span className="text-sm font-mono text-accent-blue">
          {formatFrequency(frequency)}
        </span>
      </div>

      {/* Logarithmic slider */}
      <input
        type="range"
        min={0}
        max={100}
        step={0.1}
        value={sliderPosition}
        onChange={handleSliderChange}
        className="slider-track"
      />

      {/* Numeric input */}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={1}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onBlur={handleInputBlur}
          className="input-field w-28 text-center font-mono text-sm"
        />
        <span className="text-xs text-gray-500">Hz</span>

        {/* Fine adjustment buttons */}
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => onChange(Math.max(min, frequency - 10))}
            className="px-2 py-1 text-xs bg-surface-600 hover:bg-surface-500 rounded transition-colors"
          >
            -10
          </button>
          <button
            onClick={() => onChange(Math.max(min, frequency - 1))}
            className="px-2 py-1 text-xs bg-surface-600 hover:bg-surface-500 rounded transition-colors"
          >
            -1
          </button>
          <button
            onClick={() => onChange(Math.min(max, frequency + 1))}
            className="px-2 py-1 text-xs bg-surface-600 hover:bg-surface-500 rounded transition-colors"
          >
            +1
          </button>
          <button
            onClick={() => onChange(Math.min(max, frequency + 10))}
            className="px-2 py-1 text-xs bg-surface-600 hover:bg-surface-500 rounded transition-colors"
          >
            +10
          </button>
        </div>
      </div>
    </div>
  );
}
