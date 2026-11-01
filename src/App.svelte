<script lang="ts">
  import { onMount } from 'svelte';
  import { type Vela, type DrawingTypeKey } from '@luxalgo/vela';
  import { VelaWorkspace } from '@luxalgo/vela/workspace';
  import ChartSettingsPanel from './ChartSettingsPanel.svelte';
  import { appearanceFromConfig, chartStyleFromRenderer, configPatch, resetAppearancePatch, VELA_DARK_DEFAULTS, type AppearanceKey, type ChartAppearance, type ChartStyle } from './chart-appearance';
  import { RustMarketDataProvider } from './data-provider';
  import './footprint';
  import { setFootprintMode, setFootprintTicks, setFootprintUnit, type FootprintMode, type FootprintUnit, setTradeVenue, type TradeVenue, type FeedHealth, setFeedHealthSink } from './footprint';
  import { Activity, ArrowDown, ArrowLeftRight, ArrowUp, BarChart3, ChevronDown, ChevronRight, Crosshair, Eye, Minus, MoveUpRight, Pencil, Plus, Settings2, Square, Type, Undo2, Maximize2, CircleHelp, CandlestickChart, Grip, X, TrendingUp, SlidersHorizontal } from 'lucide-svelte';
  let chartHost: HTMLDivElement;
  let vela: Vela | undefined;
  let workspace: VelaWorkspace | undefined;
  let symbol = 'BTCUSDT';
  let venueId: TradeVenue = 'binance';
  let venueMenuOpen = false;
  let timeframe = '1h';
  let chartStyle: ChartStyle = 'candles';
  let venue = 'BINANCE · SPOT';
  let symbolDraft = symbol;
  let marketMenuOpen = false;
  let styleMenuOpen = false;
  let settingsOpen = false;
  let settingsDialogPosition: { left: number; top: number } | undefined;
  let settingsDialogDrag: { pointerId: number; startX: number; startY: number; left: number; top: number; dialog: HTMLDialogElement; container: HTMLElement } | undefined;
  let settingsTab: 'Chart Style' | 'Symbol' | 'Canvas' | 'Scales' | 'Crosshair' | 'Volume' | 'Footprint' = 'Chart Style';
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
  let footprintMode: FootprintMode = 'split';
  let footprintUnit: FootprintUnit = 'quote';
  let tickCount = 15;
  let appearance: ChartAppearance = { ...VELA_DARK_DEFAULTS };
  let volumeVisible = true;
  const tabs = ['Chart Style', 'Symbol', 'Canvas', 'Scales', 'Crosshair', 'Volume', 'Footprint'] as const;
  const styleMenuItems: { id: ChartStyle; name: string; icon: typeof CandlestickChart }[] = [
    { id: 'candles', name: 'Candles', icon: CandlestickChart },
    { id: 'hollow', name: 'Hollow Candles', icon: CandlestickChart },
    { id: 'bars', name: 'Bars (OHLC)', icon: BarChart3 },
    { id: 'line', name: 'Line', icon: Activity },
    { id: 'area', name: 'Area', icon: Activity },
    { id: 'baseline', name: 'Baseline', icon: Minus },
    { id: 'heikinashi', name: 'Heikin Ashi', icon: CandlestickChart },
    { id: 'footprint', name: 'Volume Footprint', icon: BarChart3 },
  ];
  const intervals = ['1m', '5m', '15m', '1h', '4h', '1D'];
  const APP_PREFS_KEY = 'deplyzeview.chart-ui.v1';
  const tools = [
    { id: 'crosshair', title: 'Cursor', icon: Crosshair }, { id: 'trend', title: 'Trend line', icon: TrendingUp }, { id: 'ray', title: 'Ray', icon: MoveUpRight },
    { id: 'horizontal', title: 'Horizontal line', icon: Minus }, { id: 'rectangle', title: 'Rectangle', icon: Square }, { id: 'brush', title: 'Brush', icon: Pencil },
    { id: 'text', title: 'Text', icon: Type }, { id: 'measure', title: 'Measure', icon: ArrowLeftRight }, { id: 'long', title: 'Long position', icon: ArrowUp },
    { id: 'short', title: 'Short position', icon: ArrowDown }, { id: 'zoom', title: 'Magnifier', icon: Plus }, { id: 'visibility', title: 'Visibility', icon: Eye },
    { id: 'lock', title: 'Lock drawings', icon: Grip }
  ];
  onMount(() => {
    restoreAppPreferences();
    const chartWorkspace = new VelaWorkspace(chartHost, {
      layout: false,
      persist: 'deplyzeview.single-chart.v1',
      topbar: { left: [], right: [] },
      drawingToolbar: false,
      statusline: false,
      bottombar: false,
      watermark: true,
      symbol: chartSymbol(),
      timeframe: '60',
      bars: 500,
      live: true,
      theme: 'dark',
      upColor: '#8a746e',
      downColor: '#c16f61',
      currentPriceLine: true,
      volume: true,
      drawings: true,
      animations: { intro: false, zoom: true, pan: true },
      providers: {
        binance: () => new RustMarketDataProvider('binance'),
        coinbase: () => new RustMarketDataProvider('coinbase'),
        hyperliquid: () => new RustMarketDataProvider('hyperliquid'),
      },
    });
    workspace = chartWorkspace;
    const chart = chartWorkspace.chart;
    vela = chart;
    chart.drawings.showToolbar(false);
    syncWorkspaceControls();
    void chart.ready().then(() => {
      if (vela !== chart) return;
      syncWorkspaceControls();
      status = `Live · ${venue}`;
    }).catch(() => status = 'Unable to load market data');

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
    const offPriceStyle = chartWorkspace.on('cell:priceStyle', syncWorkspaceControls);
    const offAppearance = chart.renderer.onConfigChanged(syncWorkspaceControls);
    syncHistory();

    let removeFeedHealth: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => listen<FeedHealth>('feed-health', (event) => {
      feedHealth = event.payload;
      status = event.payload.status === 'live' ? `Live · ${venue}` : `${event.payload.status} · ${venue}`;
    })).then((remove) => { removeFeedHealth = remove; });
    const timer = window.setInterval(() => clock = new Date(), 1000);
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(chartHost);
    return () => {
      offDrawingTool(); offDrawingMode(); offDrawingSelection(); offDrawingCreated(); offDrawingEdited(); offDrawingRemoved();
      offPriceStyle(); offAppearance(); removeFeedHealth?.(); clearInterval(timer); resize.disconnect();
      chartWorkspace.destroy(); workspace = undefined; vela = undefined;
    };
  });
  function timeframeCode(value: string) { return value === '1D' ? '1D' : value === '1h' ? '60' : value === '4h' ? '240' : value.slice(0, -1); }
  function timeframeLabel(value: string) {
    const labels: Record<string, string> = { '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h', D: '1D', '1D': '1D' };
    return labels[value] ?? timeframe;
  }
  function isTradeVenue(value: string): value is TradeVenue { return value === 'binance' || value === 'coinbase' || value === 'hyperliquid'; }
  function venueLabel(value: TradeVenue) { return value === 'binance' ? 'BINANCE · SPOT' : value === 'coinbase' ? 'COINBASE · EXCHANGE' : 'HYPERLIQUID · PERP'; }
  function syncWorkspaceControls() {
    if (!workspace || !vela) return;
    const market = workspace.active.symbol;
    const colon = market.indexOf(':');
    if (colon > 0) {
      const provider = market.slice(0, colon).toLowerCase();
      if (isTradeVenue(provider)) { venueId = provider; symbol = market.slice(colon + 1); venue = venueLabel(provider); setTradeVenue(provider); }
    }
    timeframe = timeframeLabel(workspace.active.timeframe);
    const config = vela.renderer.getConfig();
    chartStyle = chartStyleFromRenderer(workspace.active.priceStyle, config);
    appearance = appearanceFromConfig(config);
    volumeVisible = vela.indicators().find((indicator) => indicator.nativeType === 'volume')?.visible ?? false;
  }
  function applyAppearanceSetting(key: AppearanceKey, value: string | number | boolean) {
    appearance = { ...appearance, [key]: value } as ChartAppearance;
    vela?.renderer.applyConfig(configPatch(key, value));
  }
  function resetAppearance() {
    if (!vela) return;
    const reset = resetAppearancePatch();
    if (chartStyle === 'hollow') (reset.candles as Record<string, unknown>).bodyVisible = false;
    vela.renderer.applyConfig(reset);
    syncWorkspaceControls();
  }
  function setVolumeVisibility(visible: boolean) {
    volumeVisible = visible;
    const existing = vela?.indicators().find((indicator) => indicator.nativeType === 'volume');
    if (existing) existing.setVisible(visible);
    else if (visible) vela?.addNativeIndicator('volume')?.setVisible(true);
  }
  function styleLabel(style: ChartStyle) {
    return style === 'hollow' ? 'Hollow Candles' : style === 'heikinashi' ? 'Heikin Ashi' : style === 'footprint' ? 'Volume Footprint' : style === 'bars' ? 'Bars (OHLC)' : style[0]!.toUpperCase() + style.slice(1);
  }
  function chooseTimeframe(value: string) {
    timeframe = value;
    void vela?.setMarket({ symbol: chartSymbol(), timeframe: timeframeCode(value) });
  }
  function chooseStyle(style: ChartStyle) {
    if (!vela || !workspace) return;
    styleMenuOpen = false;
    if (style === 'hollow') {
      workspace.active.setPriceStyle('candles');
      vela.renderer.applyConfig({ candles: { bodyVisible: false, borderVisible: true } });
    } else {
      workspace.active.setPriceStyle(style);
      if (style === 'candles') vela.renderer.applyConfig({ candles: { bodyVisible: true } });
    }
    chartStyle = style;
  }
  function restoreAppPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(APP_PREFS_KEY) ?? '{}') as Partial<{ footprintMode: FootprintMode; footprintUnit: FootprintUnit; tickCount: number }>;
      if (saved.footprintMode === 'split' || saved.footprintMode === 'delta' || saved.footprintMode === 'total') footprintMode = saved.footprintMode;
      if (saved.footprintUnit === 'quote' || saved.footprintUnit === 'coin') footprintUnit = saved.footprintUnit;
      if (typeof saved.tickCount === 'number' && Number.isFinite(saved.tickCount)) tickCount = Math.max(1, Math.min(100, saved.tickCount));
    } catch { /* Invalid or older preference data falls back to safe defaults. */ }
    setFootprintMode(footprintMode); setFootprintUnit(footprintUnit); setFootprintTicks(tickCount);
  }
  function saveAppPreferences() {
    try { localStorage.setItem(APP_PREFS_KEY, JSON.stringify({ footprintMode, footprintUnit, tickCount })); }
    catch { /* Browser storage can be disabled; the current session remains usable. */ }
  }
  function chooseMode(next: FootprintMode) { footprintMode = next; setFootprintMode(next); saveAppPreferences(); }
  function chooseUnit(next: FootprintUnit) { footprintUnit = next; setFootprintUnit(next); saveAppPreferences(); }
  function changeTicks(value: number) { tickCount = Math.max(1, Math.min(100, value || 1)); setFootprintTicks(tickCount); saveAppPreferences(); }
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
    venue = venueLabel(next);
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
    const fmt = (time: number) => new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
    return `Coverage ${fmt(feedHealth.coverageStartMs)}–${fmt(feedHealth.coverageEndMs)} UTC`;
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
<svelte:head><title>Vela Terminal — {symbol}</title></svelte:head>
<div class="app-shell">
  <header class="titlebar" data-tauri-drag-region><div class="brand-mark"><CandlestickChart size={14} strokeWidth={1.7} /></div><span class="app-name">VELA</span><span class="brand-divider"></span><span class="workspace-label">Chart</span><div class="window-controls"><button aria-label="Minimize" onclick={() => windowAction('minimize')}><Minus size={12}/></button><button aria-label="Maximize" onclick={() => windowAction('maximize')}><Square size={10}/></button><button class="close" aria-label="Close" onclick={() => windowAction('close')}><X size={12}/></button></div></header>
  <nav class="topbar">
    <div class="market-selector"><button class="symbol-button" onclick={() => { marketMenuOpen = !marketMenuOpen; symbolDraft = symbol; }}><span class="exchange">{venue}</span><span class="symbol-line">{symbol}<ChevronDown size={11}/></span></button><button class="venue-trigger" aria-label="Choose venue" onclick={() => venueMenuOpen = !venueMenuOpen}><ChevronDown size={10}/></button>{#if venueMenuOpen}<div class="venue-popover"><span class="venue-heading">MARKET DATA PROVIDER</span><button class:venue-active={venueId === 'binance'} onclick={() => selectVenue('binance')}><span class="venue-symbol">B</span><span><strong>Binance</strong><small>Spot · USDT pairs</small></span>{#if venueId === 'binance'}<span class="venue-check">●</span>{/if}</button><button class:venue-active={venueId === 'coinbase'} onclick={() => selectVenue('coinbase')}><span class="venue-symbol coinbase-symbol">C</span><span><strong>Coinbase</strong><small>Exchange · USD pairs</small></span>{#if venueId === 'coinbase'}<span class="venue-check">●</span>{/if}</button><button class:venue-active={venueId === 'hyperliquid'} onclick={() => selectVenue('hyperliquid')}><span class="venue-symbol hyper-symbol">H</span><span><strong>Hyperliquid</strong><small>Perpetuals · USDC-margined</small></span>{#if venueId === 'hyperliquid'}<span class="venue-check">●</span>{/if}</button><div class="venue-disclaimer">Crypto feeds only in this build. FX, commodities, indices and dated futures need a selected data provider.</div></div>{/if}{#if marketMenuOpen}<div class="symbol-popover"><label for="symbol-input">Search market</label><input id="symbol-input" bind:value={symbolDraft} onkeydown={(e) => e.key === 'Enter' && applySymbol()}/><div class="search-hint">{venueId === 'coinbase' ? 'BTC-USD, ETH-USD, SOL-USD' : venueId === 'hyperliquid' ? 'BTC, ETH, SOL' : 'BTCUSDT, ETHUSDT, SOLUSDT'}</div><button class="apply-market" onclick={applySymbol}>Open market <ChevronRight size={13}/></button></div>{/if}</div>
    <div class="top-divider"></div><div class="timeframes">{#each intervals as interval}<button class:chosen={timeframe === interval} onclick={() => chooseTimeframe(interval)}>{interval}</button>{/each}<button class="more-time" aria-label="More intervals"><ChevronDown size={11}/></button></div>
    <div class="top-divider"></div><div class="style-picker"><button class="chart-style" class:style-selected={chartStyle !== 'candles'} onclick={() => styleMenuOpen = !styleMenuOpen}><CandlestickChart size={14}/><span>{styleLabel(chartStyle)}</span><ChevronDown size={10}/></button>{#if styleMenuOpen}<div class="style-menu">{#each styleMenuItems as item}<button class:menu-selected={chartStyle === item.id} onclick={() => chooseStyle(item.id)}><svelte:component this={item.icon} size={14}/>{item.name}</button>{/each}<div class="style-menu-note">Price-based styles need dedicated bar construction and are not approximated.</div></div>{/if}</div>
    <div class="top-spacer"></div><button class="top-action" onclick={() => { settingsTab = 'Chart Style'; settingsOpen = true; }}><SlidersHorizontal size={13}/> Chart settings</button>
  </nav>
  <main class="chart-layout"><aside class="drawing-toolbar" aria-label="Drawing tools">{#each tools as tool, index}{#if index === 1 || index === 4 || index === 6 || index === 8 || index === 10 || index === 12}<div class="tool-divider"></div>{/if}<button class:active-tool={toolActive === tool.id || (tool.id === 'visibility' && !selectedDrawingsVisible) || (tool.id === 'lock' && selectedDrawingsLocked)} disabled={(tool.id === 'visibility' || tool.id === 'lock') && selectedDrawingIds.length === 0} aria-pressed={toolActive === tool.id || (tool.id === 'visibility' && !selectedDrawingsVisible) || (tool.id === 'lock' && selectedDrawingsLocked)} aria-label={tool.title} title={tool.title} onclick={() => selectDrawingTool(tool.id)}><svelte:component this={tool.icon} size={14} strokeWidth={1.55}/></button>{/each}<div class="toolbar-bottom"><button aria-label="Undo drawing" title="Undo drawing" disabled={!canUndoDrawings} onclick={undoDrawing}><Undo2 size={14}/></button><button aria-label="Redo drawing" title="Redo drawing" disabled={!canRedoDrawings} onclick={redoDrawing}><Undo2 size={14} class="redo-icon"/></button></div></aside>
    <section class="chart-area">
      <div class="chart-legend"><div class="legend-main"><span class="pair-name" title={symbol}>{symbol}</span><span class="last-price">{venue}</span><span class="price-delta">{styleLabel(chartStyle)}</span></div><div class="legend-sub">{timeframe} · live market data</div></div>
      <div bind:this={chartHost} class="vela-chart" aria-label="Live Vela market chart"></div>
      <button class="reset-chart" aria-label="Fit all" title="Fit all" onclick={() => vela?.setVisibleRangePreset('ALL')}><Undo2 size={14}/></button>
      {#if settingsOpen}
        <div class="settings-scrim" role="presentation" onclick={() => settingsOpen = false}></div>
        <dialog open class="settings-dialog" aria-modal="true" aria-labelledby="settings-title" style={settingsDialogPosition ? `left:${settingsDialogPosition.left}px;top:${settingsDialogPosition.top}px;transform:none` : undefined}>
          <header class="dialog-titlebar" role="toolbar" aria-label="Move settings dialog" tabindex="0" onkeydown={nudgeSettingsDialog} onpointerdown={startSettingsDialogDrag} onpointermove={moveSettingsDialog} onpointerup={endSettingsDialogDrag} onpointercancel={endSettingsDialogDrag}>
            <div><span class="dialog-kicker">CHART SETTINGS</span><h2 id="settings-title">{settingsTab === 'Footprint' ? 'Volume Footprint' : 'Chart appearance'}</h2></div>
            <button class="dialog-close" aria-label="Close settings" onclick={() => settingsOpen = false}><X size={14}/></button>
          </header>
          <nav class="dialog-tabs" aria-label="Chart settings categories">{#each tabs as tab}<button class:tab-active={settingsTab === tab} aria-pressed={settingsTab === tab} onclick={() => settingsTab = tab}>{tab}</button>{/each}</nav>
          <div class="dialog-content"><ChartSettingsPanel tab={settingsTab} {chartStyle} {appearance} {volumeVisible} {footprintMode} {footprintUnit} {tickCount} {feedHealth} {venue} coverageText={coverageText()} onStyleChange={chooseStyle} onAppearanceChange={applyAppearanceSetting} onVolumeChange={setVolumeVisibility} onFootprintModeChange={chooseMode} onFootprintUnitChange={chooseUnit} onTickCountChange={changeTicks} /></div>
          <footer class="dialog-footer"><button class="reset-button" onclick={resetAppearance}>Reset appearance</button><span class="footer-hint">Changes apply immediately</span><button class="done-button" onclick={() => settingsOpen = false}>Done</button></footer>
        </dialog>
      {/if}
    </section>
  </main>
  <footer class="statusbar"><div class="range-options"><button onclick={() => vela?.setVisibleRangePreset('1D')}>1D</button><button onclick={() => vela?.setVisibleRangePreset('1W')}>1W</button><button onclick={() => vela?.setVisibleRangePreset('1M')}>1M</button><button onclick={() => vela?.setVisibleRangePreset('3M')}>3M</button><button onclick={() => vela?.setVisibleRangePreset('6M')}>6M</button><button onclick={() => vela?.setVisibleRangePreset('1Y')}>1Y</button><button onclick={() => vela?.setVisibleRangePreset('ALL')}>ALL</button><span class="status-divider"></span><button class="calendar-button"><BarChart3 size={12}/></button></div><div class="connection"><span class:connected={status.startsWith('Live')} class="connection-dot"></span>{status}</div><div class="clock">{clock.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' })} UTC</div><button class="fit-button"><Maximize2 size={12}/> Fit</button><button class="help-button"><CircleHelp size={13}/></button></footer>
</div>
