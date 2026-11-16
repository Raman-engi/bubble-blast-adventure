import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';

export const BubbleLauncher = ({ onShoot, currentBubble, nextBubble, onSwap, disabled }) => {
  const [angle, setAngle] = useState(-90);

  const updateAngle = (clientX, clientY, rect) => {
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height - 28;
    const dx = clientX - originX;
    const dy = clientY - originY;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;

    if (deg > -15) deg = -15;
    if (deg < -165) deg = -165;
    setAngle(deg);
  };

  const handleMouseMove = (e) => {
    updateAngle(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  };

  const handleTouchMove = (e) => {
    if (e.touches.length > 0) {
      updateAngle(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget.getBoundingClientRect());
    }
  };

  return (
    <div
      className="relative w-full h-28 flex items-center justify-center cursor-crosshair select-none border-t border-slate-800/80 bg-slate-900/60"
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onClick={() => !disabled && onShoot(angle)}
    >
      {/* Aim Trajectory Guide */}
      <div
        className="absolute bottom-11 w-1 rounded-full bg-gradient-to-t from-white/70 to-transparent pointer-events-none origin-bottom"
        style={{ transform: `rotate(${angle + 90}deg)`, height: '140px' }}
      />

      {/* Current Active Shooter Bubble */}
      <div
        className={`absolute bottom-4 w-12 h-12 rounded-full shadow-lg border-2 border-white/40 bg-gradient-to-br ${
          currentBubble?.gradient || 'from-red-400 to-red-600'
        } flex items-center justify-center transition-transform duration-150 ${
          disabled ? 'opacity-50 scale-90' : 'scale-105'
        }`}
      >
        <div className="w-3 h-3 rounded-full bg-white/40 -translate-x-2 -translate-y-2" />
      </div>

      {/* Swap & Next Bubble Preview */}
      <div className="absolute right-6 bottom-3 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onSwap}
          disabled={disabled}
          title="Swap Bubble"
          className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition active:scale-95 disabled:opacity-40"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Next</span>
          <div
            className={`w-8 h-8 rounded-full shadow border border-white/30 bg-gradient-to-br ${
              nextBubble?.gradient || 'from-blue-400 to-blue-600'
            }`}
          />
        </div>
      </div>
    </div>
  );
};
