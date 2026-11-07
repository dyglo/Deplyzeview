import type { Vela } from '@luxalgo/vela';

export const PINE_WORKER_TIMEOUT_MS = 30_000;
export const PINE_WORKER_TIMEOUT_MESSAGE = 'Pine execution did not respond within 30 seconds. The worker may be blocked by the app security policy or the script may need more time.';

export function withPineWorkerTimeout<T>(
  operation: PromiseLike<T>,
  options: { timeoutMs?: number; message?: string; onLateSuccess?: (value: T) => void } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? PINE_WORKER_TIMEOUT_MS;
  const message = options.message ?? PINE_WORKER_TIMEOUT_MESSAGE;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      timedOut = true;
      reject(new Error(message));
    }, timeoutMs);

    Promise.resolve(operation).then(
      value => {
        if (timedOut) {
          try { options.onLateSuccess?.(value); } catch { /* Ignore cleanup failures after timeout. */ }
          return;
        }
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function runPineIndicator(
  chart: Pick<Vela, 'runIndicator' | 'indicators'>,
  source: string,
  instanceId: string,
  timeoutMs = PINE_WORKER_TIMEOUT_MS,
): Promise<void> {
  try {
    const result = await withPineWorkerTimeout(
      chart.runIndicator(source, { id: instanceId, language: 'pine' }),
      {
        timeoutMs,
        onLateSuccess: outcome => { if (outcome.ok) outcome.handle?.remove(); },
      },
    );
    if (!result.ok) throw result.error ?? new Error('Pine indicator could not be added to the chart.');
  } catch (error) {
    chart.indicators().find(handle => handle.id === instanceId)?.remove();
    throw error;
  }
}
