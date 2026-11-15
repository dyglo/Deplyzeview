import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PineEngine } from '@luxalgo/vela-pinets';
import { register as registerTs } from 'node:module';

// Register a minimal TypeScript strip loader if running .ts imports directly, or import via Vite/TS modules
import {
   parseDotEnvText,
  validateDeepSeekBaseUrl,
  validateDeepSeekModel,
  resolveDeepSeekServerConfig,
  redactSecrets,
  validateServerMessages,
  createAiQuantMiddleware,
} from './ai-quant/deepseek-server.mjs';

const VALID_V6_ASIA_SWEEP = `//@version=6
indicator("Asia Session Liquidity Sweep", overlay=true, max_boxes_count=200, max_lines_count=200, max_labels_count=200)
showAsia = input.bool(true, "Show Asia Session")
lookback = input.int(12, "Session Lookback", minval=2, maxval=100)
asiaHigh = ta.highest(high, lookback)
asiaLow = ta.lowest(low, lookback)
bullSweep = low < asiaLow[1] and close > asiaLow[1]
bearSweep = high > asiaHigh[1] and close < asiaHigh[1]
plot(showAsia ? asiaHigh : na, "Asia High", color=color.new(color.aqua, 20), linewidth=2)
plot(showAsia ? asiaLow : na, "Asia Low", color=color.new(color.teal, 20), linewidth=2)
if bullSweep and showAsia
    label.new(bar_index, low, "Bull Sweep", style=label.style_label_up, color=color.green, textcolor=color.white)
if bearSweep and showAsia
    label.new(bar_index, high, "Bear Sweep", style=label.style_label_down, color=color.red, textcolor=color.white)
`;

const VALID_V6_ASIA_LONDON_SWEEP = `//@version=6
indicator("Asia & London Liquidity Sweep", overlay=true, max_boxes_count=200, max_lines_count=200, max_labels_count=200)
showAsia = input.bool(true, "Show Asia Session")
showLondon = input.bool(true, "Show London Session")
lookback = input.int(12, "Asia Lookback", minval=2, maxval=100)
londonLookback = input.int(8, "London Lookback", minval=2, maxval=100)
asiaHigh = ta.highest(high, lookback)
asiaLow = ta.lowest(low, lookback)
londonHigh = ta.highest(high, londonLookback)
londonLow = ta.lowest(low, londonLookback)
bullSweep = (low < asiaLow[1] and close > asiaLow[1]) or (showLondon and low < londonLow[1] and close > londonLow[1])
bearSweep = (high > asiaHigh[1] and close < asiaHigh[1]) or (showLondon and high > londonHigh[1] and close < londonHigh[1])
plot(showAsia ? asiaHigh : na, "Asia High", color=color.new(color.aqua, 20), linewidth=2)
plot(showAsia ? asiaLow : na, "Asia Low", color=color.new(color.teal, 20), linewidth=2)
plot(showLondon ? londonHigh : na, "London High", color=color.new(color.orange, 20), linewidth=1)
plot(showLondon ? londonLow : na, "London Low", color=color.new(color.yellow, 20), linewidth=1)
if bullSweep
    label.new(bar_index, low, "Bullish Sweep", style=label.style_label_up, color=color.green, textcolor=color.white)
if bearSweep
    label.new(bar_index, high, "Bearish Sweep", style=label.style_label_down, color=color.red, textcolor=color.white)
`;

const VALID_V5_INDICATOR = `//@version=5
indicator("Institutional EMA Ribbon v5", overlay=true)
fastLen = input.int(9, "Fast EMA")
slowLen = input.int(21, "Slow EMA")
fastEma = ta.ema(close, fastLen)
slowEma = ta.ema(close, slowLen)
plot(fastEma, "Fast EMA", color=color.blue, linewidth=2)
plot(slowEma, "Slow EMA", color=color.purple, linewidth=2)
`;

const BROKEN_COMPILE_PINE = `//@version=6
indicator("Broken Script", overlay=true)
x = (close + open
plot(x)
`;

const EMPTY_VISUAL_PINE = `//@version=6
indicator("Silent Script", overlay=true)
val = ta.sma(close, 14)
`;

// Helper to import TypeScript modules using Vite's SSR/module loader or ts strip
let tsModulesPromise = null;
async function loadAiQuantModules() {
  if (!tsModulesPromise) {
    tsModulesPromise = (async () => {
      const { createServer } = await import('vite');
      const server = await createServer({
        configFile: false,
        logLevel: 'silent',
        server: { middlewareMode: true, hmr: false, watch: null },
      });
      try {
        const imageValidation = await server.ssrLoadModule('/src/ai-quant/image-validation.ts');
        const deepseekClient = await server.ssrLoadModule('/src/ai-quant/deepseek-client.ts');
        const compilerPipeline = await server.ssrLoadModule('/src/ai-quant/compiler-pipeline.ts');
        const store = await server.ssrLoadModule('/src/ai-quant/store.ts');
        const pineHighlight = await server.ssrLoadModule('/src/ai-quant/pine-highlight.ts');
        await server.close();
        return { imageValidation, deepseekClient, compilerPipeline, store, pineHighlight, close: async () => {} };
      } catch (err) {
        await server.close();
        throw err;
      }
    })();
  }
  return tsModulesPromise;
}

function createMockChart({ initialSymbol = 'BINANCE:BTCUSDT', initialTimeframe = '15m' } = {}) {
  const handles = [];
  const engine = new PineEngine();
  const state = {
    symbol: initialSymbol,
    timeframe: initialTimeframe,
    theme: 'dark',
    layout: '1',
    updateCodeCalls: 0,
    runIndicatorCalls: 0,
  };

  return {
    state,
    indicators() {
      return [...handles];
    },
    async runIndicator(source, opts) {
      state.runIndicatorCalls += 1;
      const prepared = await engine.prepare(source, opts.id);
      const handle = {
        id: opts.id,
        source,
        visible: true,
        prepared,
        setVisible(v) {
          this.visible = Boolean(v);
        },
        async updateCode(nextSource) {
          state.updateCodeCalls += 1;
          try {
            const nextPrepared = await engine.prepare(nextSource, opts.id);
            this.source = nextSource;
            this.prepared = nextPrepared;
            return { ok: true, handle: this };
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
          }
        },
        remove() {
          const idx = handles.indexOf(this);
          if (idx >= 0) handles.splice(idx, 1);
        },
      };
      handles.push(handle);
      return { ok: true, handle };
    },
  };
}

test('1. Sparkles icon entry point and panel integration in App.svelte and AiQuant.svelte', async () => {
  const appSource = await readFile(new URL('./App.svelte', import.meta.url), 'utf8');
  const aiQuantSource = await readFile(new URL('./AiQuant.svelte', import.meta.url), 'utf8');

  // Verify existing Sparkles icon in workspace-rail is wired to AI Quant
  assert.match(appSource, /title="AI Quant"[\s\S]*?onclick=\{toggleAiQuant\}><Sparkles size=\{18\}\/><\/button>/);
  assert.ok(!appSource.includes('Hotlists (coming soon)'), 'Sparkles button must be titled AI Quant, not Hotlists');
  assert.match(appSource, /<AiQuant\s+chart=\{vela\}/);

  // Verify all 9 required panel features + DeplyzeView logo + syntax highlighter + pipeline stepper exist in AiQuant.svelte
  assert.match(aiQuantSource, /class="aq-conversation"/, '1. AI conversation area');
  assert.match(aiQuantSource, /class="aq-textarea"/, '2. Text prompt input');
  assert.match(aiQuantSource, /accept="image\/jpeg,image\/png,image\/gif,image\/webp"/, '3. Image attachment button');
  assert.match(aiQuantSource, /class="aq-preview-strip"/, '4. Image preview and removal');
  assert.match(aiQuantSource, /class="aq-send-btn"/, '5. Send button');
  assert.match(aiQuantSource, /class="aq-live-status aq-lux-card"/, '6. Generation and execution status');
  assert.match(aiQuantSource, /class="aq-stream-snippet"/, '7. Streaming agent responses');
  assert.match(aiQuantSource, /aria-label="Indicator Version History"/, '8. Indicator development history');
  assert.match(aiQuantSource, /aria-label="Compact Code Inspection"/, '9. Compact code inspection integrated with PineEditor');
  assert.match(aiQuantSource, /import appIcon from '\.\.\/src-tauri\/icons\/icon\.png'/, 'DeplyzeView logo import');
  assert.match(aiQuantSource, /class="aq-hero-logo"/, 'DeplyzeView hero logo rendered');
  assert.match(aiQuantSource, /class="aq-lux-plan-stage"/, 'LuxAlgo-style Plan/Thinking card stage');
  assert.match(aiQuantSource, /class="aq-lux-card-footer"/, 'LuxAlgo-style footer with glowing orb and timer');
  assert.match(aiQuantSource, /class="aq-repair-timeline"/, 'Clean self-repair banner UX');
  assert.match(aiQuantSource, /highlightPineSourceLines/, 'Syntax-highlighted Pine code viewer');

  const { pineHighlight } = await loadAiQuantModules();
  const highlighted = pineHighlight.highlightPineSourceLines(VALID_V6_ASIA_SWEEP);
  assert.ok(highlighted.lines.length >= 10);
  assert.match(highlighted.lines[0].html, /ph-directive/);
  assert.match(highlighted.lines[1].html, /ph-builtin/);
  const followUps = pineHighlight.generateContextualFollowUps(VALID_V6_ASIA_SWEEP, 'Asia Session Liquidity Sweep');
  assert.equal(followUps.length, 3);
});

test('2. Text-only request: autonomous generation, Pine v6 compilation, execution, and chart installation', async () => {
  const { compilerPipeline } = await loadAiQuantModules();
  const chart = createMockChart();
  const capturedRequests = [];
  const stages = [];

  const transport = {
    async getStatus() {
      return { configured: true, model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
    },
    async streamCompletion(opts) {
      capturedRequests.push(opts);
      opts.onDelta?.('Generating indicator...\n', 'Generating indicator...\n');
      return `Your Asia Session Liquidity Sweep indicator has been created, validated and added to your chart.\n\`\`\`pine\n${VALID_V6_ASIA_SWEEP}\n\`\`\``;
    },
    async cancelCompletion() {},
  };

  const result = await compilerPipeline.runAutonomousPipeline({
    indicatorId: 'test-asia-1',
    prompt: 'Build a liquidity sweep indicator with Asia session highs and lows.',
    chart,
    transport,
    onProgress: (ev) => stages.push(ev.stage),
  });

  assert.equal(result.ok, true);
  assert.equal(result.pineVersion, 6);
  assert.equal(result.installedOnChart, true);
  assert.equal(result.updatedExistingInstance, false);
  assert.equal(result.repairAttemptsUsed, 0);
  assert.equal(chart.indicators().length, 1);
  assert.equal(chart.indicators()[0].id, 'pine:test-asia-1');
  assert.ok(stages.includes('understand'));
  assert.ok(stages.includes('generate'));
  assert.ok(stages.includes('validate'));
  assert.ok(stages.includes('compile'));
  assert.ok(stages.includes('execute'));
  assert.ok(stages.includes('install'));
  assert.ok(stages.includes('complete'));
  assert.equal(typeof capturedRequests[0].messages.at(-1).content, 'string');
});

test('3. Image-only request: multimodal vision payload and autonomous indicator build', async () => {
  const { imageValidation, compilerPipeline } = await loadAiQuantModules();
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  const attachment = imageValidation.validateAndEncodeImage('chart-zones.png', pngBytes, 'image/png', 0);
  const chart = createMockChart();
  let sentMessages = null;

  const transport = {
    async getStatus() {
      return { configured: true, model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
    },
    async streamCompletion(opts) {
      sentMessages = opts.messages;
      return `\`\`\`pine\n${VALID_V6_ASIA_SWEEP}\n\`\`\``;
    },
    async cancelCompletion() {},
  };

  const result = await compilerPipeline.runAutonomousPipeline({
    indicatorId: 'test-img-only',
    prompt: '',
    images: [attachment],
    chart,
    transport,
  });

  assert.equal(result.ok, true);
  assert.equal(result.installedOnChart, true);
  const userMsg = sentMessages.find((m) => m.role === 'user');
  assert.ok(Array.isArray(userMsg.content));
  assert.equal(userMsg.content[0].type, 'text');
  assert.match(userMsg.content[0].text, /Visual Reference Indicator Request/);
  assert.equal(userMsg.content[1].type, 'image_url');
  assert.ok(userMsg.content[1].image_url.url.startsWith('data:image/png;base64,'));
});

test('4 & 5. Combined text + multiple reference images (JPEG, PNG, GIF, WebP) and magic-byte validation', async () => {
  const { imageValidation, deepseekClient } = await loadAiQuantModules();

  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00]);
  const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

  const img1 = imageValidation.validateAndEncodeImage('ref1.jpg', jpegBytes, 'image/jpeg', 0);
  const img2 = imageValidation.validateAndEncodeImage('ref2.png', pngBytes, 'image/png', 1);
  const img3 = imageValidation.validateAndEncodeImage('ref3.gif', gifBytes, 'image/gif', 2);
  const img4 = imageValidation.validateAndEncodeImage('ref4.webp', webpBytes, 'image/webp', 3);

  assert.equal(img1.mimeType, 'image/jpeg');
  assert.equal(img2.mimeType, 'image/png');
  assert.equal(img3.mimeType, 'image/gif');
  assert.equal(img4.mimeType, 'image/webp');

  // 5th image should be rejected
  assert.throws(
    () => imageValidation.validateAndEncodeImage('ref5.png', pngBytes, 'image/png', 4),
    /up to 4 reference images/,
  );

  // Invalid magic bytes should be rejected
  assert.throws(
    () => imageValidation.validateAndEncodeImage('bad.bmp', new Uint8Array(16), 'image/bmp', 0),
    /Unsupported image format/,
  );

  const messages = deepseekClient.buildGenerationMessages({
    prompt: 'Combine the zone styling from ref1 and the session labels from ref2-ref4.',
    images: [img1, img2, img3, img4],
  });

  const userMsg = messages.at(-1);
  assert.equal(userMsg.role, 'user');
  assert.equal(userMsg.content.length, 5); // 1 text + 4 image_url parts
  assert.equal(userMsg.content.filter((p) => p.type === 'image_url').length, 4);
  // Server validator accepts the multimodal payload
  assert.doesNotThrow(() => validateServerMessages(messages));
});

test('6 & 7. Pine v5 and Pine v6 generation, compilation, and execution on DeplyzeView PineEngine', async () => {
  const { compilerPipeline, deepseekClient } = await loadAiQuantModules();

  // Pine v5 detection and execution
  assert.equal(deepseekClient.detectRequestedPineVersion('Build a Pine Script v5 EMA ribbon'), 5);
  const v5Diag = await compilerPipeline.validateCompileAndExecutePine(VALID_V5_INDICATOR, {
    expectedVersion: 5,
  });
  assert.equal(v5Diag.visualSummary.seriesCount, 2);
  assert.ok(v5Diag.visualSummary.finiteSeriesPoints > 100);
  assert.equal(v5Diag.historicalConsistencyVerified, true);

  // Pine v6 supply & demand zone indicator from testdata
  const srV6Source = await readFile(new URL('./testdata/sr-supply-demand-v6.pine', import.meta.url), 'utf8');
  const v6Diag = await compilerPipeline.validateCompileAndExecutePine(srV6Source, {
    expectedVersion: 6,
  });
  assert.ok(v6Diag.visualSummary.boxesCount > 0);
});

test('8. Compilation errors trigger automatic Stage 5 repair and succeed', async () => {
  const { compilerPipeline } = await loadAiQuantModules();
  const chart = createMockChart();
  let callCount = 0;

  const transport = {
    async getStatus() {
      return { configured: true, model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
    },
    async streamCompletion(opts) {
      callCount += 1;
      if (callCount === 1) {
        // First response has a syntax error
        return `\`\`\`pine\n${BROKEN_COMPILE_PINE}\n\`\`\``;
      }
      // Verify repair prompt contains the actual compiler error and broken source
      const repairPromptText = opts.messages.at(-1).content;
      assert.match(repairPromptText, /AUTONOMOUS SELF-REPAIR — ATTEMPT 1 OF 5/);
      assert.match(repairPromptText, /Stage 3 \(Compile\)/);
      return `\`\`\`pine\n${VALID_V6_ASIA_SWEEP}\n\`\`\``;
    },
    async cancelCompletion() {},
  };

  const result = await compilerPipeline.runAutonomousPipeline({
    indicatorId: 'repair-compile-test',
    prompt: 'Build an Asia session sweep indicator.',
    chart,
    transport,
  });

  assert.equal(result.ok, true);
  assert.equal(result.repairAttemptsUsed, 1);
  assert.equal(result.repairHistory.length, 1);
  assert.equal(result.repairHistory[0].stage, 'compile');
  assert.equal(result.installedOnChart, true);
  assert.equal(chart.indicators().length, 1);
});

test('9. Logical/runtime errors trigger automatic repair, and 5 failed attempts preserve previous working version', async () => {
  const { compilerPipeline } = await loadAiQuantModules();
  const chart = createMockChart();

  // Case A: Script compiles but produces zero visual output -> repaired on attempt 1
  let callsA = 0;
  const resultA = await compilerPipeline.runAutonomousPipeline({
    indicatorId: 'repair-logical-test',
    prompt: 'Plot moving average',
    chart,
    transport: {
      async getStatus() {
        return { configured: true, model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
      },
      async streamCompletion() {
        callsA += 1;
        return callsA === 1
          ? `\`\`\`pine\n${EMPTY_VISUAL_PINE}\n\`\`\``
          : `\`\`\`pine\n${VALID_V6_ASIA_SWEEP}\n\`\`\``;
      },
      async cancelCompletion() {},
    },
  });
  assert.equal(resultA.ok, true);
  assert.equal(resultA.repairAttemptsUsed, 1);
  assert.equal(resultA.repairHistory[0].stage, 'execute');

  // Case B: All 5 repair attempts fail during refinement -> previous working version is retained on chart
  let callsB = 0;
  const resultB = await compilerPipeline.runAutonomousPipeline({
    indicatorId: 'repair-logical-test',
    prompt: 'Add broken feature',
    existingIndicator: {
      name: 'Asia Session Liquidity Sweep',
      source: VALID_V6_ASIA_SWEEP,
      pineVersion: 6,
      originalRequirements: 'Asia session sweep indicator',
    },
    chart,
    transport: {
      async getStatus() {
        return { configured: true, model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
      },
      async streamCompletion() {
        callsB += 1;
        return `\`\`\`pine\n${BROKEN_COMPILE_PINE}\n\`\`\``;
      },
      async cancelCompletion() {},
    },
  });

  assert.equal(callsB, 6); // 1 initial + 5 repairs
  assert.equal(resultB.ok, false);
  assert.equal(resultB.repairAttemptsUsed, 5);
  assert.equal(resultB.preservedPreviousVersion, true);
  assert.equal(resultB.source.trim(), VALID_V6_ASIA_SWEEP.trim());
  assert.match(resultB.error, /Unable to resolve error after 5 automatic repair attempts/);
  // Existing chart instance still holds the working source
  assert.equal(chart.indicators().find((h) => h.id === 'pine:repair-logical-test').source.trim(), VALID_V6_ASIA_SWEEP.trim());
});

test('10, 11, 12 & 13. Continuous conversational refinement, in-place chart update without duplicates, and version restoration', async () => {
  const { compilerPipeline, store } = await loadAiQuantModules();
  const chart = createMockChart({ initialSymbol: 'OANDA:XAUUSD', initialTimeframe: '1h' });
  let savedLibrary = [];
  let session = store.createEmptySession('New Indicator');

  // Initial Request (v1)
  const build1 = await compilerPipeline.runAutonomousPipeline({
    indicatorId: session.id,
    prompt: 'Build a liquidity sweep indicator with Asia session highs and lows.',
    chart,
    transport: {
      async getStatus() {
        return { configured: true, model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
      },
      async streamCompletion() {
        return `\`\`\`pine\n${VALID_V6_ASIA_SWEEP}\n\`\`\``;
      },
      async cancelCompletion() {},
    },
  });

  assert.equal(build1.ok, true);
  assert.equal(build1.installedOnChart, true);
  assert.equal(build1.updatedExistingInstance, false);
  assert.equal(chart.indicators().length, 1);

  const rec1 = store.recordSuccessfulBuild(session, {
    userPrompt: 'Build a liquidity sweep indicator with Asia session highs and lows.',
    indicatorName: build1.name,
    pineVersion: build1.pineVersion,
    source: build1.source,
    completionMessage: build1.completionMessage,
    repairAttemptsUsed: build1.repairAttemptsUsed,
  });
  session = rec1.updatedSession;
  savedLibrary = store.upsertSavedScriptInList(savedLibrary, rec1.savedScript);
  assert.equal(session.versions.length, 1);
  assert.equal(session.versions[0].versionNumber, 1);

  // Refinement Request (v2): Add London session detection
  let refinementMessages = null;
  const build2 = await compilerPipeline.runAutonomousPipeline({
    indicatorId: session.id,
    prompt: 'Add London session detection and distinguish bullish and bearish sweeps.',
    existingIndicator: {
      name: session.name,
      source: session.currentSource,
      pineVersion: session.pineVersion,
      originalRequirements: session.originalRequirements,
    },
    conversationHistory: session.messages.map((m) => ({ role: m.role, text: m.text })),
    chart,
    transport: {
      async getStatus() {
        return { configured: true, model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
      },
      async streamCompletion(opts) {
        refinementMessages = opts.messages;
        return `\`\`\`pine\n${VALID_V6_ASIA_LONDON_SWEEP}\n\`\`\``;
      },
      async cancelCompletion() {},
    },
  });

  assert.equal(build2.ok, true);
  assert.equal(build2.installedOnChart, true);
  assert.equal(build2.updatedExistingInstance, true, 'Must update existing chart instance in-place');
  assert.equal(chart.indicators().length, 1, 'Must never create duplicate indicator instances');
  assert.equal(chart.state.updateCodeCalls, 1);
  // Chart symbol, timeframe, appearance, and layout preserved
  assert.equal(chart.state.symbol, 'OANDA:XAUUSD');
  assert.equal(chart.state.timeframe, '1h');
  assert.equal(chart.state.theme, 'dark');
  assert.equal(chart.state.layout, '1');
  // Refinement prompt included existing source
  assert.match(refinementMessages.at(-1).content, /REFINEMENT MODE — MODIFY EXISTING INDICATOR/);
  assert.match(refinementMessages.at(-1).content, /showAsia = input\.bool/);

  const rec2 = store.recordSuccessfulBuild(session, {
    userPrompt: 'Add London session detection and distinguish bullish and bearish sweeps.',
    indicatorName: build2.name,
    pineVersion: build2.pineVersion,
    source: build2.source,
    completionMessage: build2.completionMessage,
    repairAttemptsUsed: build2.repairAttemptsUsed,
  });
  session = rec2.updatedSession;
  savedLibrary = store.upsertSavedScriptInList(savedLibrary, rec2.savedScript);
  assert.equal(session.versions.length, 2);
  assert.equal(session.versions[1].versionNumber, 2);
  assert.equal(savedLibrary.length, 1, 'Library entry updated in-place without duplicates');

  // Restore Version 1
  const v1Id = session.versions[0].id;
  const restored = await store.restoreSessionVersion(session, v1Id, { chart });
  session = restored.updatedSession;
  assert.equal(session.activeVersionId, v1Id);
  assert.equal(session.currentSource.trim(), VALID_V6_ASIA_SWEEP.trim());
  assert.equal(chart.indicators()[0].source.trim(), VALID_V6_ASIA_SWEEP.trim());
});

test('14. DeepSeek API configuration, credential security, redaction, and SSE server middleware', async () => {
  const envExample = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.match(envExample, /^DEEPSEEK_API_KEY=/m);
  assert.match(envExample, /^DEEPSEEK_BASE_URL=https:\/\/api\.deepseek\.com/m);
  assert.match(envExample, /^DEEPSEEK_MODEL=deepseek-flash/m);

  // Missing API key throws clear configuration message
  assert.throws(
    () => resolveDeepSeekServerConfig({ env: {}, dotenvPath: '' }),
    /DeepSeek API key is not configured/,
  );

  // Non-DeepSeek-Flash model is rejected
  assert.throws(
    () => validateDeepSeekModel('gpt-4o'),
    /AI Quant exclusively uses deepseek-flash/,
  );

  // Insecure non-loopback HTTP URL is rejected
  assert.throws(
    () => validateDeepSeekBaseUrl('http://api.deepseek.com'),
    /requires HTTPS/,
  );

  // Secret redaction scrubs API keys and Bearer tokens
  const secret = 'sk-deepseek-super-secret-999';
  const redacted = redactSecrets(`Error calling https://api.deepseek.com with key ${secret} and Bearer ${secret}`, secret);
  assert.ok(!redacted.includes(secret));
  assert.match(redacted, /\[REDACTED\]/);

  // Parse .env text
  const parsedEnv = parseDotEnvText('DEEPSEEK_API_KEY="sk-test-123"\nDEEPSEEK_MODEL=deepseek-flash\n');
  assert.equal(parsedEnv.DEEPSEEK_API_KEY, 'sk-test-123');
  assert.equal(parsedEnv.DEEPSEEK_MODEL, 'deepseek-flash');

  // Verify Tauri invoke in deepseek-client.ts passes top-level requestId & messages (not nested in request)
  const clientSrc = await readFile(new URL('./ai-quant/deepseek-client.ts', import.meta.url), 'utf8');
  assert.match(clientSrc, /'stream_ai_quant_completion',\s*\{\s*requestId,\s*messages,/);

  const { deepseekClient } = await loadAiQuantModules();
  assert.equal(
    deepseekClient.stripDeepSeekSafetyTags('Hello world<ds_safety>[用户未成年]否\n[分类]'),
    'Hello world',
  );
});

test('15. Live DeepSeek (deepseek-flash) SSE streaming with the full SMC indicator prompt & follow-up refinement', async (t) => {
  let cfg;
  try {
    cfg = resolveDeepSeekServerConfig();
  } catch {
    t.skip('DEEPSEEK_API_KEY not configured in .env');
    return;
  }

  const { compilerPipeline, deepseekClient } = await loadAiQuantModules();
  const chart = createMockChart({ initialSymbol: 'OANDA:XAUUSD', initialTimeframe: '15m' });

  const liveStreamingTransport = {
    async getStatus() {
      return { configured: true, model: cfg.model, baseUrl: cfg.baseUrl };
    },
    async streamCompletion({ messages, temperature = 0.2, onDelta }) {
      const endpoint = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const payload = {
        model: cfg.model,
        messages,
        stream: true,
        thinking: { type: 'disabled' },
        max_tokens: 8192,
        temperature,
      };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'Accept-Encoding': 'identity',
          'Connection': 'keep-alive',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`DeepSeek HTTP ${res.status}: ${await res.text()}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let sawDone = false;

      try {
        streamLoop: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newlineIdx;
          while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);
            if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
            const dataStr = line.slice(5).trim();
            if (dataStr === '[DONE]') {
              sawDone = true;
              break streamLoop;
            }
            try {
              const frame = JSON.parse(dataStr);
              const contentDelta = frame?.choices?.[0]?.delta?.content || '';
              if (contentDelta) {
                fullContent += contentDelta;
                onDelta?.(contentDelta, deepseekClient.stripDeepSeekSafetyTags(fullContent));
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch (readErr) {
        const fenceCount = (fullContent.match(/```/g) || []).length;
        const hasCompleteCode = sawDone || (fenceCount >= 2 && fullContent.includes('indicator('));
        if (!hasCompleteCode) {
          const fbRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Accept-Encoding': 'identity',
              'Authorization': `Bearer ${cfg.apiKey}`,
            },
            body: JSON.stringify({ ...payload, stream: false }),
          });
          if (!fbRes.ok) throw readErr;
          const fbJson = await fbRes.json();
          fullContent = fbJson?.choices?.[0]?.message?.content || '';
        }
      } finally {
        reader.releaseLock();
      }
      return deepseekClient.stripDeepSeekSafetyTags(fullContent);
    },
    async cancelCompletion() {},
  };

  // Step 1: Test the exact comprehensive SMC indicator prompt over live SSE streaming
  const smcPrompt =
    'Build a comprehensive Smart Money Concepts (SMC) indicator combining institutional Order Blocks with market structure analysis. Detect bullish and bearish BOS and CHOCH using confirmed swing points, identify the last opposing candle before each confirmed structural break as the Order Block, and draw dynamically extended supply and demand zones. Track fresh, mitigated, respected and invalidated blocks. Display internal and swing structure separately, with configurable visibility, colors, labels and zone settings. Include liquidity sweep detection around previous swing highs and lows. Ensure accurate historical detection, non-repainting confirmation and efficient chart rendering. Make the indicator suitable for M5, M15, H1 and H4 charts.';

  let streamedChunks = 0;
  const buildResult = await compilerPipeline.runAutonomousPipeline({
    indicatorId: 'live-smc-indicator',
    prompt: smcPrompt,
    chart,
    transport: liveStreamingTransport,
    onStreamDelta: () => {
      streamedChunks += 1;
    },
  });

  assert.equal(buildResult.ok, true, `Live SMC build failed: ${buildResult.error}`);
  assert.ok(streamedChunks > 5, `Expected multiple SSE stream chunks, got ${streamedChunks}`);
  assert.equal(buildResult.pineVersion, 6);
  assert.equal(buildResult.installedOnChart, true);
  assert.equal(buildResult.updatedExistingInstance, false);
  assert.equal(chart.indicators().length, 1);
  assert.equal(chart.indicators()[0].id, 'pine:live-smc-indicator');

  // Step 2: Send a follow-up continuation improvement and verify it refines the SMC indicator in-place
  const followUpPrompt =
    'Add an EMA 50 trend filter plot with a toggle input while keeping all existing BOS, CHOCH, Order Block zones, and liquidity sweep signals.';
  const refineResult = await compilerPipeline.runAutonomousPipeline({
    indicatorId: 'live-smc-indicator',
    prompt: followUpPrompt,
    existingIndicator: {
      name: buildResult.name,
      source: buildResult.source,
      pineVersion: buildResult.pineVersion,
      originalRequirements: smcPrompt,
    },
    conversationHistory: [
      { role: 'user', text: smcPrompt },
      { role: 'assistant', text: buildResult.completionMessage },
    ],
    chart,
    transport: liveStreamingTransport,
  });

  assert.equal(refineResult.ok, true, `Live follow-up refinement failed: ${refineResult.error}`);
  assert.equal(refineResult.installedOnChart, true);
  assert.equal(refineResult.updatedExistingInstance, true, 'Follow-up must update existing chart instance in-place');
  assert.equal(chart.indicators().length, 1, 'Chart must still have exactly 1 indicator instance');
  assert.match(refineResult.source, /ta\.ema/i, 'Refined SMC indicator must include EMA logic');
});
