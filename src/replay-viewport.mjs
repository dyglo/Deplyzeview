export function timeframeDurationMs(timeframe) {
  const value = String(timeframe ?? '').trim();
  if (value === 'D' || value === '1D' || value === '1d') return 24 * 60 * 60 * 1000;
  const match = /^(\d+)([smhdw]?)$/i.exec(value);
  if (!match) return 60 * 1000;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return 60 * 1000;
  const unit = match[2].toLowerCase();
  if (unit === 's') return amount * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  if (unit === 'w') return amount * 7 * 24 * 60 * 60 * 1000;
  return amount * 60 * 1000;
}

/**
 * Keep the user's approximate visible candle count when a new timeframe loads.
 * Preserving timestamps instead makes a timeframe switch change bar density
 * dramatically. During replay, keep the cursor at the same visual position
 * where possible and cap future whitespace to two new bars.
 */
export function normalizeReplayViewport(previous, replayCursor, previousTimeframe, timeframe) {
  if (!previous || !Number.isFinite(previous.from) || !Number.isFinite(previous.to)) return null;
  const previousInterval = timeframeDurationMs(previousTimeframe);
  const nextInterval = timeframeDurationMs(timeframe);
  const previousSpan = previous.to - previous.from;
  if (!Number.isFinite(previousSpan) || previousSpan <= 0) return null;
  const visibleBars = Math.max(4, Math.min(500, previousSpan / previousInterval));
  const span = Math.max(nextInterval, visibleBars * nextInterval);
  if (!Number.isFinite(span) || span <= 0) return null;
  if (!Number.isFinite(replayCursor)) {
    const center = (previous.from + previous.to) / 2;
    return { from: center - span / 2, to: center + span / 2 };
  }

  const cursor = replayCursor;
  const maxRight = cursor + nextInterval * 2;
  const cursorPosition = Math.max(0, Math.min(1, (cursor - previous.from) / previousSpan));
  const desiredRight = cursor + span * (1 - cursorPosition);
  const right = Math.min(maxRight, desiredRight);
  return { from: right - span, to: right };
}
