const RED = [244, 33, 46] as const;
const YELLOW = [255, 212, 0] as const;
const GREEN = [0, 186, 124] as const;

function interpolate(start: readonly number[], end: readonly number[], ratio: number): number[] {
  return start.map((channel, index) =>
    Math.round(channel + ((end[index] ?? channel) - channel) * ratio),
  );
}

export function coverageOpacity(coverage: number): number {
  return Math.min(1, Math.max(0, coverage) / 100);
}

export function humanScoreColor(score: number, opacity = 1): string {
  const boundedScore = Math.min(100, Math.max(0, score));
  const boundedOpacity = Math.min(1, Math.max(0, opacity));
  const channels =
    boundedScore <= 50
      ? interpolate(RED, YELLOW, boundedScore / 50)
      : interpolate(YELLOW, GREEN, (boundedScore - 50) / 50);

  if (boundedOpacity >= 1) return `rgb(${channels.join(' ')})`;
  return `rgb(${channels.join(' ')} / ${boundedOpacity})`;
}
