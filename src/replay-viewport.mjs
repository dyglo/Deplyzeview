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
 * Sanitize logical bar spacing (CSS pixels per bar) across timeframe transitions
 * and layout changes so candles remain readable and consistently sized.
 */
export function sanitizeBarSpacing(barSpacing, width = 1080, defaultBars = 120) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1080;
  const fallback = Math.max(6, Math.min(12, safeWidth / Math.max(20, defaultBars)));
  if (!Number.isFinite(barSpacing) || barSpacing < 2 || barSpacing > 60) {
    return fallback;
  }
  return barSpacing;
}

/**
 * Keep the user's approximate visible candle count when normalizing a timestamp
 * viewport. Non-replay switches anchor the right edge at `previous.to` so
 * switching to a higher timeframe never projects empty space into the future.
 * During replay, keep the cursor at the same visual position where possible and
 * cap future whitespace to two new bars.
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
    return { from: previous.to - span, to: previous.to };
  }

  const cursor = replayCursor;
  const maxRight = cursor + nextInterval * 2;
  const cursorPosition = Math.max(0, Math.min(1, (cursor - previous.from) / previousSpan));
  const desiredRight = cursor + span * (1 - cursorPosition);
  const right = Math.min(maxRight, desiredRight);
  return { from: right - span, to: right };
}
