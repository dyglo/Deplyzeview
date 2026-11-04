<script lang="ts">
  import PineEditor from './PineEditor.svelte';
  import { readLibrary, writeLibrary, type SavedScript } from './pine/library';
  import type { AppTheme } from './chart-theme';
  import appIcon from '../src-tauri/icons/icon.png';
  import { defaultTimezone, timezoneChoices, formatClock } from './timezones';
  import { onMount } from 'svelte';
  import ToolRail from './ToolRail.svelte';
  import { drawingGroups } from './drawing-catalog';
  import type { DrawingToolPreferences } from './drawing-catalog';
  import { pushCustomDrawingData } from './custom-drawing-tools';
  import IndicatorPicker from './IndicatorPicker.svelte';
  import ChartAppearance from './ChartAppearance.svelte';
  import SymbolSearch from './SymbolSearch.svelte';
  import SymbolTabBar from './SymbolTabBar.svelte';
  import { fetchWatchlistQuote, type WatchlistQuote } from './watchlist-quotes';
  import { addWatchlistItem, readWatchlist, writeWatchlist, rightPanelKey, type InstrumentSearchResult, type WatchlistItem } from './watchlist';
  import { chartStyles, isChartStyle, setPriceAppearance, type ChartStyleId } from './chart-styles';
  import { defaultExtras, readPreferences, writePreferences, type ChartExtras } from './chart-preferences';
  import { Vela, type ChartConfig } from '@luxalgo/vela';
  import { RustMarketDataProvider } from './data-provider';
  import './footprint';
  import { setFootprintMode, setFootprintTicks, setFootprintUnit, type FootprintMode, type FootprintUnit, setTradeVenue, type TradeVenue, type FeedHealth, setFeedHealthSink } from './footprint';
  import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Eye, Minus, Settings2, Square, Undo2, CandlestickChart, X, SlidersHorizontal, Bookmark, Search, Plus, UserRound, History, Layers, Sparkles, Target, Mountain, Radio, Bell, MessagesSquare, Grid3X3, CircleHelp } from 'lucide-svelte';
  let chartHost: HTMLDivElement;
  let chartArea: HTMLElement;
  let vela: Vela | undefined;
  let symbol = 'BTCUSDT';
  let venueId: TradeVenue = 'binance';
  let tabPrice: number | null = null;
  let tabPreviousClose: number | null = null;
  let tabQuoteRequestId = 0;
  let tabLiveRevision = 0;
  let timeframe = '1h';
  let chartStyle: ChartStyleId = 'candles';
  let appearanceOpen = false;
  let indicatorsOpen = false;
  let pineOpen = false;
  let pineEditor: PineEditor;
  let pineScripts: SavedScript[] = [];
  let pineError = '';
  function persistPine(scripts: SavedScript[]) {
    writeLibrary(window.localStorage, scripts);
    pineScripts = scripts;
  }
  function editPine(script: SavedScript) { pineOpen = true; panelOpen = false; pineEditor.open(script); indicatorsOpen = false; }
  async function addPine(script: SavedScript) {
    try { await pineEditor.runSaved(script); pineError = ''; }
    catch(error) { pineError = error instanceof Error ? error.message : String(error); }
  }
  function deletePine(script: SavedScript) {
    if (!confirm('Delete saved indicator “'+script.name+'”? Its running chart instance will remain.')) return;
    try { persistPine(pineScripts.filter(item=>item.id!==script.id)); pineEditor.detach(script.id); pineError=''; }
    catch(error) { pineError=error instanceof Error ? error.message : String(error); }
  }
  let appearance: ChartConfig | undefined;
  let defaultAppearance: ChartConfig;
  let appliedTheme: AppTheme = 'dark';
  let extras: ChartExtras = structuredClone(defaultExtras);
  let persistenceError = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let venue = 'BINANCE · SPOT';
  let searchOpen = false;
  let panelOpen = (() => { try { return typeof window !== 'undefined' && window.localStorage.getItem(rightPanelKey) === 'open'; } catch { return false; } })();
  let watchlist: WatchlistItem[] = (() => { try { return typeof window !== 'undefined' ? readWatchlist(window.localStorage) : []; } catch { return []; } })();
  let watchlistError = false;
  let watchlistQuotes: Record<string, { quote?: WatchlistQuote; error?: string }> = {};
  let watchlistQuotesLoading = false;
  let quoteRequestId = 0;
  let quoteRefreshActive = false;
  let quoteRefreshPending = false;
  let styleMenuOpen = false;
  let settingsOpen = false;
  let settingsDialogPosition: { left: number; top: number } | undefined;
  let settingsDialogDrag: { pointerId: number; startX: number; startY: number; left: number; top: number; dialog: HTMLDialogElement; container: HTMLElement } | undefined;
  let settingsTab = 'General';
  let status = 'Connecting · Binance Spot';
  let feedHealth: FeedHealth | undefined;
  setFeedHealthSink((next) => { if (next.venue !== venueId || next.instrument !== symbol) return; feedHealth = next; status = next.status === 'live' ? `Live · ${venue}` : next.status === 'error' ? `Feed issue · ${venue}` : `${next.status} · ${venue}`; });
  let clock = new Date();
  let timezone = defaultTimezone;
  let timezonePickerOpen = false;
  let rangePickerOpen = false;
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let customRangeStart = '';
  let customRangeEnd = '';
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
  onMount(() => {
    try { pineScripts = readLibrary(window.localStorage); } catch(error) { pineError = String(error); }
    const chart = new Vela(chartHost, { symbol: chartSymbol(), timeframe: '60', bars: 500, live: true, theme: 'dark', upColor: '#8a746e', downColor: '#c16f61', currentPriceLine: true, volume: true, drawings: true, animations: { intro: false, zoom: true, pan: true } });
    vela = chart;
    const refreshSymbolTabQuote = async () => {
      const requestId = ++tabQuoteRequestId;
      const requestedSymbol = symbol;
      const requestedVenue = venueId;
      const liveRevision = tabLiveRevision;
      try {
        const bars = await new RustMarketDataProvider(requestedVenue).getBars(requestedSymbol, '1D', { limit: 3 });
        if (requestId !== tabQuoteRequestId || requestedSymbol !== symbol || requestedVenue !== venueId) return;
        const latest = bars[bars.length - 1];
        const previous = bars[bars.length - 2];
        tabPreviousClose = previous && Number.isFinite(previous.close) ? previous.close : null;
        if (tabLiveRevision === liveRevision) tabPrice = latest && Number.isFinite(latest.close) ? latest.close : null;
      } catch { /* The chart feed remains the source of live tab prices. */ }
    };
    const offTabBar = chart.on('bar', (bar) => {
      if (chart.market.symbol?.toUpperCase() !== chartSymbol().toUpperCase() || !Number.isFinite(bar.close)) return;
      tabLiveRevision++;
      tabPrice = bar.close;
    });
    const offTabLoad = chart.on('load:end', () => { void refreshSymbolTabQuote(); });
    let customDraft: unknown = null;
    let customSelection: string[] = [];
    const syncCustomDrawings = () => pushCustomDrawingData(chart.renderer, chart, customDraft, customSelection);
    const offCustomCreated = chart.on('drawing:created', syncCustomDrawings);
    const offCustomEdited = chart.on('drawing:edited', syncCustomDrawings);
    const offCustomRemoved = chart.on('drawing:removed', syncCustomDrawings);
    const offCustomDraft = chart.on('drawing:draft', ({ doc }) => { customDraft = doc; syncCustomDrawings(); });
    const offCustomSelection = chart.on('drawing:selected', ({ ids }) => { customSelection = ids; syncCustomDrawings(); });
    syncCustomDrawings();
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
    chart.data.registerProvider('oanda', new RustMarketDataProvider('oanda'));
    chart.data.registerProvider('narwhal', new RustMarketDataProvider('narwhal'));
    chart.data.registerProvider('finzdata', new RustMarketDataProvider('finzdata'));
    chart.ready().then(() => status = ['oanda','narwhal','finzdata'].includes(venueId) ? `Market data · ${venue}` : `Live · ${venue}`).catch(() => status = 'Unable to load market data');
    let removeFeedHealth: (() => void) | undefined;
    if ('__TAURI_INTERNALS__' in window) import('@tauri-apps/api/event').then(({ listen }) => listen<FeedHealth>('feed-health', (event) => { if (event.payload.venue !== venueId || event.payload.instrument !== symbol) return; feedHealth = event.payload; status = event.payload.status === 'live' ? `Live · ${venue}` : `${event.payload.status} · ${venue}`; })).then((remove) => { removeFeedHealth = remove; });
    const timer = window.setInterval(() => clock = new Date(), 1000);
    const quoteTimer = window.setInterval(() => { if (panelOpen) void refreshWatchlistQuotes(); }, 30_000);
    if (panelOpen && watchlist.length) void refreshWatchlistQuotes();
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(chartHost);
    return () => { quoteRequestId++; flushPreferences(); window.removeEventListener('pagehide', flushPreferences); offConfig(); offStyle(); offVolumeInputs(); offVolumeVisibility(); offVolumeRemoved(); offCustomCreated(); offCustomEdited(); offCustomRemoved(); offCustomDraft(); offCustomSelection(); offTabBar(); offTabLoad(); removeFeedHealth?.(); clearInterval(timer); clearInterval(quoteTimer); resize.disconnect(); chart.destroy(); };
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
  function openPlaceholderTool(name: string) { console.info(name + ' coming soon.'); }
  function trackWorkspaceDockWidth(node: HTMLElement) {
    const shell = node.closest('.app-shell') as HTMLElement | null;
    const update = () => shell?.style.setProperty('--workspace-dock-width', node.getBoundingClientRect().width + 'px');
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return { destroy() { observer.disconnect(); shell?.style.removeProperty('--workspace-dock-width'); } };
  }
  function timeframeCode(value: string) { return value === '1D' ? '1D' : value === '1h' ? '60' : value === '4h' ? '240' : value.slice(0, -1); }
  function chooseTimeframe(value: string) {
    timeframe = value;
    void vela?.setMarket({ symbol: chartSymbol(), timeframe: timeframeCode(value) });
  }
  function dateFieldValue(date: Date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function shiftCalendarMonth(offset: number) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1);
  }
  function selectCalendarDate(value: string) {
    if (!customRangeStart || customRangeEnd) {
      customRangeStart = value;
      customRangeEnd = '';
      return;
    }
    if (value < customRangeStart) {
      customRangeEnd = customRangeStart;
      customRangeStart = value;
    } else {
      customRangeEnd = value;
    }
  }
  function calendarDays() {
    const month = calendarMonth.getMonth();
    const first = new Date(calendarMonth.getFullYear(), month, 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    const low = customRangeStart && customRangeEnd ? (customRangeStart < customRangeEnd ? customRangeStart : customRangeEnd) : '';
    const high = customRangeStart && customRangeEnd ? (customRangeStart > customRangeEnd ? customRangeStart : customRangeEnd) : '';
    const today = dateFieldValue(new Date());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const value = dateFieldValue(date);
      return { value, day: date.getDate(), inMonth: date.getMonth() === month, inRange: !!low && value >= low && value <= high, isStart: value === customRangeStart, isEnd: value === customRangeEnd, isToday: value === today };
    });
  }
  function displayCalendarDate(value: string) {
    return value ? new Date(value + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select date';
  }
  function toggleRangePicker() {
    if (!rangePickerOpen) {
      if (!customRangeStart && !customRangeEnd) {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 7);
        customRangeStart = dateFieldValue(start);
        customRangeEnd = dateFieldValue(end);
      }
      const anchor = customRangeEnd || customRangeStart;
      const date = anchor ? new Date(anchor + 'T12:00:00') : new Date();
      calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    }
    rangePickerOpen = !rangePickerOpen;
    timezonePickerOpen = false;
  }
  function applyCustomDateRange() {
    if (!customRangeStart || !customRangeEnd || customRangeStart > customRangeEnd) return;
    const from = new Date(customRangeStart + 'T00:00:00').getTime();
    const to = new Date(customRangeEnd + 'T23:59:59.999').getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to)) return;
    vela?.setVisibleRange({ from, to });
    rangePickerOpen = false;
  }
  function formatTimezoneOffset(date: Date, zone: string) {
    try {
      const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value;
      return offset?.replace(/^GMT/, 'UTC') ?? zone;
    } catch { return zone; }
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
    applyExtras({ ...structuredClone(defaultExtras), drawingTools: extras.drawingTools });
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
  function clearAllDrawings() {
    if (!vela) return;
    vela.drawings.removeMany(vela.drawings.all().map(drawing => drawing.id));
  }
  function setAllDrawingsLocked(on: boolean) {
    for (const drawing of vela?.drawings.all() ?? []) vela?.drawings.lock(drawing.id, on);
  }
  function setAllDrawingsHidden(on: boolean) {
    for (const drawing of vela?.drawings.all() ?? []) vela?.drawings.show(drawing.id, !on);
  }
  function updateDrawingPreferences(drawingTools: DrawingToolPreferences) {
    extras = { ...extras, drawingTools };
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAppearance, 180);
  }
  function chartSymbol() { return `${venueId}:${symbol}`; }
  function providerTitle(provider: string) {
    return provider === 'binance' ? 'BINANCE · SPOT' : provider === 'coinbase' ? 'COINBASE · EXCHANGE' : provider === 'hyperliquid' ? 'HYPERLIQUID · PERP' : provider === 'oanda' ? 'OANDA · FX / CFD' : provider === 'narwhal' ? 'NARWHAL · FRONT MONTH' : 'FINZDATA · FUTURES';
  }
  function selectInstrument(item: InstrumentSearchResult) {
    const provider = item.provider as TradeVenue;
    venueId = provider;
    venue = providerTitle(item.provider);
    tabQuoteRequestId++;
    tabPrice = null;
    tabPreviousClose = null;
    tabLiveRevision++;
    setTradeVenue(provider);
    if (provider === 'narwhal' || provider === 'finzdata') timeframe = '1D';
    symbol = item.symbol;
    searchOpen = false;
    feedHealth = undefined;
    status = `Loading · ${venue}`;
    if (vela) void Promise.resolve(vela.setMarket({ symbol: chartSymbol(), timeframe: timeframeCode(timeframe) })).catch(error => { status = `Unable to load ${item.symbol} · ${String(error)}`; });
  }
  function saveWatchlist(items: WatchlistItem[]) {
    watchlist = items;
    try { watchlistError = !writeWatchlist(window.localStorage, items); } catch { watchlistError = true; }
  }
  async function refreshWatchlistQuotes() {
    if (!panelOpen || !watchlist.length) return;
    if (quoteRefreshActive) { quoteRefreshPending = true; return; }
    quoteRefreshActive = true;
    const requestId = ++quoteRequestId;
    const items = [...watchlist];
    watchlistQuotesLoading = true;
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        try {
          const quote = await fetchWatchlistQuote(item);
          if (requestId !== quoteRequestId) return;
          if (quote) watchlistQuotes = { ...watchlistQuotes, [item.identity]: { quote } };
          else watchlistQuotes = { ...watchlistQuotes, [item.identity]: { error: 'No recent daily bars were returned' } };
        } catch (error) {
          if (requestId === quoteRequestId) watchlistQuotes = { ...watchlistQuotes, [item.identity]: { error: String(error) } };
        }
      }
    }));
    if (requestId === quoteRequestId) watchlistQuotesLoading = false;
    quoteRefreshActive = false;
    if (quoteRefreshPending) {
      quoteRefreshPending = false;
      if (panelOpen && watchlist.length) void refreshWatchlistQuotes();
    }
  }
  function addToWatchlist(item: InstrumentSearchResult) {
    const updated = addWatchlistItem(watchlist, item);
    if (updated === watchlist) return;
    saveWatchlist(updated);
    if (panelOpen) void refreshWatchlistQuotes();
  }
  function removeFromWatchlist(identity: string) {
    quoteRequestId++;
    watchlistQuotes = Object.fromEntries(Object.entries(watchlistQuotes).filter(([key]) => key !== identity));
    saveWatchlist(watchlist.filter(item => item.identity !== identity));
    if (panelOpen) void refreshWatchlistQuotes();
    if (!watchlist.length) { quoteRefreshPending = false; watchlistQuotesLoading = false; }
  }
  function toggleWorkspacePanel() {
    panelOpen = !panelOpen;
    try { window.localStorage.setItem(rightPanelKey, panelOpen ? 'open' : 'closed'); } catch { watchlistError = true; }
    if (panelOpen) void refreshWatchlistQuotes();
    else { quoteRequestId++; quoteRefreshPending = false; watchlistQuotesLoading = false; }
  }
  function formatWatchlistPrice(value: number) { return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 8 }).format(value); }
  function formatWatchlistChange(value: number | null, currency: string | null) {
    if (value === null) return '—';
    const amount = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(Math.abs(value));
    return `${value >= 0 ? '+' : '−'}${amount}${currency ? ` ${currency}` : ''}`;
  }
  function formatWatchlistPercent(value: number | null) { return value === null ? '—' : `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}%`; }
  function watchlistChangeTone(value: number | null | undefined) { return value == null ? 'change-neutral' : value >= 0 ? 'change-positive' : 'change-negative'; }
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
<svelte:window onkeydown={(event) => { if (event.key === 'Escape') { if (styleMenuOpen) { styleMenuOpen = false; document.querySelector<HTMLButtonElement>('.chart-style')?.focus(); } rangePickerOpen = false; timezonePickerOpen = false; } }} onclick={(event) => { const target = event.target as Element; if (!target.closest('.style-picker')) styleMenuOpen = false; if (!target.closest('.range-picker-anchor')) rangePickerOpen = false; if (!target.closest('.clock-control')) timezonePickerOpen = false; }}/>
<svelte:head><title>DeplyzeView — {symbol}</title></svelte:head>
<div class="app-shell" data-theme={extras.theme}>
  <header class="titlebar" data-tauri-drag-region><SymbolTabBar tabs={[{ id: chartSymbol(), symbol, price: tabPrice, percentChange: tabPrice !== null && tabPreviousClose !== null && tabPreviousClose !== 0 ? ((tabPrice - tabPreviousClose) / tabPreviousClose) * 100 : null, icon: vela?.data.symbolIcon(chartSymbol()) }]} activeTabId={chartSymbol()} onAdd={() => console.info('Multi-tab coming soon.')}/><div class="window-controls"><button aria-label="Minimize" onclick={() => windowAction('minimize')}><Minus size={12}/></button><button aria-label="Maximize" onclick={() => windowAction('maximize')}><Square size={10}/></button><button class="close" aria-label="Close" onclick={() => windowAction('close')}><X size={12}/></button></div></header>
  <nav class="topbar">
    <div class="market-identity">
      <button class="profile-avatar" type="button" aria-label="Profile settings coming soon" title="Profile settings coming soon" onclick={() => console.info('Profile settings coming soon.')}><UserRound size={16}/></button>
      <div class="market-selector">
        <button class="symbol-button" aria-label="Search markets, current {symbol} from {venue}" onclick={() => searchOpen = true}><span class="symbol-line"><span>{symbol}</span><Search size={12}/></span><span class="exchange">{venue}</span></button>
      </div>
    </div>
    <div class="top-divider"></div><div class="timeframes">{#each intervals as interval}<button class:chosen={timeframe === interval} onclick={() => chooseTimeframe(interval)}>{interval}</button>{/each}<button class="more-time" aria-label="More intervals"><ChevronDown size={11}/></button></div>
    <div class="top-divider"></div><div class="style-picker"><button class="chart-style" aria-label="Chart style" aria-expanded={styleMenuOpen} class:style-selected={chartStyle !== 'candles'} onclick={() => styleMenuOpen = !styleMenuOpen} onkeydown={(e) => { if (e.key === 'Escape') styleMenuOpen = false; }}><CandlestickChart size={14}/><span>{chartStyles.find(style => style.id === chartStyle)?.label}</span><ChevronDown size={10}/></button>{#if styleMenuOpen}<div class="style-menu" role="group" aria-label="Chart styles">{#each chartStyles as style}<button class:menu-selected={chartStyle === style.id} aria-pressed={chartStyle === style.id} onclick={() => chooseStyle(style.id)}><CandlestickChart size={14}/>{style.label}{#if chartStyle === style.id}<span class="new-tag">SELECTED</span>{/if}</button>{/each}<div class="style-menu-note">Appearance controls in Chart settings</div></div>{/if}</div>
    <div class="top-spacer"></div>{#if chartStyle === 'footprint'}<button class="top-action" onclick={() => { indicatorsOpen = false; appearanceOpen = false; settingsOpen = true; }}><SlidersHorizontal size={13}/> Footprint</button>{/if}<button class="top-action" aria-label="Indicators" aria-expanded={indicatorsOpen} onclick={() => { appearanceOpen = false; settingsOpen = false; styleMenuOpen = false; vela?.renderer.closeDialogs(); indicatorsOpen = !indicatorsOpen; }}><SlidersHorizontal size={13}/> Indicators</button><button class="top-action"><ArrowLeftRight size={13}/> Alert</button><button class="top-action"><Eye size={13}/> View as</button><button class="top-icon" aria-label="Chart settings" onclick={() => { indicatorsOpen = false; settingsOpen = false; appearanceOpen = !appearanceOpen; }}><Settings2 size={14}/></button>
  </nav>
  <main class="chart-layout">{#if vela && chartArea}<ToolRail chart={vela} groups={drawingGroups} bind:prefs={extras.drawingTools} onClear={clearAllDrawings} onLockAll={setAllDrawingsLocked} onHideAll={setAllDrawingsHidden} modeOff={null} disabled={appearanceOpen || settingsOpen || indicatorsOpen || searchOpen}/>{:else}<aside class="drawing-toolbar" aria-label="Drawing tools"></aside>{/if}
    <section class="chart-area" bind:this={chartArea}><div class="chart-legend" use:measureSymbolLegend><div class="legend-main"><span class="pair-name">{symbol}</span></div>{#if chartStyle === 'footprint'}<div class="legend-sub">Bid × Ask</div>{/if}</div><div class="chart-plot"><div bind:this={chartHost} class="vela-chart" aria-label="Live DeplyzeView market chart"></div></div><div class="chart-bottom-controls"><div class="chart-watermark" aria-label="DeplyzeView"><img src={appIcon} alt="" draggable="false"/><span>DeplyzeView</span></div><button class="reset-chart" aria-label="Fit all" title="Fit all" onclick={() => vela?.setVisibleRangePreset('ALL')}><Undo2 size={14}/></button></div>
      {#if indicatorsOpen && vela}<IndicatorPicker chart={vela} customScripts={pineScripts} customError={pineError} onCustomAdd={addPine} onCustomEdit={editPine} onCustomDelete={deletePine} close={() => indicatorsOpen = false}/>{/if}
      {#if appearanceOpen && appearance}<ChartAppearance config={appearance} {extras} {persistenceError} patch={applyAppearance} changeExtras={applyExtras} {chooseStyle} reset={resetAppearance} close={() => appearanceOpen = false}/>{/if}
      {#if settingsOpen}<div class="settings-scrim" role="presentation" onclick={() => settingsOpen = false}></div><dialog open class="settings-dialog" aria-modal="true" aria-labelledby="settings-title" style={settingsDialogPosition ? `left:${settingsDialogPosition.left}px;top:${settingsDialogPosition.top}px;transform:none` : undefined}><header class="dialog-titlebar" role="toolbar" aria-label="Move settings dialog" tabindex="0" onkeydown={nudgeSettingsDialog} onpointerdown={startSettingsDialogDrag} onpointermove={moveSettingsDialog} onpointerup={endSettingsDialogDrag} onpointercancel={endSettingsDialogDrag}><div><span class="dialog-kicker">CHART SETTINGS</span><h2 id="settings-title">Volume Footprint</h2></div><button class="dialog-close" aria-label="Close settings" onclick={() => settingsOpen = false}><X size={14}/></button></header><nav class="dialog-tabs">{#each tabs as tab}<button class:tab-active={settingsTab === tab} onclick={() => settingsTab = tab}>{tab}</button>{/each}</nav><div class="dialog-content"><div class="dialog-section-label">{settingsTab === 'General' ? 'GENERAL' : settingsTab.toUpperCase()}</div>{#if settingsTab === 'General'}<div class="setting-row"><div class="setting-name"><strong>Unit</strong><small>Volume denomination</small></div><div class="segmented"><button class:segment-active={footprintUnit === 'quote'} onclick={() => chooseUnit('quote')}>{feedHealth?.quoteCurrency ?? 'Quote'}</button><button class:segment-active={footprintUnit === 'coin'} onclick={() => chooseUnit('coin')}>Coin</button></div></div><div class="setting-row"><div class="setting-name"><strong>Ticks per bar</strong><small>Price levels per footprint row</small></div><div class="stepper"><button aria-label="Decrease ticks" onclick={() => changeTicks(tickCount - 1)}>−</button><input type="number" min="1" max="100" bind:value={tickCount} oninput={() => changeTicks(tickCount)}/><span>ticks</span><button aria-label="Increase ticks" onclick={() => changeTicks(tickCount + 1)}>+</button></div></div><div class="setting-row mode-row"><div class="setting-name"><strong>Display mode</strong><small>How trade volume is rendered</small></div><div class="mode-options">{#each modes as item}<button class:mode-active={footprintMode === item.id} onclick={() => chooseMode(item.id)}><span>{item.name}</span><small>{item.hint}</small>{#if footprintMode === item.id}<span class="selected-dot"></span>{/if}</button>{/each}</div></div><div class="data-note"><span class="live-indicator" class:health-error={feedHealth?.status === 'error' || (feedHealth?.gapsDetected ?? 0) > 0}></span><span><strong>{feedHealth?.status === 'live' ? 'Live trade feed' : feedHealth?.status === 'error' ? 'Feed needs attention' : 'Market data service'}</strong><small>{feedHealth ? `${feedHealth.tradesStored.toLocaleString()} stored trades · ${feedHealth.gapDetectionAvailable ? `${feedHealth.gapsDetected} gap(s)` : 'gap detection unavailable'}` : 'Waiting for Rust feed status…'}</small><small>{coverageText()}</small><small>{feedHealth?.historyNote ?? `${venue} public trade history`}</small>{#if feedHealth?.lastError}<small class="feed-error-text">{feedHealth.lastError}</small>{/if}</span></div>{:else}<div class="settings-placeholder"><div class="settings-placeholder-icon"><Settings2 size={17}/></div><strong>{settingsTab} settings</strong><span>Configure {settingsTab.toLowerCase()} visualization for the footprint chart.</span><div class="coming-chip">AVAILABLE IN THIS BUILD</div></div>{/if}</div><footer class="dialog-footer"><span class="footer-hint">Settings apply to the active chart</span><button class="done-button" onclick={() => settingsOpen = false}>Done</button></footer></dialog>{/if}
    </section>
    <div class="workspace-dock" use:trackWorkspaceDockWidth>
      {#if vela}<div style:display={pineOpen ? 'contents' : 'none'}><PineEditor chart={vela} scripts={pineScripts} persist={persistPine} bind:this={pineEditor}/></div>{/if}
      {#if panelOpen && !pineOpen}
        <section class="watchlist-panel" aria-labelledby="watchlist-title">
          <header class="watchlist-header"><div><h2 id="watchlist-title">Watchlist</h2><small>{watchlist.length} saved{watchlist.length ? ` · ${watchlistQuotesLoading ? 'Updating' : '30s refresh'}` : ''}</small></div><button class="watchlist-add" aria-label="Add symbol to watchlist" title="Add symbol" onclick={() => searchOpen = true}><Plus size={16}/></button></header>
          <div class="watchlist-columns"><span>Instrument</span><span>Last</span><span>Change</span></div>
          {#if watchlist.length}
            <div class="watchlist-items" aria-label="Saved instruments">
              {#each watchlist as item (item.identity)}
                {@const snapshot = watchlistQuotes[item.identity]}
                {@const quote = snapshot?.quote}
                <div class="watchlist-row">
                  <button class="watchlist-select" aria-label={`Load ${item.symbol} from ${item.provider}`} onclick={() => selectInstrument(item)}><span class="watchlist-symbol">{item.symbol}</span><span class="watchlist-name">{item.name}</span><span class="watchlist-meta">{item.provider} · {item.instrumentType.replace(/_/g, ' ')}{item.contractExpiry ? ` · ${item.contractExpiry}` : ''}</span></button>
                  <div class="watchlist-last" title={quote ? `${quote.freshness} · ${new Date(quote.asOf).toLocaleString()}` : snapshot?.error ?? 'Waiting for a provider snapshot'}><strong>{quote ? formatWatchlistPrice(quote.price) : '—'}</strong><small>{quote?.quoteCurrency ?? ''}</small></div>
                  <div class={`watchlist-change ${watchlistChangeTone(quote?.changePercent ?? null)}`} title={quote?.freshness ?? snapshot?.error ?? 'Change vs previous daily close'}><strong>{formatWatchlistPercent(quote?.changePercent ?? null)}</strong><small>{formatWatchlistChange(quote?.change ?? null, quote?.quoteCurrency ?? null)}</small></div>
                  <button class="watchlist-remove" aria-label={`Remove ${item.symbol} from watchlist`} title="Remove" onclick={() => removeFromWatchlist(item.identity)}><X size={13}/></button>
                </div>
              {/each}
            </div>
          {:else}
            <div class="watchlist-empty"><Bookmark size={21}/><strong>Your watchlist is empty</strong><span>Add instruments from unified search to keep them here.</span><button onclick={() => searchOpen = true}><Plus size={13}/> Add symbol</button></div>
          {/if}
          {#if watchlistError}<div class="watchlist-storage-error" role="status">Changes may not persist because local storage is unavailable.</div>{/if}
        </section>
      {/if}
      <nav class="workspace-rail" aria-label="Workspace panels">
        <button class:rail-active={panelOpen} aria-label={panelOpen ? 'Close watchlist panel' : 'Open watchlist panel'} title="Watchlist" aria-pressed={panelOpen} onclick={() => { pineOpen = false; toggleWorkspacePanel(); }}><Bookmark size={18}/></button>
        <button class="rail-placeholder" type="button" aria-label="Alerts (coming soon)" title="Alerts (coming soon)" onclick={() => openPlaceholderTool('Alerts')}><History size={18}/></button>
        <button class="rail-placeholder" type="button" aria-label="Object tree (coming soon)" title="Object tree (coming soon)" onclick={() => openPlaceholderTool('Object tree')}><Layers size={18}/></button>
        <span class="rail-group-gap" aria-hidden="true"></span>
        <button class="rail-placeholder" type="button" aria-label="Hotlists (coming soon)" title="Hotlists (coming soon)" onclick={() => openPlaceholderTool('Hotlists')}><Sparkles size={18}/></button>
        <button class="rail-placeholder" type="button" aria-label="Screeners (coming soon)" title="Screeners (coming soon)" onclick={() => openPlaceholderTool('Screeners')}><Target size={18}/></button>
        <button class:rail-active={pineOpen} type="button" aria-label="Pine Editor" title="Pine Editor" aria-pressed={pineOpen} onclick={() => { pineOpen = !pineOpen; panelOpen = false; }}><Mountain size={18}/></button>
        <button class="rail-placeholder" type="button" aria-label="Calendar (coming soon)" title="Calendar (coming soon)" onclick={() => openPlaceholderTool('Calendar')}><CalendarDays size={18}/></button>
        <button class="rail-placeholder" type="button" aria-label="Streams (coming soon)" title="Streams (coming soon)" onclick={() => openPlaceholderTool('Streams')}><Radio size={18}/></button>
        <button class="rail-placeholder" type="button" aria-label="Notifications (coming soon)" title="Notifications (coming soon)" onclick={() => openPlaceholderTool('Notifications')}><Bell size={18}/></button>
        <button class="rail-placeholder" type="button" aria-label="Chats (coming soon)" title="Chats (coming soon)" onclick={() => openPlaceholderTool('Chats')}><MessagesSquare size={18}/></button>
        <button class="rail-placeholder apps-launcher" type="button" aria-label="More apps (coming soon)" title="More apps (coming soon)" onclick={() => openPlaceholderTool('More apps')}><Grid3X3 size={17}/></button>
        <span class="rail-separator" aria-hidden="true"></span>
        <button class="rail-placeholder" type="button" aria-label="Help center (coming soon)" title="Help center (coming soon)" onclick={() => openPlaceholderTool('Help center')}><CircleHelp size={18}/></button>
      </nav>
    </div>
  </main>
  {#if searchOpen}<SymbolSearch close={() => searchOpen = false} select={selectInstrument} add={addToWatchlist} isSaved={(item) => watchlist.some(saved => saved.identity === item.identity)}/>{/if}
  <footer class="statusbar"><div class="range-options"><button onclick={() => vela?.setVisibleRangePreset('1D')}>1D</button><button onclick={() => vela?.setVisibleRangePreset('1W')}>1W</button><button onclick={() => vela?.setVisibleRangePreset('1M')}>1M</button><button onclick={() => vela?.setVisibleRangePreset('3M')}>3M</button><button onclick={() => vela?.setVisibleRangePreset('6M')}>6M</button><button onclick={() => vela?.setVisibleRangePreset('1Y')}>1Y</button><button onclick={() => vela?.setVisibleRangePreset('ALL')}>ALL</button><span class="status-divider"></span><div class="range-picker-anchor"><button class="calendar-button" type="button" aria-label="Choose custom chart date range" title="Custom date range" aria-haspopup="dialog" aria-expanded={rangePickerOpen} onclick={toggleRangePicker}><CalendarDays size={14}/></button>{#if rangePickerOpen}<div class="range-picker" role="dialog" aria-label="Custom chart date range"><strong>Custom date range</strong><div class="calendar-selection"><div><span>From</span><strong>{displayCalendarDate(customRangeStart)}</strong></div><div><span>To</span><strong>{displayCalendarDate(customRangeEnd)}</strong></div></div><div class="calendar-month-nav"><button type="button" aria-label="Previous month" onclick={() => shiftCalendarMonth(-1)}><ChevronLeft size={14}/></button><strong>{calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong><button type="button" aria-label="Next month" onclick={() => shiftCalendarMonth(1)}><ChevronRight size={14}/></button></div><div class="calendar-weekdays">{#each ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as weekday}<span>{weekday}</span>{/each}</div><div class="calendar-grid">{#each calendarDays() as day (day.value)}<button type="button" class="calendar-day" class:other-month={!day.inMonth} class:in-range={day.inRange} class:range-start={day.isStart} class:range-end={day.isEnd} class:today={day.isToday} aria-label={day.value} aria-pressed={day.isStart || day.isEnd} onclick={() => selectCalendarDate(day.value)}>{day.day}</button>{/each}</div><div class="range-picker-actions"><button type="button" class="range-cancel" onclick={() => rangePickerOpen = false}>Cancel</button><button type="button" class="range-apply" disabled={!customRangeStart || !customRangeEnd || customRangeStart > customRangeEnd} onclick={applyCustomDateRange}>Apply</button></div></div>{/if}</div></div><div class="clock-control"><button class="clock-button" type="button" aria-label="Current time and time zone preferences" title="Change time zone" aria-haspopup="dialog" aria-expanded={timezonePickerOpen} onclick={() => { timezonePickerOpen = !timezonePickerOpen; rangePickerOpen = false; }}><span class="clock">{formatClock(clock, timezone)}</span><span class="clock-zone">{formatTimezoneOffset(clock, timezone)}</span></button>{#if timezonePickerOpen}<div class="timezone-popover" role="dialog" aria-label="Time zone preference"><label for="clock-timezone">Time zone</label><select id="clock-timezone" class="timezone-select" aria-label="Chart time zone" title="Chart and clock time zone" value={timezone} onchange={(event) => { applyAppearance({ timeScale: { timezone: event.currentTarget.value } }); timezonePickerOpen = false; }}>{#each timezoneChoices(timezone) as zone}<option value={zone.value}>{zone.label}</option>{/each}</select></div>{/if}</div></footer>
</div>
