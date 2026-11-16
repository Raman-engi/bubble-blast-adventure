/* Tiny WebAudio sound effects (no asset files). Respects the Sound setting. */
let audioContext;

const HAPTICS = {
  shot: 8, pop: 10, blast: [30, 20, 40], fire: 25, bolt: 20, rainbow: 18,
  combo: [12, 30, 12], win: [20, 40, 20, 40, 60], fail: [60, 40, 60],
  star: 15, rescue: [15, 25, 15], highscore: [20, 30, 20, 30, 20],
};

/* Short vibration on phones. Respects the Haptics setting and reduced motion. */
export function haptic(kind) {
  try {
    if (
      localStorage.getItem('haptics') === 'off' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      !navigator.vibrate || !HAPTICS[kind]
    ) return;

    navigator.vibrate(HAPTICS[kind]);
  } catch {
    // vibration is optional
  }
}

export function playSfx(kind = 'pop') {
  haptic(kind);

  if (
    typeof window === 'undefined' ||
    localStorage.getItem('sound') === 'off'
  ) return;

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    audioContext ||= new AC();

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    const settings = {
      shot: [420, 0.07, 'triangle'],
      pop: [660, 0.11, 'sine'],
      blast: [115, 0.28, 'sawtooth'],
      swap: [520, 0.08, 'sine'],
      win: [880, 0.32, 'triangle'],
      fire: [260, 0.26, 'sawtooth'],
      bolt: [1100, 0.2, 'square'],
      rainbow: [740, 0.34, 'sine'],
      combo: [980, 0.16, 'triangle'],
      coin: [1320, 0.12, 'sine'],
      click: [600, 0.05, 'sine'],
      fail: [196, 0.4, 'sawtooth'],
      star: [1175, 0.22, 'triangle'],
      rescue: [988, 0.3, 'triangle'],
      highscore: [1568, 0.4, 'triangle'],
    }[kind] || [440, 0.1, 'sine'];

    osc.type = settings[2];
    osc.frequency.setValueAtTime(settings[0], now);

    if (kind === 'blast') {
      osc.frequency.exponentialRampToValueAtTime(42, now + settings[1]);
    } else {
      osc.frequency.exponentialRampToValueAtTime(
        settings[0] * 1.35,
        now + settings[1]
      );
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      kind === 'blast' ? 0.16 : 0.07,
      now + 0.012
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + settings[1]
    );

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(now);
    osc.stop(now + settings[1] + 0.02);
  } catch {
    // Audio is optional; gameplay should continue if audio is unavailable.
  }
}
