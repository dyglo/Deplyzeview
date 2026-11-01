<script lang="ts">
  import type { AppTheme } from './chart-theme';
  import appIcon from '../src-tauri/icons/icon.png';
  import { defaultTimezone, timezoneChoices, formatClock } from './timezones';
  import { onMount } from 'svelte';
  import ChartAppearance from './ChartAppearance.svelte';
  import { chartStyles, isChartStyle, setPriceAppearance, type ChartStyleId } from './chart-styles';
  import { defaultExtras, readPreferences, writePreferences, type ChartExtras } from './chart-preferences';
  import { Vela, type ChartConfig, type DrawingTypeKey } from '@luxalgo/vela';
  import { RustMarketDataProvider } from './data-provider';
  import './footprint';
  import { setFootprintMode, setFootprintTicks, setFootprintUnit, type FootprintMode, type FootprintUnit, setTradeVenue, type TradeVenue, type FeedHealth, setFeedHealthSink } from './footprint';
  import { Activity, ArrowDown, ArrowLeftRight, ArrowUp, BarChart3, ChevronDown, ChevronRight, Crosshair, Eye, Minus, MoveUpRight, Pencil, Plus, Settings2, Square, Type, Undo2, Maximize2, CircleHelp, CandlestickChart, Grip, X, TrendingUp, SlidersHorizontal } from 'lucide-svelte';
  let chartHost: HTMLDivElement;
  let vela: Vela | undefined;
  let symbol = 'BTCUSDT';
  let venueId: TradeVenue = 'binance';
  let venueMenuOpen = false;
  let timeframe = '1h';
  let chartStyle: ChartStyleId = 'candles';
  let appearanceOpen = false;
  let appearance: ChartConfig | undefined;
  let defaultAppearance: ChartConfig;
  let appliedTheme: AppTheme = 'dark';
  let extras: ChartExtras = structuredClone(defaultExtras);
  let persistenceError = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let venue = 'BINANCE · SPOT';
  let symbolDraft = symbol;
  let marketMenuOpen = false;
  let styleMenuOpen = false;
  let settingsOpen = false;
  let settingsDialogPosition: { left: number; top: number } | undefined;
  let settingsDialogDrag: { pointerId: number; startX: number; startY: number; left: number; top: number; dialog: HTMLDialogElement; container: HTMLElement } | undefined;
  let settingsTab = 'General';
  let toolActive = 'crosshair';
  let positionButton: 'long' | 'short' = 'long';
  let selectedDrawingIds: string[] = [];
  let selectedDrawingsVisible = true;
  let selectedDrawingsLocked = false;
  let canUndoDrawings = false;
  let canRedoDrawings = false;
  let status = 'Connecting · Binance Spot';
  let feedHealth: FeedHealth | undefined;
  setFeedHealthSink((next) => { feedHealth = next; status = next.status === 'live' ? `Live · ${venue}` : next.status === 'error' ? `Feed issue · ${venue}` : `${next.status} · ${venue}`; });
  let clock = new Date();
  let timezone = defaultTimezone;
  let footprintMode: FootprintMode = 'split';
  let footprintUnit: FootprintUnit = 'quote';
  let tickCount = 15;
  const tabs = ['General', 'Profile', 'Imbalance', 'Color', 'Advanced'];
  const modes: { id: FootprintMode; name: string; hint: string }[] = [
    { id: 'split', name: 'Split Bar', hint: 'Bid and ask volume side by side' },
    { id: 'delta', name: 'Delta', hint: 'Net aggressor volume per price level' },
    { id: 'total', name: 'Total Volume', hint: 'Combined traded volume per level' }
  ];
  const intervals = ['1m', '5m', '15m', '1h', '4h', '1D'];
  const tools = [
    { id: 'crosshair', title: 'Cursor', icon: Crosshair }, { id: 'trend', title: 'Trend line', icon: TrendingUp }, { id: 'ray', title: 'Ray', icon: MoveUpRight },
    { id: 'horizontal', title: 'Horizontal line', icon: Minus }, { id: 'rectangle', title: 'Rectangle', icon: Square }, { id: 'brush', title: 'Brush', icon: Pencil },
    { id: 'text', title: 'Text', icon: Type }, { id: 'measure', title: 'Measure', icon: ArrowLeftRight }, { id: 'long', title: 'Long position', icon: ArrowUp },
    { id: 'short', title: 'Short position', icon: ArrowDown }, { id: 'zoom', title: 'Magnifier', icon: Plus }, { id: 'visibility', title: 'Visibility', icon: Eye },
    { id: 'lock', title: 'Lock drawings', icon: Grip }
  ];
  onMount(() => {
    const chart = new Vela(chartHost, { symbol: chartSymbol(), timeframe: '60', bars: 500, live: true, theme: 'dark', upColor: '#8a746e', downColor: '#c16f61', currentPriceLine: true, volume: true, drawings: true, animations: { intro: false, zoom: true, pan: true } });
    vela = chart;
    chart.renderer.set({ settings: false, attribution: false });
    defaultAppearance = chart.renderer.getConfig() as ChartConfig;
    defaultAppearance.timeScale.timezone = defaultTimezone;
    defaultAppearance.layout.background = '#101114';
    defaultAppearance.layout.textColor = '#a3a5ab';
    defaultAppearance.grid.vertLines.color = '#25272d';
    defaultAppearance.grid.horzLines.color = '#25272d';
    chart.renderer.applyConfig(defaultAppearance);
    const saved = (() => { try { return readPreferences(window.localStorage); } catch { persistenceError = true; return undefined; } })();
    if (saved) { extras = saved.extras; chart.renderer.applyConfig(saved.config); }
    function syncAppearance() {
      appearance = chart.renderer.getConfig() as ChartConfig;
      timezone = appearance.timeScale.timezone;
      if (isChartStyle(appearance.series.style)) chartStyle = appearance.series.style;
      setPriceAppearance(appearance.candles);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveAppearance, 180);
    }
    syncAppearance();
    applyExtras(extras);
    const offConfig = chart.renderer.onConfigChanged(syncAppearance);
    const offStyle = chart.on('price-style:changed', syncAppearance);
    const syncVolume = () => {
      const volume = chart.indicators().find(indicator => indicator.nativeType === 'volume');
      if (volume) {
        const inputs = volume.inputValues();
        extras = { ...extras, volume: {
          visible: volume.visible,
          upColor: typeof inputs.upColor === 'string' ? inputs.upColor : extras.volume.upColor,
          downColor: typeof inputs.downColor === 'string' ? inputs.downColor : extras.volume.downColor,
          heightPct: typeof inputs.heightPct === 'number' ? inputs.heightPct : extras.volume.heightPct,
        } };
      } else extras = { ...extras, volume: { ...extras.volume, visible: false } };
      clearTimeout(saveTimer); saveTimer = setTimeout(saveAppearance, 180);
    };
    const offVolumeInputs = chart.on('indicator:inputs', syncVolume);
    const offVolumeVisibility = chart.on('indicator:visibility', syncVolume);
    const offVolumeRemoved = chart.on('indicator:removed', syncVolume);
    const flushPreferences = () => { clearTimeout(saveTimer); saveAppearance(); };
    window.addEventListener('pagehide', flushPreferences);
    chart.drawings.showToolbar(false);
    chart.data.registerProvider('binance', new RustMarketDataProvider('binance'));
    chart.data.registerProvider('coinbase', new RustMarketDataProvider('coinbase'));
    chart.data.registerProvider('hyperliquid', new RustMarketDataProvider('hyperliquid'));
    chart.ready().then(() => status = `Live · ${venue}`).catch(() => status = 'Unable to load market data');
    const syncHistory = () => { canUndoDrawings = chart.drawings.canUndo(); canRedoDrawings = chart.drawings.canRedo(); };
    const syncSelection = () => {
      const selected = chart.drawings.all().filter((drawing) => selectedDrawingIds.includes(drawing.id));
      selectedDrawingsVisible = selected.length > 0 && selected.every((drawing) => drawing.visible !== false);
      selectedDrawingsLocked = selected.length > 0 && selected.every((drawing) => drawing.locked === true);
      syncHistory();
    };
    const offDrawingTool = chart.on('drawing:tool', ({ type }) => { toolActive = toolbarIdForTool(type); syncHistory(); });
    const offDrawingMode = chart.on('drawing:mode', ({ mode }) => { toolActive = mode === 'measure' ? 'measure' : toolbarIdForTool(chart.drawings.getTool()); syncHistory(); });
    const offDrawingSelection = chart.on('drawing:selected', ({ ids }) => { selectedDrawingIds = ids; syncSelection(); });
    const offDrawingCreated = chart.on('drawing:created', syncSelection);
    const offDrawingEdited = chart.on('drawing:edited', syncSelection);
    const offDrawingRemoved = chart.on('drawing:removed', syncSelection);
    syncHistory();
    let removeFeedHealth: (() => void) | undefined;
    if ('__TAURI_INTERNALS__' in window) import('@tauri-apps/api/event').then(({ listen }) => listen<FeedHealth>('feed-health', (event) => { feedHealth = event.payload; status = event.payload.status === 'live' ? `Live · ${venue}` : `${event.payload.status} · ${venue}`; })).then((remove) => { removeFeedHealth = remove; });
    const timer = window.setInterval(() => clock = new Date(), 1000);
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(chartHost);
    return () => { flushPreferences(); window.removeEventListener('pagehide', flushPreferences); offConfig(); offStyle(); offVolumeInputs(); offVolumeVisibility(); offVolumeRemoved(); offDrawingTool(); offDrawingMode(); offDrawingSelection(); offDrawingCreated(); offDrawingEdited(); offDrawingRemoved(); removeFeedHealth?.(); clearInterval(timer); resize.disconnect(); chart.destroy(); };
  });
  // Share the chart overlay with the renderer's indicator legend. Measure the
  // symbol block so wrapping/resizing never requires a fixed indicator offset.
  function measureSymbolLegend(node: HTMLDivElement) {
    const area = node.closest<HTMLElement>('.chart-area');
    const update = () => area?.style.setProperty('--chart-symbol-height', `${node.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return { destroy() { observer.disconnect(); area?.style.removeProperty('--chart-symbol-height'); } };
  }
  function timeframeCode(value: string) { return value === '1D' ? '1D' : value === '1h' ? '60' : value === '4h' ? '240' : value.slice(0, -1); }
  function chooseTimeframe(value: string) {
    timeframe = value;
    void vela?.setMarket({ symbol: chartSymbol(), timeframe: timeframeCode(value) });
  }
  function chooseStyle(style: ChartStyleId) {
    if (!vela) return;
    chartStyle = style;
    styleMenuOpen = false;
    vela.renderer.applyConfig({ series: { style } });
  }
  function saveAppearance() {
    if (!vela) return;
    try { persistenceError = !writePreferences(window.localStorage, vela.renderer.getConfig() as ChartConfig, extras); }
    catch { persistenceError = true; }
  }
  function applyAppearance(patch: unknown) { vela?.renderer.applyConfig(patch); }
  function applyExtras(value: ChartExtras) {
    extras = value;
    if (!vela) return;
    if (appliedTheme !== value.theme) {
      // Theme the renderer's own menus/legends/drawing controls while retaining
      // the complete user configuration, including a custom plot background.
      const config = vela.renderer.getConfig();
      vela.setTheme(value.theme);
      vela.renderer.applyConfig(config);
      appliedTheme = value.theme;
    }
    const { visible, ...inputs } = extras.volume;
    const volume = vela.indicators().find(indicator => indicator.nativeType === 'volume') ?? vela.addNativeIndicator('volume');
    volume.setInputs(inputs);
    volume.setVisible(visible);
    vela.renderer.set('crosshairOverride', {
      vertical: extras.crosshair === 'both' || extras.crosshair === 'vertical',
      horizontal: extras.crosshair === 'both' || extras.crosshair === 'horizontal',
    });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAppearance, 180);
  }
  function resetAppearance() {
    const { stacking, series, ...defaults } = defaultAppearance;
    vela?.renderer.applyConfig({ ...defaults, series: { style: chartStyle, spacing: series.spacing } });
    applyExtras(structuredClone(defaultExtras));
  }
  function chooseMode(next: FootprintMode) { footprintMode = next; setFootprintMode(next); }
  function chooseUnit(next: FootprintUnit) { footprintUnit = next; setFootprintUnit(next); }
  function changeTicks(value: number) { tickCount = Math.max(1, Math.min(100, value || 1)); setFootprintTicks(tickCount); }
  function startSettingsDialogDrag(event: PointerEvent) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const titlebar = event.currentTarget as HTMLElement;
    const dialog = titlebar.closest('dialog');
    const container = dialog?.parentElement;
    if (!dialog || !container) return;
    const dialogRect = dialog.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const left = dialogRect.left - containerRect.left;
    const top = dialogRect.top - containerRect.top;
    settingsDialogPosition = { left, top };
    settingsDialogDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left, top, dialog, container };
    titlebar.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function moveSettingsDialog(event: PointerEvent) {
    const drag = settingsDialogDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const containerRect = drag.container.getBoundingClientRect();
    const dialogRect = drag.dialog.getBoundingClientRect();
    const maxLeft = Math.max(0, containerRect.width - dialogRect.width);
    const maxTop = Math.max(0, containerRect.height - dialogRect.height);
    settingsDialogPosition = {
      left: Math.max(0, Math.min(maxLeft, drag.left + event.clientX - drag.startX)),
      top: Math.max(0, Math.min(maxTop, drag.top + event.clientY - drag.startY)),
    };
  }
  function endSettingsDialogDrag(event: PointerEvent) {
    if (settingsDialogDrag?.pointerId !== event.pointerId) return;
    settingsDialogDrag = undefined;
  }
  function nudgeSettingsDialog(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest('button')) return;
    const offsets: Record<string, [number, number]> = { ArrowUp: [0, -12], ArrowDown: [0, 12], ArrowLeft: [-12, 0], ArrowRight: [12, 0] };
    const offset = offsets[event.key];
    if (!offset) return;
    const titlebar = event.currentTarget as HTMLElement;
    const dialog = titlebar.closest('dialog');
    const container = dialog?.parentElement;
    if (!dialog || !container) return;
    event.preventDefault();
    const dialogRect = dialog.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const current = settingsDialogPosition ?? { left: dialogRect.left - containerRect.left, top: dialogRect.top - containerRect.top };
    settingsDialogPosition = {
      left: Math.max(0, Math.min(Math.max(0, containerRect.width - dialogRect.width), current.left + offset[0])),
      top: Math.max(0, Math.min(Math.max(0, containerRect.height - dialogRect.height), current.top + offset[1])),
    };
  }
  function toolbarIdForTool(type: DrawingTypeKey | null): string {
    if (!type) return 'crosshair';
    if (type === 'position') return positionButton;
    const ids: Partial<Record<DrawingTypeKey, string>> = { trendline: 'trend', ray: 'ray', hline: 'horizontal', box: 'rectangle', freehand: 'brush', text: 'text', magnifier: 'zoom' };
    return ids[type] ?? 'crosshair';
  }
  function selectDrawingTool(id: string) {
    if (!vela) return;
    if (id === 'visibility' || id === 'lock') {
      const selected = vela.drawings.all().filter((drawing) => selectedDrawingIds.includes(drawing.id));
      if (selected.length === 0) return;
      if (id === 'visibility') {
        const visible = !selected.every((drawing) => drawing.visible !== false);
        for (const drawing of selected) vela.drawings.show(drawing.id, visible);
        selectedDrawingsVisible = visible;
      } else {
        const locked = !selected.every((drawing) => drawing.locked === true);
        for (const drawing of selected) vela.drawings.lock(drawing.id, locked);
        selectedDrawingsLocked = locked;
      }
      return;
    }
    if (id === 'measure') { vela.drawings.setMode('measure'); return; }
    if (id === 'long' || id === 'short') positionButton = id;
    const types: Record<string, DrawingTypeKey> = { trend: 'trendline', ray: 'ray', horizontal: 'hline', rectangle: 'box', brush: 'freehand', text: 'text', long: 'position', short: 'position', zoom: 'magnifier' };
    vela.drawings.setTool(types[id] ?? null);
  }
  function undoDrawing() { vela?.drawings.undo(); canUndoDrawings = vela?.drawings.canUndo() ?? false; canRedoDrawings = vela?.drawings.canRedo() ?? false; }
  function redoDrawing() { vela?.drawings.redo(); canUndoDrawings = vela?.drawings.canUndo() ?? false; canRedoDrawings = vela?.drawings.canRedo() ?? false; }
  function chartSymbol() { return `${venueId}:${symbol}`; }
  function normalizedSymbol(input: string, provider: TradeVenue) {
    const value = input.trim().toUpperCase();
    if (provider === 'binance') return value.replace(/[^A-Z0-9]/g, '');
    if (provider === 'coinbase') {
      const parts = value.replace(/[^A-Z0-9-]/g, '').split('-').filter(Boolean);
      if (parts.length > 1) return `${parts[0]}-${parts.slice(1).join('')}`;
      for (const quote of ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'BTC']) if (value.endsWith(quote) && value.length > quote.length) return `${value.slice(0, -quote.length)}-${quote}`;
      return `${value}-USD`;
    }
    return value.replace(/[^A-Z0-9:]/g, '').replace(/\.P$/, '');
  }
  function selectVenue(next: TradeVenue) {
    venueId = next;
    venue = next === 'binance' ? 'BINANCE · SPOT' : next === 'coinbase' ? 'COINBASE · EXCHANGE' : 'HYPERLIQUID · PERP';
    symbol = next === 'binance' ? 'BTCUSDT' : next === 'coinbase' ? 'BTC-USD' : 'BTC';
    setTradeVenue(next);
    status = `Live · ${venue}`;
    venueMenuOpen = false;
    if (vela) void vela.setMarket({ symbol: chartSymbol(), timeframe: timeframeCode(timeframe) });
  }
  function applySymbol() {
    const next = normalizedSymbol(symbolDraft, venueId);
    if (!next) return;
    symbol = next; marketMenuOpen = false; status = `Live · ${venue}`;
    if (vela) void vela.setMarket({ symbol: chartSymbol(), timeframe: timeframeCode(timeframe) });
  }
  function coverageText() {
    if (!feedHealth?.coverageStartMs || !feedHealth?.coverageEndMs) return 'Coverage not available yet';
    const fmt = (time: number) => new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone });
    return `Coverage ${fmt(feedHealth.coverageStartMs)}–${fmt(feedHealth.coverageEndMs)} ${timezone === defaultTimezone ? 'EAT (UTC+3)' : timezone}`;
  }
  function windowAction(action: 'minimize' | 'maximize' | 'close') {
    if (!(window as any).__TAURI_INTERNALS__) return;
    import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const current = getCurrentWindow();
      if (action === 'minimize') await current.minimize();
      if (action === 'maximize') await current.toggleMaximize();
      if (action === 'close') await current.close();
    });
  }
</script>
<svelte:window onkeydown={(event) => { if (event.key === 'Escape' && styleMenuOpen) { styleMenuOpen = false; document.querySelector<HTMLButtonElement>('.chart-style')?.focus(); } }} onclick={(event) => { if (!(event.target as Element).closest('.style-picker')) styleMenuOpen = false; }}/>
<svelte:head><title>DeplyzeView — {symbol}</title></svelte:head>
<div class="app-shell" data-theme={extras.theme}>
  <header class="titlebar" data-tauri-drag-region><div class="brand-mark" title="DeplyzeView"><img src={appIcon} alt="DeplyzeView" draggable="false"/></div><span class="brand-divider"></span><span class="workspace-label">Chart</span><div class="window-controls"><button aria-label="Minimize" onclick={() => windowAction('minimize')}><Minus size={12}/></button><button aria-label="Maximize" onclick={() => windowAction('maximize')}><Square size={10}/></button><button class="close" aria-label="Close" onclick={() => windowAction('close')}><X size={12}/></button></div></header>
  <nav class="topbar">
    <div class="market-selector"><button class="symbol-button" onclick={() => { marketMenuOpen = !marketMenuOpen; symbolDraft = symbol; }}><span class="exchange">{venue}</span><span class="symbol-line">{symbol}<ChevronDown size={11}/></span></button><button class="venue-trigger" aria-label="Choose venue" onclick={() => venueMenuOpen = !venueMenuOpen}><ChevronDown size={10}/></button>{#if venueMenuOpen}<div class="venue-popover"><span class="venue-heading">MARKET DATA PROVIDER</span><button class:venue-active={venueId === 'binance'} onclick={() => selectVenue('binance')}><span class="venue-symbol">B</span><span><strong>Binance</strong><small>Spot · USDT pairs</small></span>{#if venueId === 'binance'}<span class="venue-check">●</span>{/if}</button><button class:venue-active={venueId === 'coinbase'} onclick={() => selectVenue('coinbase')}><span class="venue-symbol coinbase-symbol">C</span><span><strong>Coinbase</strong><small>Exchange · USD pairs</small></span>{#if venueId === 'coinbase'}<span class="venue-check">●</span>{/if}</button><button class:venue-active={venueId === 'hyperliquid'} onclick={() => selectVenue('hyperliquid')}><span class="venue-symbol hyper-symbol">H</span><span><strong>Hyperliquid</strong><small>Perpetuals · USDC-margined</small></span>{#if venueId === 'hyperliquid'}<span class="venue-check">●</span>{/if}</button><div class="venue-disclaimer">Crypto feeds only in this build. FX, commodities, indices and dated futures need a selected data provider.</div></div>{/if}{#if marketMenuOpen}<div class="symbol-popover"><label for="symbol-input">Search market</label><input id="symbol-input" bind:value={symbolDraft} onkeydown={(e) => e.key === 'Enter' && applySymbol()}/><div class="search-hint">{venueId === 'coinbase' ? 'BTC-USD, ETH-USD, SOL-USD' : venueId === 'hyperliquid' ? 'BTC, ETH, SOL' : 'BTCUSDT, ETHUSDT, SOLUSDT'}</div><button class="apply-market" onclick={applySymbol}>Open market <ChevronRight size={13}/></button></div>{/if}</div>
    <div class="top-divider"></div><div class="timeframes">{#each intervals as interval}<button class:chosen={timeframe === interval} onclick={() => chooseTimeframe(interval)}>{interval}</button>{/each}<button class="more-time" aria-label="More intervals"><ChevronDown size={11}/></button></div>
    <div class="top-divider"></div><div class="style-picker"><button class="chart-style" aria-label="Chart style" aria-expanded={styleMenuOpen} class:style-selected={chartStyle !== 'candles'} onclick={() => styleMenuOpen = !styleMenuOpen} onkeydown={(e) => { if (e.key === 'Escape') styleMenuOpen = false; }}><CandlestickChart size={14}/><span>{chartStyles.find(style => style.id === chartStyle)?.label}</span><ChevronDown size={10}/></button>{#if styleMenuOpen}<div class="style-menu" role="group" aria-label="Chart styles">{#each chartStyles as style}<button class:menu-selected={chartStyle === style.id} aria-pressed={chartStyle === style.id} onclick={() => chooseStyle(style.id)}><CandlestickChart size={14}/>{style.label}{#if chartStyle === style.id}<span class="new-tag">SELECTED</span>{/if}</button>{/each}<div class="style-menu-note">Appearance controls in Chart settings</div></div>{/if}</div>
    <div class="top-spacer"></div><button class="top-action" onclick={() => { if (chartStyle === 'footprint') { appearanceOpen = false; settingsOpen = true; } else { settingsOpen = false; appearanceOpen = true; } }}><SlidersHorizontal size={13}/> {chartStyle === 'footprint' ? 'Footprint' : 'Indicators'}</button><button class="top-action"><ArrowLeftRight size={13}/> Alert</button><button class="top-action"><Eye size={13}/> View as</button><button class="top-icon" aria-label="Chart settings" onclick={() => { settingsOpen = false; appearanceOpen = !appearanceOpen; }}><Settings2 size={14}/></button>
  </nav>
  <main class="chart-layout"><aside class="drawing-toolbar" aria-label="Drawing tools">{#each tools as tool, index}{#if index === 1 || index === 4 || index === 6 || index === 8 || index === 10 || index === 12}<div class="tool-divider"></div>{/if}<button class:active-tool={toolActive === tool.id || (tool.id === 'visibility' && !selectedDrawingsVisible) || (tool.id === 'lock' && selectedDrawingsLocked)} disabled={(tool.id === 'visibility' || tool.id === 'lock') && selectedDrawingIds.length === 0} aria-pressed={toolActive === tool.id || (tool.id === 'visibility' && !selectedDrawingsVisible) || (tool.id === 'lock' && selectedDrawingsLocked)} aria-label={tool.title} title={tool.title} onclick={() => selectDrawingTool(tool.id)}><svelte:component this={tool.icon} size={14} strokeWidth={1.55}/></button>{/each}<div class="toolbar-bottom"><button aria-label="Undo drawing" title="Undo drawing" disabled={!canUndoDrawings} onclick={undoDrawing}><Undo2 size={14}/></button><button aria-label="Redo drawing" title="Redo drawing" disabled={!canRedoDrawings} onclick={redoDrawing}><Undo2 size={14} class="redo-icon"/></button></div></aside>
    <section class="chart-area"><div class="chart-legend" use:measureSymbolLegend><div class="legend-main"><span class="pair-name">{symbol}</span></div>{#if chartStyle === 'footprint'}<div class="legend-sub">Bid × Ask</div>{/if}</div><div class="chart-plot"><div bind:this={chartHost} class="vela-chart" aria-label="Live DeplyzeView market chart"></div></div><div class="chart-bottom-controls"><div class="chart-watermark" aria-label="DeplyzeView"><img src={appIcon} alt="" draggable="false"/><span>DeplyzeView</span></div><button class="reset-chart" aria-label="Fit all" title="Fit all" onclick={() => vela?.setVisibleRangePreset('ALL')}><Undo2 size={14}/></button></div>
      {#if appearanceOpen && appearance}<ChartAppearance config={appearance} {extras} {persistenceError} patch={applyAppearance} changeExtras={applyExtras} {chooseStyle} reset={resetAppearance} close={() => appearanceOpen = false}/>{/if}
      {#if settingsOpen}<div class="settings-scrim" role="presentation" onclick={() => settingsOpen = false}></div><dialog open class="settings-dialog" aria-modal="true" aria-labelledby="settings-title" style={settingsDialogPosition ? `left:${settingsDialogPosition.left}px;top:${settingsDialogPosition.top}px;transform:none` : undefined}><header class="dialog-titlebar" role="toolbar" aria-label="Move settings dialog" tabindex="0" onkeydown={nudgeSettingsDialog} onpointerdown={startSettingsDialogDrag} onpointermove={moveSettingsDialog} onpointerup={endSettingsDialogDrag} onpointercancel={endSettingsDialogDrag}><div><span class="dialog-kicker">CHART SETTINGS</span><h2 id="settings-title">Volume Footprint</h2></div><button class="dialog-close" aria-label="Close settings" onclick={() => settingsOpen = false}><X size={14}/></button></header><nav class="dialog-tabs">{#each tabs as tab}<button class:tab-active={settingsTab === tab} onclick={() => settingsTab = tab}>{tab}</button>{/each}</nav><div class="dialog-content"><div class="dialog-section-label">{settingsTab === 'General' ? 'GENERAL' : settingsTab.toUpperCase()}</div>{#if settingsTab === 'General'}<div class="setting-row"><div class="setting-name"><strong>Unit</strong><small>Volume denomination</small></div><div class="segmented"><button class:segment-active={footprintUnit === 'quote'} onclick={() => chooseUnit('quote')}>{feedHealth?.quoteCurrency ?? 'Quote'}</button><button class:segment-active={footprintUnit === 'coin'} onclick={() => chooseUnit('coin')}>Coin</button></div></div><div class="setting-row"><div class="setting-name"><strong>Ticks per bar</strong><small>Price levels per footprint row</small></div><div class="stepper"><button aria-label="Decrease ticks" onclick={() => changeTicks(tickCount - 1)}>−</button><input type="number" min="1" max="100" bind:value={tickCount} oninput={() => changeTicks(tickCount)}/><span>ticks</span><button aria-label="Increase ticks" onclick={() => changeTicks(tickCount + 1)}>+</button></div></div><div class="setting-row mode-row"><div class="setting-name"><strong>Display mode</strong><small>How trade volume is rendered</small></div><div class="mode-options">{#each modes as item}<button class:mode-active={footprintMode === item.id} onclick={() => chooseMode(item.id)}><span>{item.name}</span><small>{item.hint}</small>{#if footprintMode === item.id}<span class="selected-dot"></span>{/if}</button>{/each}</div></div><div class="data-note"><span class="live-indicator" class:health-error={feedHealth?.status === 'error' || (feedHealth?.gapsDetected ?? 0) > 0}></span><span><strong>{feedHealth?.status === 'live' ? 'Live trade feed' : feedHealth?.status === 'error' ? 'Feed needs attention' : 'Market data service'}</strong><small>{feedHealth ? `${feedHealth.tradesStored.toLocaleString()} stored trades · ${feedHealth.gapDetectionAvailable ? `${feedHealth.gapsDetected} gap(s)` : 'gap detection unavailable'}` : 'Waiting for Rust feed status…'}</small><small>{coverageText()}</small><small>{feedHealth?.historyNote ?? `${venue} public trade history`}</small>{#if feedHealth?.lastError}<small class="feed-error-text">{feedHealth.lastError}</small>{/if}</span></div>{:else}<div class="settings-placeholder"><div class="settings-placeholder-icon"><Settings2 size={17}/></div><strong>{settingsTab} settings</strong><span>Configure {settingsTab.toLowerCase()} visualization for the footprint chart.</span><div class="coming-chip">AVAILABLE IN THIS BUILD</div></div>{/if}</div><footer class="dialog-footer"><span class="footer-hint">Settings apply to the active chart</span><button class="done-button" onclick={() => settingsOpen = false}>Done</button></footer></dialog>{/if}
    </section>
  </main>
  <footer class="statusbar"><div class="range-options"><button onclick={() => vela?.setVisibleRangePreset('1D')}>1D</button><button onclick={() => vela?.setVisibleRangePreset('1W')}>1W</button><button onclick={() => vela?.setVisibleRangePreset('1M')}>1M</button><button onclick={() => vela?.setVisibleRangePreset('3M')}>3M</button><button onclick={() => vela?.setVisibleRangePreset('6M')}>6M</button><button onclick={() => vela?.setVisibleRangePreset('1Y')}>1Y</button><button onclick={() => vela?.setVisibleRangePreset('ALL')}>ALL</button><span class="status-divider"></span><button class="calendar-button"><BarChart3 size={12}/></button></div><div class="connection"><span class:connected={status.startsWith('Live')} class="connection-dot"></span>{status}</div><div class="clock">{formatClock(clock, timezone)}</div><select class="timezone-select" aria-label="Chart time zone" title="Chart and clock time zone" value={timezone} onchange={(event) => applyAppearance({ timeScale: { timezone: event.currentTarget.value } })}>{#each timezoneChoices(timezone) as zone}<option value={zone.value}>{zone.label}</option>{/each}</select><button class="fit-button"><Maximize2 size={12}/> Fit</button><button class="help-button"><CircleHelp size={13}/></button></footer>
</div>
