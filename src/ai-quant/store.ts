import type { Vela } from '@luxalgo/vela';
import type { SavedScript } from '../pine/library';
import type { PineVersion } from './deepseek-client';
import { installOrUpdateChartIndicator } from './compiler-pipeline';

export const AI_QUANT_STORAGE_KEY = 'deplyze.ai_quant.sessions.v1';
export const MAX_AI_QUANT_SESSIONS = 50;
export const MAX_VERSIONS_PER_SESSION = 30;

export interface AiQuantVersion {
  id: string;
  versionNumber: number;
  name: string;
  pineVersion: PineVersion;
  source: string;
  promptSummary: string;
  createdAt: string;
  repairAttemptsUsed: number;
}

export interface AiQuantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imageNames?: string[];
  imageCount?: number;
  createdAt: string;
  status: 'complete' | 'error' | 'clarification';
  versionId?: string;
  versionNumber?: number;
  repairAttemptsUsed?: number;
  error?: string;
}

export interface AiQuantSession {
  id: string;
  name: string;
  chartInstanceId: string;
  pineVersion: PineVersion;
  originalRequirements: string;
  currentSource: string;
  previousWorkingSource: string | null;
  activeVersionId: string | null;
  versions: AiQuantVersion[];
  messages: AiQuantMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AiQuantPersistedState {
  version: 1;
  activeSessionId: string | null;
  sessions: AiQuantSession[];
}

function makeId(prefix = 'aiq'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptySession(initialName = 'New AI Indicator'): AiQuantSession {
  const id = makeId('ind');
  const now = new Date().toISOString();
  return {
    id,
    name: initialName,
    chartInstanceId: `pine:${id}`,
    pineVersion: 6,
    originalRequirements: '',
    currentSource: '',
    previousWorkingSource: null,
    activeVersionId: null,
    versions: [],
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function readAiQuantState(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): AiQuantPersistedState {
  if (!storage) {
    return { version: 1, activeSessionId: null, sessions: [] };
  }
  try {
    const raw = storage.getItem(AI_QUANT_STORAGE_KEY);
    if (!raw) {
      return { version: 1, activeSessionId: null, sessions: [] };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
      return { version: 1, activeSessionId: null, sessions: [] };
    }
    const validSessions: AiQuantSession[] = [];
    for (const s of parsed.sessions) {
      if (
        s &&
        typeof s.id === 'string' &&
        s.id &&
        typeof s.name === 'string' &&
        Array.isArray(s.versions) &&
        Array.isArray(s.messages)
      ) {
        validSessions.push({
          id: s.id,
          name: s.name,
          chartInstanceId: typeof s.chartInstanceId === 'string' ? s.chartInstanceId : `pine:${s.id}`,
          pineVersion: s.pineVersion === 5 ? 5 : 6,
          originalRequirements: typeof s.originalRequirements === 'string' ? s.originalRequirements : '',
          currentSource: typeof s.currentSource === 'string' ? s.currentSource : '',
          previousWorkingSource:
            typeof s.previousWorkingSource === 'string' ? s.previousWorkingSource : null,
          activeVersionId: typeof s.activeVersionId === 'string' ? s.activeVersionId : null,
          versions: s.versions.slice(-MAX_VERSIONS_PER_SESSION),
          messages: s.messages,
          createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
          updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date().toISOString(),
        });
      }
    }
    const activeSessionId =
      typeof parsed.activeSessionId === 'string' &&
      validSessions.some((s) => s.id === parsed.activeSessionId)
        ? parsed.activeSessionId
        : (validSessions[0]?.id ?? null);
    return {
      version: 1,
      activeSessionId,
      sessions: validSessions.slice(0, MAX_AI_QUANT_SESSIONS),
    };
  } catch {
    // Gracefully recover from any corrupted localStorage state
    return { version: 1, activeSessionId: null, sessions: [] };
  }
}

export function writeAiQuantState(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  state: AiQuantPersistedState,
): void {
  if (!storage) return;
  try {
    const trimmedSessions = state.sessions.slice(0, MAX_AI_QUANT_SESSIONS).map((s) => ({
      ...s,
      versions: s.versions.slice(-MAX_VERSIONS_PER_SESSION),
    }));
    storage.setItem(
      AI_QUANT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeSessionId: state.activeSessionId,
        sessions: trimmedSessions,
      }),
    );
  } catch {
    /* Ignore quota errors */
  }
}

export function upsertSavedScriptInList(
  existingScripts: SavedScript[],
  script: SavedScript,
): SavedScript[] {
  const idx = existingScripts.findIndex((s) => s.id === script.id);
  if (idx >= 0) {
    const copy = [...existingScripts];
    copy[idx] = script;
    return copy;
  }
  const combined = [script, ...existingScripts];
  return combined.slice(0, 100);
}

export function recordSuccessfulBuild(
  session: AiQuantSession,
  params: {
    userPrompt: string;
    imageNames?: string[];
    indicatorName: string;
    pineVersion: PineVersion;
    source: string;
    completionMessage: string;
    repairAttemptsUsed: number;
  },
): { updatedSession: AiQuantSession; newVersion: AiQuantVersion; savedScript: SavedScript } {
  const now = new Date().toISOString();
  const nextVersionNumber =
    session.versions.length > 0
      ? Math.max(...session.versions.map((v) => v.versionNumber)) + 1
      : 1;
  const versionId = makeId(`v${nextVersionNumber}`);

  const newVersion: AiQuantVersion = {
    id: versionId,
    versionNumber: nextVersionNumber,
    name: params.indicatorName,
    pineVersion: params.pineVersion,
    source: params.source,
    promptSummary:
      params.userPrompt.trim() ||
      (params.imageNames && params.imageNames.length > 0
        ? `Visual reference (${params.imageNames.join(', ')})`
        : `Version ${nextVersionNumber}`),
    createdAt: now,
    repairAttemptsUsed: params.repairAttemptsUsed,
  };

  const userMsg: AiQuantMessage = {
    id: makeId('msg-u'),
    role: 'user',
    text:
      params.userPrompt.trim() ||
      `Attached ${params.imageNames?.length ?? 1} reference image(s)`,
    imageNames: params.imageNames,
    imageCount: params.imageNames?.length ?? 0,
    createdAt: now,
    status: 'complete',
  };

  const assistantMsg: AiQuantMessage = {
    id: makeId('msg-a'),
    role: 'assistant',
    text: params.completionMessage,
    createdAt: now,
    status: 'complete',
    versionId: newVersion.id,
    versionNumber: newVersion.versionNumber,
    repairAttemptsUsed: params.repairAttemptsUsed,
  };

  const updatedSession: AiQuantSession = {
    ...session,
    name: params.indicatorName,
    pineVersion: params.pineVersion,
    originalRequirements:
      session.originalRequirements ||
      params.userPrompt.trim() ||
      'Built from visual reference image(s)',
    previousWorkingSource: session.currentSource ? session.currentSource : session.previousWorkingSource,
    currentSource: params.source,
    activeVersionId: newVersion.id,
    versions: [...session.versions, newVersion].slice(-MAX_VERSIONS_PER_SESSION),
    messages: [...session.messages, userMsg, assistantMsg],
    updatedAt: now,
  };

  const savedScript: SavedScript = {
    id: updatedSession.id,
    name: updatedSession.name,
    source: updatedSession.currentSource,
    updatedAt: now,
  };

  return { updatedSession, newVersion, savedScript };
}

export function recordFailedBuild(
  session: AiQuantSession,
  params: {
    userPrompt: string;
    imageNames?: string[];
    errorMessage: string;
    repairAttemptsUsed: number;
  },
): AiQuantSession {
  const now = new Date().toISOString();
  const userMsg: AiQuantMessage = {
    id: makeId('msg-u'),
    role: 'user',
    text:
      params.userPrompt.trim() ||
      `Attached ${params.imageNames?.length ?? 1} reference image(s)`,
    imageNames: params.imageNames,
    imageCount: params.imageNames?.length ?? 0,
    createdAt: now,
    status: 'complete',
  };

  const preservedNote = session.currentSource
    ? ' Your previous working indicator version has been preserved.'
    : '';

  const assistantMsg: AiQuantMessage = {
    id: makeId('msg-a'),
    role: 'assistant',
    text: `${params.errorMessage}${preservedNote}`,
    createdAt: now,
    status: 'error',
    repairAttemptsUsed: params.repairAttemptsUsed,
    error: params.errorMessage,
  };

  return {
    ...session,
    messages: [...session.messages, userMsg, assistantMsg],
    updatedAt: now,
  };
}

export async function restoreSessionVersion(
  session: AiQuantSession,
  versionId: string,
  options: {
    chart?: Pick<Vela, 'runIndicator' | 'indicators'> | null;
  } = {},
): Promise<{ updatedSession: AiQuantSession; restoredVersion: AiQuantVersion; savedScript: SavedScript }> {
  const targetVersion = session.versions.find((v) => v.id === versionId);
  if (!targetVersion) {
    throw new Error(`Version "${versionId}" was not found in this indicator's history.`);
  }

  if (options.chart) {
    await installOrUpdateChartIndicator(options.chart, session.id, targetVersion.source);
  }

  const now = new Date().toISOString();
  const restoreMsg: AiQuantMessage = {
    id: makeId('msg-r'),
    role: 'assistant',
    text: `Restored ${targetVersion.name} to v${targetVersion.versionNumber} and updated your chart.`,
    createdAt: now,
    status: 'complete',
    versionId: targetVersion.id,
    versionNumber: targetVersion.versionNumber,
  };

  const updatedSession: AiQuantSession = {
    ...session,
    name: targetVersion.name,
    pineVersion: targetVersion.pineVersion,
    previousWorkingSource: session.currentSource || session.previousWorkingSource,
    currentSource: targetVersion.source,
    activeVersionId: targetVersion.id,
    messages: [...session.messages, restoreMsg],
    updatedAt: now,
  };

  const savedScript: SavedScript = {
    id: updatedSession.id,
    name: updatedSession.name,
    source: updatedSession.currentSource,
    updatedAt: now,
  };

  return { updatedSession, restoredVersion: targetVersion, savedScript };
}
