export type ReplayViewportRange = { from: number; to: number };
export function timeframeDurationMs(timeframe: string): number;
export function normalizeReplayViewport(previous: ReplayViewportRange | null, replayCursor: number | null, previousTimeframe: string, timeframe: string): ReplayViewportRange | null;
