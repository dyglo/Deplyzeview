import type { Vela } from '@luxalgo/vela';
import type { IndicatorModel, OHLCV, PreparedScript } from '@luxalgo/vela/plugin';
import { PineEngine } from '@luxalgo/vela-pinets';
import { runPineIndicator, withPineWorkerTimeout, PINE_WORKER_TIMEOUT_MS } from '../pine/execution';
import { SOURCE_LIMIT } from '../pine/library';
import type { AiQuantImageAttachment } from './image-validation';
import {
  type AiQuantTransport,
  type PineVersion,
  buildConciseCompletionMessage,
  buildGenerationMessages,
  buildRepairMessages,
  detectRequestedPineVersion,
  extractGeneratedIndicator,
  parseIndicatorNameFromSource,
  parsePineVersionFromSource,
} from './deepseek-client';

export const MAX_REPAIR_ATTEMPTS = 5;

export type PipelineStage =
  | 'understand'
  | 'plan'
  | 'generate'
  | 'validate'
  | 'compile'
  | 'execute'
  | 'repair'
  | 'install'
  | 'save'
  | 'complete'
  | 'error';

export interface PipelineProgressEvent {
  stage: PipelineStage;
  label: string;
  attempt: number;
  maxAttempts: number;
  detail?: string;
}

export interface ValidationDiagnostics {
  prepared: PreparedScript;
  model: IndicatorModel;
  warnings: string[];
  visualSummary: {
    seriesCount: number;
    finiteSeriesPoints: number;
    boxesCount: number;
    linesCount: number;
    labelsCount: number;
    tablesCount: number;
    fillsCount: number;
    backgroundsCount: number;
    priceLinesCount: number;
    barColorsCount: number;
  };
  historicalConsistencyVerified: boolean;
}

export interface RepairAttemptRecord {
  attempt: number;
  stage: 'validate' | 'compile' | 'execute' | 'install';
  errorMessage: string;
  sourceSnapshot: string;
}

export interface AutonomousPipelineInput {
  indicatorId: string;
  prompt: string;
  images?: AiQuantImageAttachment[];
  requestedVersion?: PineVersion;
  existingIndicator?: {
    name: string;
    source: string;
    pineVersion: PineVersion;
    originalRequirements: string;
  } | null;
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    text: string;
  }>;
  chart?: Pick<Vela, 'runIndicator' | 'indicators'> | null;
  transport: AiQuantTransport;
  pineEngine?: Pick<PineEngine, 'prepare' | 'execute'>;
  testBars?: OHLCV[];
  maxRepairAttempts?: number;
  onProgress?: (event: PipelineProgressEvent) => void;
  onStreamDelta?: (deltaText: string, accumulatedText: string) => void;
  signal?: AbortSignal;
}

export interface AutonomousPipelineResult {
  ok: boolean;
  indicatorId: string;
  name: string;
  pineVersion: PineVersion;
  source: string;
  completionMessage: string;
  installedOnChart: boolean;
  updatedExistingInstance: boolean;
  repairAttemptsUsed: number;
  repairHistory: RepairAttemptRecord[];
  diagnostics?: ValidationDiagnostics;
  clarificationQuestion?: string | null;
  error?: string;
  preservedPreviousVersion: boolean;
}

const SHARED_PINE_ENGINE = new PineEngine();

const DEFAULT_TEST_BARS: OHLCV[] = Array.from({ length: 160 }, (_, i) => {
  // Deterministic multi-session synthetic price action with clear swings, sweeps, and volume spikes
  const wave1 = Math.sin(i / 6) * 4.2;
  const wave2 = Math.cos(i / 17) * 7.5;
  const trend = i * 0.04;
  const close = 100 + wave1 + wave2 + trend;
  const open = i === 0 ? close - 0.5 : 100 + Math.sin((i - 1) / 6) * 4.2 + Math.cos((i - 1) / 17) * 7.5 + (i - 1) * 0.04;
  const swingSpike = i % 19 === 0 ? 2.8 : i % 23 === 0 ? -2.8 : 0;
  const high = Math.max(open, close) + 1.4 + Math.max(0, swingSpike);
  const low = Math.min(open, close) - 1.4 + Math.min(0, swingSpike);
  const volume = 1200 + (i % 13) * 180 + (swingSpike !== 0 ? 1500 : 0);
  // 15-minute bars across multiple trading days (Asia, London, NY sessions)
  return {
    time: Date.UTC(2026, 0, 5, 0, 0, 0) + i * 15 * 60_000,
    open,
    high,
    low,
    close,
    volume,
  };
});

function executePreparedOnBars(
  engine: Pick<PineEngine, 'execute'>,
  prepared: PreparedScript,
  bars: OHLCV[],
  timeoutMs = PINE_WORKER_TIMEOUT_MS,
): Promise<{ model: IndicatorModel; warnings: string[] }> {
  const warnings: string[] = [];
  const execPromise = new Promise<{ model: IndicatorModel; warnings: string[] }>((resolve, reject) => {
    let latestModel: IndicatorModel | null = null;
    let settled = false;
    const session = engine.execute(
      {
        prepared,
        market: { symbol: 'AIQUANT:VERIFY', timeframe: '15' },
        bars,
        mode: 'static',
      },
      {
        onModel: (model) => {
          latestModel = model;
        },
        onWarning: (warning) => {
          const msg = typeof warning?.message === 'string' ? warning.message : String(warning);
          warnings.push(msg);
        },
        onError: (err) => {
          if (settled) return;
          settled = true;
          try {
            session.stop();
          } catch {
            /* ignore */
          }
          reject(err instanceof Error ? err : new Error(String(err)));
        },
        onDone: () => {
          if (settled) return;
          settled = true;
          try {
            session.stop();
          } catch {
            /* ignore */
          }
          if (!latestModel) {
            reject(new Error('Pine execution completed without producing an IndicatorModel.'));
            return;
          }
          resolve({ model: latestModel, warnings });
        },
      },
    );
  });

  return withPineWorkerTimeout(execPromise, {
    timeoutMs,
    message: 'Pine runtime execution timed out during autonomous validation.',
  });
}

export async function validateCompileAndExecutePine(
  source: string,
  options: {
    instanceId?: string;
    expectedVersion?: PineVersion;
    pineEngine?: Pick<PineEngine, 'prepare' | 'execute'>;
    bars?: OHLCV[];
  } = {},
): Promise<ValidationDiagnostics> {
  const trimmed = (source || '').trim();
  if (!trimmed) {
    throw new Error('Stage 2 (Validate): Generated Pine Script source is empty.');
  }
  const byteLen = new TextEncoder().encode(trimmed).byteLength;
  if (byteLen > SOURCE_LIMIT) {
    throw new Error(`Stage 2 (Validate): Script exceeds the ${SOURCE_LIMIT} byte limit.`);
  }

  const versionMatch = trimmed.match(/^\/\/@version\s*=\s*(\d+)/m);
  if (!versionMatch) {
    throw new Error('Stage 2 (Validate): Missing //@version=5 or //@version=6 directive.');
  }
  const actualVersion = Number.parseInt(versionMatch[1], 10);
  if (actualVersion !== 5 && actualVersion !== 6) {
    throw new Error(`Stage 2 (Validate): Unsupported Pine version //@version=${actualVersion}. Only v5 and v6 are supported.`);
  }
  if (options.expectedVersion && actualVersion !== options.expectedVersion) {
    throw new Error(
      `Stage 2 (Validate): Expected //@version=${options.expectedVersion} but script declared //@version=${actualVersion}.`,
    );
  }

  if (!/\b(?:indicator|study)\s*\(/.test(trimmed)) {
    throw new Error('Stage 2 (Validate): Script must contain an indicator(...) declaration.');
  }

  const engine = options.pineEngine ?? SHARED_PINE_ENGINE;
  const instanceId = options.instanceId ?? 'ai-quant-validate';
  const bars = options.bars && options.bars.length >= 40 ? options.bars : DEFAULT_TEST_BARS;

  // Stage 2 & 3: Prepare / Compile via DeplyzeView PineEngine
  let prepared: PreparedScript;
  try {
    prepared = await withPineWorkerTimeout(engine.prepare(trimmed, instanceId), {
      message: 'Stage 3 (Compile): Pine preparation timed out.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Stage 3 (Compile): ${msg}`);
  }

  // Stage 3 & 4: Compile and Execute on historical bars
  let model: IndicatorModel;
  let warnings: string[];
  try {
    const executed = await executePreparedOnBars(engine, prepared, bars);
    model = executed.model;
    warnings = executed.warnings;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/syntax|unexpected|expected|parse|token|undeclared|not defined|unknown function|compile|line \d+/i.test(msg)) {
      throw new Error(`Stage 3 (Compile): ${msg}`);
    }
    throw new Error(`Stage 4 (Execute): ${msg}`);
  }

  // Inspect visual outputs & logical behavior
  const seriesList = Array.isArray(model.series) ? model.series : [];
  let finiteSeriesPoints = 0;
  for (const s of seriesList) {
    const sAny = s as { points?: Array<{ time?: number; value?: number }>; bars?: Array<{ close?: number }> };
    if (Array.isArray(sAny.points)) {
      for (const pt of sAny.points) {
        if (pt && typeof pt.value === 'number' && Number.isFinite(pt.value)) {
          finiteSeriesPoints++;
        }
      }
    } else if (Array.isArray(sAny.bars)) {
      for (const b of sAny.bars) {
        if (b && typeof b.close === 'number' && Number.isFinite(b.close)) {
          finiteSeriesPoints++;
        }
      }
    }
  }

  const boxes = Array.isArray(model.boxes) ? model.boxes : [];
  const lines = Array.isArray(model.lines) ? model.lines : [];
  const labels = Array.isArray(model.labels) ? model.labels : [];
  const tables = Array.isArray(model.tables) ? model.tables : [];
  const fills = Array.isArray(model.fills) ? model.fills : [];
  const backgrounds = Array.isArray(model.backgrounds) ? model.backgrounds : [];
  const priceLines = Array.isArray(model.priceLines) ? model.priceLines : [];
  const barColors = Array.isArray(model.barColors) ? model.barColors : [];
  const polylines = Array.isArray((model as unknown as { polylines?: unknown[] }).polylines)
    ? ((model as unknown as { polylines: unknown[] }).polylines)
    : [];

  const totalVisualOutputs =
    finiteSeriesPoints +
    boxes.length +
    lines.length +
    labels.length +
    tables.length +
    fills.length +
    backgrounds.length +
    priceLines.length +
    barColors.length +
    polylines.length;

  if (totalVisualOutputs === 0) {
    throw new Error(
      'Stage 4 (Execute - Logical Verification): Script compiled and ran without throwing, but produced zero visible chart outputs (no finite plot points, boxes, lines, labels, tables, fills, backgrounds, or barcolors across 240 bars). Ensure detection thresholds and drawing/plot calls produce visible output.',
    );
  }

  // Verify drawing coordinates are finite
  for (const box of boxes) {
    if (!Number.isFinite(box.top) || !Number.isFinite(box.bottom)) {
      throw new Error('Stage 4 (Execute - Visual Verification): Box drawing contains non-finite top/bottom price coordinates.');
    }
  }
  for (const line of lines) {
    if (!Number.isFinite(line.y1) || !Number.isFinite(line.y2)) {
      throw new Error('Stage 4 (Execute - Visual Verification): Line drawing contains non-finite y1/y2 price coordinates.');
    }
  }
  for (const label of labels) {
    if (!Number.isFinite(label.y)) {
      throw new Error('Stage 4 (Execute - Visual Verification): Label drawing contains non-finite y price coordinate.');
    }
  }

  // Historical-bar / non-repainting check on prefix bars
  let historicalConsistencyVerified = true;
  if (bars.length >= 80 && finiteSeriesPoints > 0) {
    const prefixBars = bars.slice(0, bars.length - 15);
    const prefixExec = await executePreparedOnBars(engine, prepared, prefixBars);
    const prefixSeries = Array.isArray(prefixExec.model.series) ? prefixExec.model.series : [];
    if (prefixSeries.length !== seriesList.length) {
      historicalConsistencyVerified = false;
    } else if (prefixSeries.length > 0 && seriesList.length > 0) {
      // Compare a settled historical bar well before the tail
      const sampleTime = prefixBars[prefixBars.length - 10]?.time;
      const pPts = (prefixSeries[0] as { points?: Array<{ time: number; value?: number }> })?.points;
      const fPts = (seriesList[0] as { points?: Array<{ time: number; value?: number }> })?.points;
      const p0 = Array.isArray(pPts) ? pPts.find((pt) => pt.time === sampleTime)?.value : undefined;
      const f0 = Array.isArray(fPts) ? fPts.find((pt) => pt.time === sampleTime)?.value : undefined;
      if (typeof p0 === 'number' && typeof f0 === 'number' && Number.isFinite(p0) && Number.isFinite(f0)) {
        if (Math.abs(p0 - f0) > 1e-6) {
          historicalConsistencyVerified = false;
          warnings.push('Historical series value shifted when subsequent bars were appended (potential repainting).');
        }
      }
    }
  }

  return {
    prepared,
    model,
    warnings,
    visualSummary: {
      seriesCount: seriesList.length,
      finiteSeriesPoints,
      boxesCount: boxes.length,
      linesCount: lines.length,
      labelsCount: labels.length,
      tablesCount: tables.length,
      fillsCount: fills.length,
      backgroundsCount: backgrounds.length,
      priceLinesCount: priceLines.length,
      barColorsCount: barColors.length,
    },
    historicalConsistencyVerified,
  };
}

export async function installOrUpdateChartIndicator(
  chart: Pick<Vela, 'runIndicator' | 'indicators'>,
  indicatorId: string,
  source: string,
  timeoutMs = PINE_WORKER_TIMEOUT_MS,
): Promise<{ instanceId: string; updatedExisting: boolean }> {
  const instanceId = indicatorId.startsWith('pine:') ? indicatorId : `pine:${indicatorId}`;
  const existing = chart.indicators().find((h) => h.id === instanceId);

  if (existing) {
    const result = await withPineWorkerTimeout(existing.updateCode(source), {
      timeoutMs,
      message: 'Chart indicator update timed out.',
    });
    if (!result.ok) {
      throw result.error ?? new Error('Pine indicator could not be updated on the active chart.');
    }
    existing.setVisible(true);
    const verified = chart.indicators().some((h) => h.id === instanceId);
    if (!verified) {
      throw new Error('Indicator handle was lost after updating existing chart instance.');
    }
    return { instanceId, updatedExisting: true };
  }

  await runPineIndicator(chart, source, instanceId, timeoutMs);
  const verified = chart.indicators().some((h) => h.id === instanceId);
  if (!verified) {
    throw new Error('Indicator was not found on the active chart after installation.');
  }
  return { instanceId, updatedExisting: false };
}

function classifyErrorStage(errMsg: string): 'validate' | 'compile' | 'execute' | 'install' {
  if (errMsg.includes('Stage 2 (Validate)')) return 'validate';
  if (errMsg.includes('Stage 3 (Compile)')) return 'compile';
  if (errMsg.includes('Stage 6 (Chart Installation)')) return 'install';
  return 'execute';
}

export async function runAutonomousPipeline(
  input: AutonomousPipelineInput,
): Promise<AutonomousPipelineResult> {
  const maxAttempts = input.maxRepairAttempts ?? MAX_REPAIR_ATTEMPTS;
  const targetVersion: PineVersion =
    input.requestedVersion ??
    detectRequestedPineVersion(
      input.prompt,
      input.existingIndicator?.pineVersion ?? 6,
    );
  const isRefinement = Boolean(input.existingIndicator?.source);
  const previousWorkingSource = input.existingIndicator?.source ?? null;
  const repairHistory: RepairAttemptRecord[] = [];
  const pineEngine = input.pineEngine ?? SHARED_PINE_ENGINE;

  const emitProgress = (
    stage: PipelineStage,
    label: string,
    attempt = 0,
    detail?: string,
  ) => {
    input.onProgress?.({
      stage,
      label,
      attempt,
      maxAttempts,
      detail,
    });
  };

  // Stage 1: Understand -> Plan -> Generate
  emitProgress(
    'understand',
    input.images && input.images.length > 0
      ? 'Analyzing prompt and visual reference(s)...'
      : isRefinement
        ? 'Analyzing refinement request and existing indicator...'
        : 'Understanding indicator requirements...',
    0,
  );

  const generationMessages = buildGenerationMessages({
    prompt: input.prompt,
    images: input.images,
    requestedVersion: targetVersion,
    existingIndicator: input.existingIndicator,
    conversationHistory: input.conversationHistory,
  });

  emitProgress(
    'generate',
    isRefinement
      ? `Updating Pine Script v${targetVersion} indicator...`
      : `Generating Pine Script v${targetVersion} indicator...`,
    0,
  );

  let rawGenerationResponse: string;
  try {
    const reqId = `gen-${input.indicatorId}-${Date.now()}`;
    rawGenerationResponse = await input.transport.streamCompletion({
      requestId: reqId,
      messages: generationMessages,
      temperature: 0.2,
      onDelta: input.onStreamDelta,
      signal: input.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitProgress('error', message, 0, message);
    return {
      ok: false,
      indicatorId: input.indicatorId,
      name: input.existingIndicator?.name ?? 'AI Quant Indicator',
      pineVersion: targetVersion,
      source: previousWorkingSource ?? '',
      completionMessage: '',
      installedOnChart: false,
      updatedExistingInstance: false,
      repairAttemptsUsed: 0,
      repairHistory,
      error: message,
      preservedPreviousVersion: Boolean(previousWorkingSource),
    };
  }

  let candidateName = input.existingIndicator?.name ?? 'AI Quant Indicator';
  let candidateSource = '';
  let candidateVersion: PineVersion = targetVersion;
  let completionMessage = '';

  try {
    const extracted = extractGeneratedIndicator(rawGenerationResponse, targetVersion, isRefinement);
    if (extracted.clarificationQuestion) {
      emitProgress('complete', 'Clarification needed', 0);
      return {
        ok: true,
        indicatorId: input.indicatorId,
        name: candidateName,
        pineVersion: targetVersion,
        source: previousWorkingSource ?? '',
        completionMessage: extracted.clarificationQuestion,
        clarificationQuestion: extracted.clarificationQuestion,
        installedOnChart: false,
        updatedExistingInstance: false,
        repairAttemptsUsed: 0,
        repairHistory,
        preservedPreviousVersion: Boolean(previousWorkingSource),
      };
    }
    candidateName = isRefinement && input.existingIndicator?.name
      ? input.existingIndicator.name
      : extracted.name;
    candidateSource = extracted.source;
    candidateVersion = extracted.pineVersion;
    completionMessage = extracted.completionMessage;
  } catch (extractErr) {
    // Treat missing/malformed code block in initial generation as an error that enters Stage 5 repair
    candidateSource = rawGenerationResponse;
    completionMessage = buildConciseCompletionMessage(candidateName, isRefinement);
  }

  // Loop through Validation -> Compilation -> Execution -> Chart Installation, with up to maxAttempts Self-Repairs
  let attempt = 0;
  const seenErrors: string[] = [];

  while (true) {
    try {
      emitProgress(
        'validate',
        attempt === 0
          ? 'Validating Pine Script syntax and headers...'
          : `Validating repaired script (attempt ${attempt}/${maxAttempts})...`,
        attempt,
      );

      emitProgress(
        'compile',
        attempt === 0
          ? `Compiling Pine v${targetVersion} script...`
          : `Recompiling repaired script (attempt ${attempt}/${maxAttempts})...`,
        attempt,
      );

      emitProgress(
        'execute',
        attempt === 0
          ? 'Executing indicator and verifying visual diagnostics...'
          : `Testing repaired indicator execution (attempt ${attempt}/${maxAttempts})...`,
        attempt,
      );

      const diagnostics = await validateCompileAndExecutePine(candidateSource, {
        instanceId: `pine:${input.indicatorId}`,
        expectedVersion: targetVersion,
        pineEngine,
        bars: input.testBars,
      });

      candidateVersion = parsePineVersionFromSource(candidateSource, targetVersion);
      if (!isRefinement || !input.existingIndicator?.name) {
        candidateName = parseIndicatorNameFromSource(candidateSource, candidateName);
      }
      if (!completionMessage) {
        completionMessage = buildConciseCompletionMessage(candidateName, isRefinement);
      }

      // Stage 6: Automatic Chart Installation
      let installedOnChart = false;
      let updatedExistingInstance = false;

      if (input.chart) {
        emitProgress(
          'install',
          isRefinement
            ? 'Updating indicator on active chart...'
            : 'Installing indicator on active chart...',
          attempt,
        );
        try {
          const installOutcome = await installOrUpdateChartIndicator(
            input.chart,
            input.indicatorId,
            candidateSource,
          );
          installedOnChart = true;
          updatedExistingInstance = installOutcome.updatedExisting;
        } catch (installErr) {
          const installMsg = installErr instanceof Error ? installErr.message : String(installErr);
          throw new Error(`Stage 6 (Chart Installation): ${installMsg}`);
        }
      }

      emitProgress('complete', 'Indicator validated and active on chart.', attempt);
      return {
        ok: true,
        indicatorId: input.indicatorId,
        name: candidateName,
        pineVersion: candidateVersion,
        source: candidateSource,
        completionMessage: completionMessage || buildConciseCompletionMessage(candidateName, isRefinement),
        installedOnChart,
        updatedExistingInstance,
        repairAttemptsUsed: attempt,
        repairHistory,
        diagnostics,
        preservedPreviousVersion: false,
      };
    } catch (stageError) {
      const errorMessage = stageError instanceof Error ? stageError.message : String(stageError);
      const errorStage = classifyErrorStage(errorMessage);

      // Check if we have exhausted the 5 automatic repair attempts
      if (attempt >= maxAttempts) {
        // Restore previous working source on the chart if an update failed
        let restoredPrevious = false;
        if (previousWorkingSource && input.chart) {
          try {
            await installOrUpdateChartIndicator(input.chart, input.indicatorId, previousWorkingSource);
            restoredPrevious = true;
          } catch {
            /* ignore fallback error */
          }
        } else if (previousWorkingSource) {
          restoredPrevious = true;
        }

        const finalError = `Unable to resolve error after ${maxAttempts} automatic repair attempts: ${errorMessage}`;
        emitProgress('error', finalError, attempt, errorMessage);
        return {
          ok: false,
          indicatorId: input.indicatorId,
          name: candidateName,
          pineVersion: targetVersion,
          source: previousWorkingSource ?? candidateSource,
          completionMessage: '',
          installedOnChart: restoredPrevious,
          updatedExistingInstance: false,
          repairAttemptsUsed: attempt,
          repairHistory,
          error: finalError,
          preservedPreviousVersion: Boolean(previousWorkingSource),
        };
      }

      attempt += 1;
      seenErrors.push(errorMessage);
      repairHistory.push({
        attempt,
        stage: errorStage,
        errorMessage,
        sourceSnapshot: candidateSource,
      });

      emitProgress(
        'repair',
        `Repairing issue (attempt ${attempt}/${maxAttempts})...`,
        attempt,
        errorMessage,
      );

      // Detect repeated identical error and add explicit loop-breaker guidance
      const isRepeatedError =
        seenErrors.length >= 2 && seenErrors[seenErrors.length - 1] === seenErrors[seenErrors.length - 2];
      const augmentedErrorMessage = isRepeatedError
        ? `${errorMessage}\nCRITICAL: This exact error occurred on the previous repair attempt. Rewrite the offending section using simpler, standard Pine Script v${targetVersion} constructs and verify all array bounds and function arguments.`
        : errorMessage;

      const repairMessages = buildRepairMessages({
        originalPrompt:
          input.prompt ||
          input.existingIndicator?.originalRequirements ||
          'Build indicator from visual reference.',
        brokenSource: candidateSource,
        errorMessage: augmentedErrorMessage,
        errorStage,
        attemptNumber: attempt,
        maxAttempts,
        targetVersion,
        previousWorkingSource,
        previousErrors: seenErrors,
        images: input.images,
      });

      try {
        const repairReqId = `repair-${input.indicatorId}-${attempt}-${Date.now()}`;
        const repairRawResponse = await input.transport.streamCompletion({
          requestId: repairReqId,
          messages: repairMessages,
          temperature: Math.min(0.4, 0.15 + attempt * 0.05),
          onDelta: input.onStreamDelta,
          signal: input.signal,
        });
        const extractedRepair = extractGeneratedIndicator(repairRawResponse, targetVersion, isRefinement);
        if (extractedRepair.source) {
          candidateSource = extractedRepair.source;
          if (!isRefinement && extractedRepair.name) {
            candidateName = extractedRepair.name;
          }
        }
      } catch (repairTransportError) {
        const transportErrMsg =
          repairTransportError instanceof Error
            ? repairTransportError.message
            : String(repairTransportError);
        emitProgress('error', transportErrMsg, attempt, transportErrMsg);
        return {
          ok: false,
          indicatorId: input.indicatorId,
          name: candidateName,
          pineVersion: targetVersion,
          source: previousWorkingSource ?? candidateSource,
          completionMessage: '',
          installedOnChart: false,
          updatedExistingInstance: false,
          repairAttemptsUsed: attempt,
          repairHistory,
          error: transportErrMsg,
          preservedPreviousVersion: Boolean(previousWorkingSource),
        };
      }
    }
  }
}
