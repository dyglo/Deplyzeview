export function mergeObservedTradeVolume(currentVolume, tradeSize, barTime, firstCompleteLiveBarTime) {
  if (!Number.isFinite(tradeSize) || tradeSize <= 0) return currentVolume;
  if (Number.isFinite(currentVolume)) return currentVolume + tradeSize;
  if (barTime >= firstCompleteLiveBarTime) return tradeSize;
  return undefined;
}

export function shouldApplyTradeAfterSnapshot(tradeTime, snapshotTime) {
  return !Number.isFinite(snapshotTime) || snapshotTime <= 0 || tradeTime > snapshotTime;
}

export function formatVolume(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';

  const magnitude = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (magnitude >= 1_000_000) return `${sign}${(magnitude / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (magnitude >= 10_000) return `${sign}${(magnitude / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  if (magnitude >= 1_000) return `${sign}${(magnitude / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  if (magnitude >= 100) return `${sign}${Math.round(magnitude)}`;
  if (magnitude >= 1) return `${sign}${magnitude.toFixed(magnitude >= 10 ? 1 : 2).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')}`;

  if (magnitude < 1e-8) return `${sign}${magnitude.toExponential(2)}`;
  const decimals = Math.min(8, Math.max(3, Math.ceil(-Math.log10(magnitude)) + 2));
  const text = magnitude.toFixed(decimals).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
  return `${sign}${text}`;
}
