/* Scoring rules: star rating and per-action points. */
export const POINTS = {
  perPop: 24,
  perDrop: 38,
  perRescue: 100,
};

export function calcStars({ won, score, shotsRemaining, cfg }) {
  if (!won) return 0;

  const efficiency = shotsRemaining / Math.max(1, cfg.shots);

  return Math.max(
    1,
    Math.min(
      3,
      1 +
        (score >= cfg.starThresholds[1] ? 1 : 0) +
        (score >= cfg.starThresholds[2] || efficiency > 0.45 ? 1 : 0)
    )
  );
}
