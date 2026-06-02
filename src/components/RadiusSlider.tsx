import React from 'react';
import './RadiusSlider.css';

export const RADIUS_VALUES = [1, 2, 5, 10];

interface RadiusSliderProps {
  value: number;          // current radius in km (one of 1,2,5,10)
  onChange: (km: number) => void;
}

const RadiusSlider: React.FC<RadiusSliderProps> = ({ value, onChange }) => {
  const currentIndex = RADIUS_VALUES.indexOf(value);
  const snapIndex = currentIndex >= 0 ? currentIndex : 1; // default 2km → index 1

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = Number(e.target.value);
    onChange(RADIUS_VALUES[idx]);
  };

  return (
    <div className="radius-slider-widget" title="Filter by radius">
      <div className="radius-slider-label">
        <span className="radius-slider-icon">⊙</span>
        <span className="radius-slider-value">{RADIUS_VALUES[snapIndex]} km</span>
      </div>
      <div className="radius-slider-track-wrap">
        <input
          type="range"
          className="radius-slider-input"
          min={0}
          max={RADIUS_VALUES.length - 1}
          step={1}
          value={snapIndex}
          onChange={handleChange}
          aria-label="Radius filter"
          style={{ '--pct': `${(snapIndex / (RADIUS_VALUES.length - 1)) * 100}%` } as React.CSSProperties}
        />
        <div className="radius-slider-marks">
          {RADIUS_VALUES.map((km, i) => (
            <span
              key={km}
              className={`radius-slider-mark${i === snapIndex ? ' radius-slider-mark--active' : ''}`}
              onClick={() => onChange(km)}
            >
              {km}km
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RadiusSlider;
