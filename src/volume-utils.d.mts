export function mergeObservedTradeVolume(
  currentVolume: number | undefined,
  tradeSize: number,
  barTime: number,
  firstCompleteLiveBarTime: number,
): number | undefined;

export function shouldApplyTradeAfterSnapshot(tradeTime: number, snapshotTime: number): boolean;

export function formatVolume(value: number): string;
