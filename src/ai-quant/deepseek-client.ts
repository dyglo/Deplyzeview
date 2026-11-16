import type { AiQuantImageAttachment } from './image-validation';
import { listPineReferences } from './reference-library';

export const DEEPSEEK_MODEL_ID = 'deepseek-flash';
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export type PineVersion = 5 | 6;

export interface DeepSeekTextPart {
  type: 'text';
  text: string;
}

export interface DeepSeekImagePart {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

export type DeepSeekContentPart = DeepSeekTextPart | DeepSeekImagePart;

export interface DeepSeekToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | DeepSeekContentPart[] | null;
  tool_calls?: DeepSeekToolCall[];
  tool_call_id?: string;
}

export interface AiQuantStatusResponse {
  configured: boolean;
  model: string;
  baseUrl: string;
  error?: string | null;
}

export interface GeneratedIndicatorPayload {
  name: string;
  pineVersion: PineVersion;
  source: string;
  completionMessage: string;
  planSummary?: string;
  clarificationQuestion?: string | null;
}

export interface StreamCompletionOptions {
  requestId: string;
  messages: DeepSeekMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
  onDelta?: (deltaText: string, accumulatedText: string) => void;
  onToolCalls?: (toolCalls: DeepSeekToolCall[]) => void;
  signal?: AbortSignal;
}

export interface AiQuantTransport {
  getStatus(): Promise<AiQuantStatusResponse>;
  streamCompletion(options: StreamCompletionOptions): Promise<string>;
  cancelCompletion(requestId: string): Promise<void>;
}

export const AI_QUANT_REFERENCE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_pine_references',
      description:
        'Search the curated DeplyzeView Pine Script reference library of verified institutional indicators by keyword or category. Call this only when the user request relates to an indicator archetype that may exist in the library.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Keywords describing the indicator to search for (e.g. "smc order blocks", "market structure bos choch", "support resistance zones", "supply demand", "channel", "ema regime", "macd", "volume profile").',
          },
          category: {
            type: 'string',
            description:
              'Optional category filter (e.g. "smc", "market-structure", "support-resistance", "supply-demand", "channel", "trend", "oscillator", "volume-profile").',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_pine_reference',
      description:
        'Read the full verified Pine Script source code and architectural notes of a specific reference indicator from the DeplyzeView library by its id.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description:
              'The reference indicator ID (e.g. "smc-structure-order-blocks", "market-structure", "tf-sr-zones", "supply-and-demand-visible-range", "auto-channel-detector", "ema-regime", "macd", "volume-profile-fixed-range").',
          },
        },
        required: ['id'],
      },
    },
  },
];

export const AI_QUANT_TOOLS = [
  ...AI_QUANT_REFERENCE_TOOLS,
  {
    type: 'function',
    function: {
      name: 'submit_pine_indicator',
      description:
        'Submit the complete, self-contained Pine Script v5 or v6 indicator source code along with its display name and concise user completion message.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Short, descriptive indicator name (e.g. "Institutional Supply & Demand").',
          },
          pineVersion: {
            type: 'integer',
            enum: [5, 6],
            description: 'Pine Script version (6 by default, 5 if explicitly requested).',
          },
          source: {
            type: 'string',
            description:
              'Complete, valid Pine Script code starting with //@version=6 or //@version=5 and indicator(...).',
          },
          completionMessage: {
            type: 'string',
            description:
              'Concise confirmation message for the user once installed on the chart, without code instructions.',
          },
        },
        required: ['name', 'pineVersion', 'source', 'completionMessage'],
      },
    },
  },
];

function buildReferenceIndexPrompt(): string {
  const refs = listPineReferences();
  if (refs.length === 0) return '';
  const catalogLines = refs
    .map((r) => `   - id: "${r.id}" | ${r.title} [tags: ${r.tags.slice(0, 6).join(', ')}]`)
    .join('\n');
  return `
8. ON-DEMAND CURATED PINE SCRIPT REFERENCE LIBRARY (TOOL USE):
   - You have access to \`read_pine_reference\` and \`search_pine_references\` tools backed by DeplyzeView's curated library of verified, production-grade Pine Script indicators:
${catalogLines}
   - WHEN TO CALL: When building a new indicator (or adding a major new feature) that matches or overlaps with one of the reference indicators above, call \`read_pine_reference\` with the matching \`id\` (or \`search_pine_references\` if unsure) BEFORE writing code so you can study its exact non-repainting structure, object management, and visual styling.
   - WHEN NOT TO CALL: If the user's request does not match any reference in the library, or is a simple follow-up tweak to an already-loaded indicator, DO NOT call the reference tools—proceed immediately using your own Pine Script expertise.`;
}

const SYSTEM_PROMPT_BASE = `You are AI Quant, an autonomous institutional Pine Script indicator engineering agent integrated into DeplyzeView.
Your sole responsibility is to design, implement, refine, and repair complete, production-grade TradingView Pine Script indicators that compile and execute cleanly on the DeplyzeView Pine v5/v6 runtime (@luxalgo/vela-pinets) and automatically install onto the user's active chart.

CRITICAL OPERATING RULES:
1. AUTONOMOUS EXECUTION & SPEED: Never ask the user to copy code, open the Pine Editor, compile scripts, fix errors, or click "Apply to Chart". Everything is compiled, tested, and installed automatically. Keep code clean, modular, and concise without bloated boilerplate comments so generation streams fast.
2. NO UNNECESSARY QUESTIONS: When minor implementation details (lookback lengths, colors, thresholds, zone capacities, session hours) are unspecified, choose sensible institutional defaults and build the indicator immediately. Only ask for clarification (using \`CLARIFICATION_REQUIRED: <question>\` without code) if the request is completely unintelligible or contradictory in a way that makes any implementation impossible.
3. PINE VERSION:
   - Use Pine Script v6 (\`//@version=6\`) by default.
   - Use Pine Script v5 (\`//@version=5\`) whenever the user explicitly requests v5 or when refining/adapting a v5 script without a version upgrade request.
4. DEPLYZEVIEW PINE RUNTIME COMPATIBILITY (HIGH-ACCURACY FIRST-PASS RULES):
   - Always begin the script with \`//@version=6\` (or \`//@version=5\`) on line 1, followed by \`indicator("Title", shorttitle="...", overlay=true/false, max_boxes_count=500, max_lines_count=500, max_labels_count=500)\`.
   - Keep generated indicators clean and concise (typically 90–180 lines) so they stream fast and never hit token limits on follow-up refinements.
   - Use standard namespaces: \`ta.*\`, \`math.*\`, \`array.*\`, \`box.*\`, \`line.*\`, \`linefill.*\`, \`label.*\`, \`table.*\`, \`color.*\`, \`input.*\`, \`str.*\`, \`request.*\`.
   - Prefer parallel typed arrays (\`array.new_box()\`, \`array.new_float()\`, \`array.new_int()\`, \`array.new_bool()\`, \`array.new_label()\`, \`array.new_line()\`) over verbose \`type\`/\`method\` UDT boilerplate so scripts stay compact and execute with 100% reliability in the runtime.
   - IMPORTANT FOR LOOP SAFETY: In Pine Script, \`for i = 0 to array.size(arr) - 1\` will fail if \`array.size(arr) == 0\`. ALWAYS guard array loops with \`if array.size(arr) > 0\` before iterating.
   - Always use explicit typed inputs (\`input.int\`, \`input.float\`, \`input.bool\`, \`input.color\`, \`input.string\`, \`input.timeframe\`, \`input.source\`) and \`color.new(baseColor, transp)\` (never deprecated \`transp=\` or untyped \`input()\`).
   - Do not use \`strategy()\` or \`library()\`; always generate an \`indicator()\`.
   - Ensure every indicator produces visible chart output (plots, boxes, lines, labels, histograms, barcolors, or tables) on normal price action and exposes clean \`input.*\` settings for user customization.
   - Avoid future-bar lookahead or repainting logic on historical bars; rely on confirmed pivots, confirmed bar closes, or causal calculations.
5. CONTINUOUS CONVERSATIONAL REFINEMENT:
   - When an existing indicator is provided, ALWAYS treat the user's message as a continuation/improvement of that active indicator—never as an unrelated new prompt. Preserve all existing working logic, inputs, and visual structures while applying the requested enhancement or answering the follow-up question.
6. MULTIMODAL VISUAL REFERENCE UNDERSTANDING:
   - When the user attaches one or more reference images (with or without text), inspect chart structures, supply/demand zones, support/resistance levels, session boxes, candlestick patterns, labels/annotations, color hierarchy, oscillator layouts, and signal markers.
   - Translate observable visual elements into coherent Pine Script calculations and drawings (\`box.new\`, \`line.new\`, \`label.new\`, \`plot\`, \`plotshape\`, \`fill\`, \`bgcolor\`).
7. OUTPUT FORMAT:
   - Provide a brief 1-2 sentence completion summary suitable for the user (e.g., "Your Institutional Supply & Demand indicator has been created, validated and added to your chart."), followed by the complete Pine Script enclosed in a single \`\`\`pine ... \`\`\` code block.
   - Never output partial snippets, placeholders like \`// ... existing code ...\`, or truncated scripts. Always output the FULL runnable Pine Script.${buildReferenceIndexPrompt()}`;

export function detectRequestedPineVersion(
  promptText: string,
  fallbackVersion: PineVersion = 6,
): PineVersion {
  const text = (promptText || '').toLowerCase();
  if (
    /\b(?:pine\s*(?:script)?\s*)?v(?:ersion\s*)?5\b/.test(text) ||
    /\/\/@version\s*=\s*5/.test(text)
  ) {
    return 5;
  }
  if (
    /\b(?:pine\s*(?:script)?\s*)?v(?:ersion\s*)?6\b/.test(text) ||
    /\/\/@version\s*=\s*6/.test(text)
  ) {
    return 6;
  }
  return fallbackVersion;
}

export interface BuildGenerationMessagesInput {
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
}

export function buildGenerationMessages(input: BuildGenerationMessagesInput): DeepSeekMessage[] {
  const images = input.images ?? [];
  const trimmedPrompt = (input.prompt || '').trim();
  const targetVersion =
    input.requestedVersion ??
    detectRequestedPineVersion(
      trimmedPrompt,
      input.existingIndicator?.pineVersion ?? 6,
    );

  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT_BASE}\n\nTarget Pine Script version for this build: //@version=${targetVersion}.`,
    },
  ];

  // Include conversation context if refining/continuing an existing indicator
  const priorUserRequests: string[] = [];
  if (input.conversationHistory && input.conversationHistory.length > 0) {
    for (const entry of input.conversationHistory) {
      if (entry.role === 'user' && entry.text && entry.text.trim()) {
        priorUserRequests.push(entry.text.trim());
      }
    }
    const recentHistory = input.conversationHistory.slice(-8);
    for (const entry of recentHistory) {
      if (entry.text && entry.text.trim()) {
        messages.push({
          role: entry.role,
          content: entry.text.trim(),
        });
      }
    }
  }

  let userInstruction = '';
  if (input.existingIndicator) {
    const cumulativeReqs =
      priorUserRequests.length > 0
        ? priorUserRequests.map((req, i) => `Turn ${i + 1}: ${req}`).join('\n')
        : input.existingIndicator.originalRequirements;

    userInstruction += `REFINEMENT MODE — MODIFY EXISTING INDICATOR (CONTINUOUS FOLLOW-UP)
Indicator Name: ${input.existingIndicator.name}
Original Requirements: ${input.existingIndicator.originalRequirements}
Cumulative Session Requirements:
${cumulativeReqs}
Target Pine Version: //@version=${targetVersion}

Current Working Pine Script Source:
\`\`\`pine
${input.existingIndicator.source}
\`\`\`

User Follow-Up / Continuation Request:
${trimmedPrompt || 'Refine and align the existing indicator with the attached visual reference(s).'}

Instructions for Continuation & Refinement:
1. Treat this message strictly as a continuation and incremental improvement of "${input.existingIndicator.name}"—NEVER as an unrelated new indicator.
2. Modify the Current Working Pine Script Source above to fulfill the user's follow-up request or question.
3. Preserve all existing working logic, inputs, sessions, calculations, and visual elements from prior turns unless the user explicitly asked to replace or remove them.
4. Provide a concise 1-2 sentence response addressing the user's follow-up, followed by the complete updated Pine Script (\`//@version=${targetVersion}\`) in a single \`\`\`pine code block.`;
  } else if (trimmedPrompt && images.length > 0) {
    userInstruction = `User Indicator Request (with ${images.length} reference image${images.length > 1 ? 's' : ''}):
${trimmedPrompt}

Analyze both the text requirements and all attached reference image(s) (chart structures, zones, levels, labels, colors, layout, and signal markers). Generate a complete, self-contained Pine Script v${targetVersion} indicator (\`//@version=${targetVersion}\`).`;
  } else if (!trimmedPrompt && images.length > 0) {
    userInstruction = `Visual Reference Indicator Request (${images.length} reference image${images.length > 1 ? 's' : ''} attached, no text prompt provided):
Carefully inspect the attached chart screenshot(s). Identify all observable indicator elements—such as supply and demand zones, support/resistance levels, session boxes, trend lines, moving averages, oscillators, candlestick coloring, signal markers, and labels/tables.
Infer coherent quantitative detection rules and visual styling that faithfully reproduce the indicator layout shown in the image(s), and generate the complete Pine Script v${targetVersion} indicator (\`//@version=${targetVersion}\`) with configurable inputs.`;
  } else {
    userInstruction = `User Indicator Request:
${trimmedPrompt}

Generate a complete, self-contained Pine Script v${targetVersion} indicator (\`//@version=${targetVersion}\`) with clean inputs and visual outputs.`;
  }

  if (images.length === 0) {
    messages.push({
      role: 'user',
      content: userInstruction,
    });
  } else {
    const parts: DeepSeekContentPart[] = [
      {
        type: 'text',
        text: userInstruction,
      },
      ...images.map(
        (img): DeepSeekImagePart => ({
          type: 'image_url',
          image_url: {
            url: img.dataUrl,
          },
        }),
      ),
    ];
    messages.push({
      role: 'user',
      content: parts,
    });
  }

  return messages;
}

export interface BuildRepairMessagesInput {
  originalPrompt: string;
  brokenSource: string;
  errorMessage: string;
  errorStage: 'validate' | 'compile' | 'execute' | 'install';
  attemptNumber: number;
  maxAttempts: number;
  targetVersion: PineVersion;
  previousWorkingSource?: string | null;
  previousErrors?: string[];
  images?: AiQuantImageAttachment[];
}

export function extractLineContext(source: string, errorMessage: string): string {
  const lines = source.split(/\r?\n/);
  const lineMatch =
    errorMessage.match(/(?:line|Line)\s+(\d+)/) ||
    errorMessage.match(/:(\d+):(\d+)/);
  if (!lineMatch) return '';
  const lineNum = Number.parseInt(lineMatch[1], 10);
  if (!Number.isFinite(lineNum) || lineNum < 1 || lineNum > lines.length) {
    return '';
  }
  const start = Math.max(1, lineNum - 3);
  const end = Math.min(lines.length, lineNum + 3);
  const snippet: string[] = [];
  for (let i = start; i <= end; i++) {
    const marker = i === lineNum ? '>> ' : '   ';
    snippet.push(`${marker}${i}: ${lines[i - 1]}`);
  }
  return snippet.join('\n');
}

export function buildRepairMessages(input: BuildRepairMessagesInput): DeepSeekMessage[] {
  const lineContext = extractLineContext(input.brokenSource, input.errorMessage);
  const repeatedWarning =
    input.previousErrors && input.previousErrors.length > 1
      ? `\nPrevious repair error history (DO NOT repeat the same broken construct):\n${input.previousErrors
          .map((e, idx) => `Attempt ${idx + 1}: ${e}`)
          .join('\n')}\n`
      : '';

  const previousWorkingSection = input.previousWorkingSource
    ? `\nReference Previous Working Source (do not lose working features from this baseline):\n\`\`\`pine\n${input.previousWorkingSource}\n\`\`\`\n`
    : '';

  const repairInstruction = `AUTONOMOUS SELF-REPAIR — ATTEMPT ${input.attemptNumber} OF ${input.maxAttempts}
The Pine Script indicator failed during Stage "${input.errorStage}".

Original Requirements:
${input.originalPrompt || 'Build indicator from visual reference.'}

Target Pine Version: //@version=${input.targetVersion}

Actual Error Diagnostic:
${input.errorMessage}
${lineContext ? `\nOffending Code Context:\n${lineContext}\n` : ''}${repeatedWarning}${previousWorkingSection}
Broken Pine Script Source:
\`\`\`pine
${input.brokenSource}
\`\`\`

REPAIR INSTRUCTIONS:
1. Fix the exact root cause of the error above while preserving ALL requested indicator functionality, visual elements, and settings.
2. Never strip out requested features just to make the script compile.
3. Check common PineTS runtime pitfalls:
   - Ensure \`//@version=${input.targetVersion}\` is on line 1 and \`indicator(...)\` is declared.
   - Always guard array loops with \`if array.size(arr) > 0\` before \`for i = 0 to array.size(arr) - 1\`.
   - Use valid Pine Script v${input.targetVersion} namespaces (\`ta.*\`, \`math.*\`, \`array.*\`, \`box.*\`, \`line.*\`, \`label.*\`, \`color.*\`, \`input.*\`).
   - Do not pass \`na\` coordinates where finite bar_index/price numbers are required, and ensure at least one visible output (plot, box, line, label, bgcolor, barcolor, or table) is produced.
4. Output the complete corrected Pine Script inside a single \`\`\`pine ... \`\`\` code block.`;

  const messages: DeepSeekMessage[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT_BASE}\n\nYou are executing Stage 5 (Autonomous Self-Repair) for Pine Script v${input.targetVersion}.`,
    },
  ];

  if (input.images && input.images.length > 0) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: repairInstruction },
        ...input.images.map(
          (img): DeepSeekImagePart => ({
            type: 'image_url',
            image_url: { url: img.dataUrl },
          }),
        ),
      ],
    });
  } else {
    messages.push({
      role: 'user',
      content: repairInstruction,
    });
  }

  return messages;
}

export function parseIndicatorNameFromSource(source: string, fallback = 'AI Quant Indicator'): string {
  const match =
    source.match(/\bindicator\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/) ||
    source.match(/\bstudy\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/);
  if (match && match[1] && match[1].trim()) {
    return match[1].trim();
  }
  return fallback;
}

export function parsePineVersionFromSource(source: string, fallback: PineVersion = 6): PineVersion {
  const match = source.match(/\/\/@version\s*=\s*([56])/);
  if (match && match[1] === '5') return 5;
  if (match && match[1] === '6') return 6;
  return fallback;
}

export function buildConciseCompletionMessage(
  indicatorName: string,
  isUpdate = false,
): string {
  const cleanName = indicatorName.replace(/\s+indicator$/i, '').trim() || 'AI Quant';
  if (isUpdate) {
    return `Your ${cleanName} indicator has been updated, validated and refreshed on your chart.`;
  }
  return `Your ${cleanName} indicator has been created, validated and added to your chart.`;
}

export function stripDeepSeekSafetyTags(text: string): string {
  return (text || '').replace(/<ds_safety>[\s\S]*$/i, '').trim();
}

/**
 * Extracts a structured GeneratedIndicatorPayload from either a JSON tool call payload,
 * a fenced ```pine / ```pinescript code block, or raw Pine source returned by DeepSeek.
 */
export function extractGeneratedIndicator(
  rawResponse: string,
  targetVersion: PineVersion = 6,
  isUpdate = false,
): GeneratedIndicatorPayload {
  const trimmed = stripDeepSeekSafetyTags(rawResponse || '');
  if (!trimmed) {
    throw new Error('DeepSeek returned an empty response.');
  }

  // Check if the model explicitly requested essential clarification without code
  const clarificationMatch = trimmed.match(/CLARIFICATION_REQUIRED\s*:\s*([\s\S]+)/i);
  if (clarificationMatch && !trimmed.includes('indicator(')) {
    const question = clarificationMatch[1].trim();
    return {
      name: 'Clarification Needed',
      pineVersion: targetVersion,
      source: '',
      completionMessage: question,
      clarificationQuestion: question,
    };
  }

  // 1. Check if response is or contains a JSON object from tool/function call
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.source === 'string') {
      const source = normalizePineSource(parsed.source, parsed.pineVersion || targetVersion);
      const name =
        typeof parsed.name === 'string' && parsed.name.trim()
          ? parsed.name.trim()
          : parseIndicatorNameFromSource(source);
      const pineVersion = parsePineVersionFromSource(source, parsed.pineVersion === 5 ? 5 : targetVersion);
      const completionMessage =
        typeof parsed.completionMessage === 'string' && parsed.completionMessage.trim()
          ? parsed.completionMessage.trim()
          : buildConciseCompletionMessage(name, isUpdate);
      return { name, pineVersion, source, completionMessage };
    }
  } catch {
    /* Not pure JSON; proceed with fenced code extraction */
  }

  // 2. Extract fenced ```pine, ```pinescript, or generic ``` code block containing indicator(
  const fenceRegex = /```(?:pine|pinescript)?\s*\r?\n([\s\S]*?)```/gi;
  let bestCode = '';
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(trimmed)) !== null) {
    const candidate = match[1].trim();
    if (candidate.includes('indicator(') || candidate.includes('//@version=')) {
      bestCode = candidate;
      break;
    }
    if (!bestCode && candidate.length > 20) {
      bestCode = candidate;
    }
  }

  // 3. Fallback if raw response directly starts with //@version= or indicator(
  if (!bestCode) {
    const versionIdx = trimmed.indexOf('//@version=');
    const indicatorIdx = trimmed.indexOf('indicator(');
    if (versionIdx >= 0) {
      bestCode = trimmed.slice(versionIdx).trim();
    } else if (indicatorIdx >= 0) {
      bestCode = trimmed.slice(indicatorIdx).trim();
    }
  }

  if (!bestCode) {
    throw new Error('DeepSeek response did not contain a valid Pine Script indicator block.');
  }

  const source = normalizePineSource(bestCode, targetVersion);
  const name = parseIndicatorNameFromSource(source);
  const pineVersion = parsePineVersionFromSource(source, targetVersion);

  // Extract conversational prose outside the code block if concise, else use standard concise message
  const proseWithoutCode = trimmed
    .replace(/```[\s\S]*?```/g, '')
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .join(' ');

  const completionMessage =
    proseWithoutCode.length >= 12 && proseWithoutCode.length <= 380
      ? proseWithoutCode
      : buildConciseCompletionMessage(name, isUpdate);

  return {
    name,
    pineVersion,
    source,
    completionMessage,
    planSummary: proseWithoutCode || undefined,
  };
}

export function normalizePineSource(rawCode: string, targetVersion: PineVersion = 6): string {
  let code = stripDeepSeekSafetyTags(rawCode.replace(/^\uFEFF/, '')).trim();
  // Remove stray trailing markdown fences if any
  code = code.replace(/^```(?:pine|pinescript)?\s*/i, '').replace(/\s*```$/, '').trim();

  // Normalize legacy study() declaration to indicator()
  code = code.replace(/^(\s*)study\s*\(/m, '$1indicator(');

  if (!/^\/\/@version\s*=\s*[56]/m.test(code)) {
    code = `//@version=${targetVersion}\n${code}`;
  } else if (targetVersion === 5 && /^\/\/@version\s*=\s*6/m.test(code)) {
    code = code.replace(/^\/\/@version\s*=\s*6/m, '//@version=5');
  } else if (targetVersion === 6 && /^\/\/@version\s*=\s*5/m.test(code)) {
    code = code.replace(/^\/\/@version\s*=\s*5/m, '//@version=6');
  }

  return code;
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__)
  );
}

interface TauriStreamEventPayload {
  requestId: string;
  type?: 'delta' | 'done' | 'error';
  eventType?: 'delta' | 'done' | 'error';
  delta?: string | null;
  reasoningDelta?: string | null;
  done?: boolean;
  error?: string | null;
}

interface TauriStreamResultPayload {
  content?: string;
  reasoning?: string;
  toolCalls?: unknown[];
  model?: string;
}

export function createDefaultAiQuantTransport(fetchImpl: typeof fetch = fetch): AiQuantTransport {
  return {
    async getStatus(): Promise<AiQuantStatusResponse> {
      if (isTauriRuntime()) {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<AiQuantStatusResponse>('get_ai_quant_status');
      }
      const res = await fetchImpl('/__deplyzeview_ai_quant/status', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        return {
          configured: false,
          model: DEEPSEEK_MODEL_ID,
          baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
          error: `AI Quant status check failed (HTTP ${res.status}).`,
        };
      }
      return (await res.json()) as AiQuantStatusResponse;
    },

    async streamCompletion(options: StreamCompletionOptions): Promise<string> {
      const {
        requestId,
        messages,
        temperature = 0.2,
        maxTokens = 8192,
        tools,
        onDelta,
        onToolCalls,
        signal,
      } = options;

      if (isTauriRuntime()) {
        const [{ invoke }, { listen }] = await Promise.all([
          import('@tauri-apps/api/core'),
          import('@tauri-apps/api/event'),
        ]);

        let accumulated = '';
        let unlisten: (() => void) | null = null;
        const abortHandler = () => {
          void invoke('cancel_ai_quant_stream', { requestId }).catch(() => {});
        };
        if (signal) {
          if (signal.aborted) {
            throw new Error('Request cancelled');
          }
          signal.addEventListener('abort', abortHandler, { once: true });
        }

        try {
          unlisten = await listen<TauriStreamEventPayload>('ai-quant-stream', (event) => {
            const payload = event.payload;
            if (!payload || payload.requestId !== requestId) return;
            if (typeof payload.delta === 'string' && payload.delta.length > 0 && !payload.done) {
              accumulated += payload.delta;
              onDelta?.(payload.delta, stripDeepSeekSafetyTags(accumulated));
            }
          });

          const finalResult = await invoke<TauriStreamResultPayload | string>(
            'stream_ai_quant_completion',
            {
              requestId,
              messages,
              tools: tools ?? null,
              temperature,
            },
          );
          if (
            typeof finalResult === 'object' &&
            finalResult !== null &&
            Array.isArray(finalResult.toolCalls) &&
            finalResult.toolCalls.length > 0
          ) {
            onToolCalls?.(finalResult.toolCalls as DeepSeekToolCall[]);
          }
          const finalContent =
            typeof finalResult === 'string'
              ? finalResult
              : typeof finalResult?.content === 'string'
                ? finalResult.content
                : '';
          return stripDeepSeekSafetyTags(finalContent || accumulated);
        } finally {
          if (signal) {
            signal.removeEventListener('abort', abortHandler);
          }
          if (unlisten) {
            unlisten();
          }
        }
      }

      // Browser / Vite Dev Middleware SSE transport
      const response = await fetchImpl('/__deplyzeview_ai_quant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          model: DEEPSEEK_MODEL_ID,
          messages,
          temperature,
          maxTokens,
          tools,
        }),
        signal,
      });

      if (!response.ok) {
        let errorMsg = `DeepSeek request failed with status ${response.status}`;
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson?.error) errorMsg = errJson.error;
        } catch {
          /* ignore */
        }
        throw new Error(errorMsg);
      }

      if (!response.body) {
        throw new Error('Streaming response body is unavailable.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let collectedToolCalls: DeepSeekToolCall[] = [];

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const newlineIdx = buffer.indexOf('\n');
            if (newlineIdx < 0) break;
            const rawLine = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);

            if (!rawLine || !rawLine.startsWith('data:')) continue;
            const dataStr = rawLine.slice(5).trim();
            if (!dataStr || dataStr === '[DONE]') continue;

            let parsed: {
              type?: string;
              eventType?: string;
              delta?: string;
              content?: string;
              toolCalls?: DeepSeekToolCall[];
              error?: string;
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{
                    index?: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
              }>;
            };
            try {
              parsed = JSON.parse(dataStr);
            } catch {
              continue;
            }

            const kind = parsed.type || parsed.eventType;
            if (kind === 'error') {
              throw new Error(parsed.error || 'DeepSeek stream error');
            }
            if (kind === 'delta' && typeof parsed.delta === 'string' && parsed.delta.length > 0) {
              accumulated += parsed.delta;
              onDelta?.(parsed.delta, stripDeepSeekSafetyTags(accumulated));
            }
            if (kind === 'done') {
              if (typeof parsed.content === 'string' && !accumulated) {
                accumulated = parsed.content;
              }
              if (Array.isArray(parsed.toolCalls) && parsed.toolCalls.length > 0) {
                collectedToolCalls = parsed.toolCalls;
              }
            }
            // Also support direct OpenAI-style SSE chunks if gateway streams them directly
            const choiceDelta = parsed.choices?.[0]?.delta;
            if (choiceDelta) {
              if (typeof choiceDelta.content === 'string' && choiceDelta.content.length > 0) {
                accumulated += choiceDelta.content;
                onDelta?.(choiceDelta.content, stripDeepSeekSafetyTags(accumulated));
              }
              if (Array.isArray(choiceDelta.tool_calls)) {
                for (const tc of choiceDelta.tool_calls) {
                  const idx = Number(tc.index ?? 0);
                  while (collectedToolCalls.length <= idx) {
                    collectedToolCalls.push({
                      id: '',
                      type: 'function',
                      function: { name: '', arguments: '' },
                    });
                  }
                  if (tc.id) collectedToolCalls[idx].id = tc.id;
                  if (tc.function?.name) collectedToolCalls[idx].function.name += tc.function.name;
                  if (tc.function?.arguments) {
                    collectedToolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      if (collectedToolCalls.length > 0) {
        onToolCalls?.(collectedToolCalls);
      }

      return stripDeepSeekSafetyTags(accumulated);
    },

    async cancelCompletion(requestId: string): Promise<void> {
      if (isTauriRuntime()) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('cancel_ai_quant_stream', { requestId });
        return;
      }
      await fetchImpl('/__deplyzeview_ai_quant/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      }).catch(() => {});
    },
  };
}
