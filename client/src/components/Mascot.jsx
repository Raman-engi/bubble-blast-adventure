import React from 'react';

/* "Bubbo": the original helper character (SVG, no external assets).
   mood: happy | cheer | sad | think | wink */
const MOUTH = {
  happy: 'M 38 62 Q 50 74 62 62',
  cheer: 'M 36 60 Q 50 82 64 60 Z',
  sad: 'M 38 70 Q 50 60 62 70',
  think: 'M 42 68 L 58 68',
  wink: 'M 38 62 Q 50 74 62 62',
};

export function Mascot({ mood = 'happy', size = 96, say = '' }) {
  const eyeR = mood === 'cheer' ? 6 : 5;

  return (
    <div className={`mascot mood-${mood}`} role="img" aria-label={`Bubbo the helper looks ${mood}. ${say}`}>
      {say && <p className="mascot-say">{say}</p>}

      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <defs>
          <radialGradient id="bubboBody" cx=".35" cy=".28">
            <stop offset="0" stopColor="#d9f7ff" />
            <stop offset=".55" stopColor="#66c4ff" />
            <stop offset="1" stopColor="#2f7be8" />
          </radialGradient>
        </defs>

        <ellipse cx="50" cy="94" rx="26" ry="4" fill="rgba(0,0,0,.18)" />
        <circle cx="50" cy="52" r="40" fill="url(#bubboBody)" stroke="#fff" strokeWidth="2.5" />
        <ellipse cx="34" cy="32" rx="11" ry="6" fill="#fff" opacity=".55" transform="rotate(-30 34 32)" />
        <path d="M 40 12 Q 50 2 60 12" fill="none" stroke="#ffd34f" strokeWidth="5" strokeLinecap="round" />
        <circle cx="38" cy="48" r={eyeR} fill="#14305e" />
        {mood === 'wink'
          ? <path d="M 58 48 L 68 48" stroke="#14305e" strokeWidth="3" strokeLinecap="round" />
          : <circle cx="62" cy="48" r={eyeR} fill="#14305e" />}
        <circle cx="36" cy="46" r="1.8" fill="#fff" />
        <path d={MOUTH[mood] || MOUTH.happy} fill={mood === 'cheer' ? '#14305e' : 'none'} stroke="#14305e" strokeWidth="3" strokeLinecap="round" />
        <circle cx="28" cy="60" r="5" fill="#ff8fb1" opacity=".55" />
        <circle cx="72" cy="60" r="5" fill="#ff8fb1" opacity=".55" />
      </svg>
    </div>
  );
}

export default Mascot;
