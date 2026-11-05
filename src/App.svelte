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
  import Watchlist from './Watchlist.svelte';
  import { readWatchlists, watchlistsKey } from './watchlist';
  import { fetchWatchlistQuote, type WatchlistQuote } from './watchlist-quotes';
  import { addWatchlistItem, writeWatchlist, rightPanelKey, type InstrumentSearchResult, type WatchlistItem } from './watchlist';
  import { chartStyles, isChartStyle, setPriceAppearance, type ChartStyleId } from './chart-styles';
  import { defaultCandleColors, defaultExtras, readPreferences, writePreferences, type ChartExtras } from './chart-preferences';
  import { type Vela, type ChartConfig } from '@luxalgo/vela';
  import { VelaWorkspace, registerLayout } from '@luxalgo/vela/workspace';
  import { NativePineEngine } from './pine/engine';
  import { RustMarketDataProvider } from './data-provider';
  import { captureChartPng } from './chart-screenshot';
  import './footprint';
  import { setFootprintMode, setFootprintTicks, setFootprintUnit, type FootprintMode, type FootprintUnit, setTradeVenue, type TradeVenue, type FeedHealth, setFeedHealthSink } from './footprint';
  import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Camera, Eye, Minus, Settings2, Square, Undo2, CandlestickChart, X, SlidersHorizontal, Bookmark, Search, Plus, UserRound, History, Layers, Sparkles, Target, Mountain, Radio, Bell, MessagesSquare, Grid3X3, CircleHelp, Star, SkipForward, Play, Pause, MousePointer2, LogOut } from 'lucide-svelte';
  let chartHost: HTMLDivElement;
  let chartArea: HTMLElement;
  let vela: Vela | undefined;
  let workspace: VelaWorkspace | undefined;
  let activeCellId = 'chartA';
  let layoutId = '1';
  let symbolSync = false;
  let crosshairSync = false;
  let drawingsSync = false;
  const workspaceStateKey = 'deplyzeview.workspace.multichart.v1';
  const cellExtrasKey = 'deplyzeview.workspace.cell-extras.v1';
  const drawingSyncKey = 'deplyzeview.workspace.drawing-links.v1';
  const cellIds = ['chartA', 'chartB', 'chartC', 'chartD'];
  let cellExtrasById: Record<string, ChartExtras> = {};
  let reconcileDrawingsSync: () => void = () => {};
  let symbol = 'BTCUSDT';
  let venueId: TradeVenue = 'binance';
  let tabPrice: number | null = null;
  let tabPreviousClose: number | null = null;
  let tabQuoteRequestId = 0;
  let tabLiveRevision = 0;
  let timeframe = '1h';
  const timeframeFavoritesKey = 'deplyzeview.chart.timeframe-favorites.v1';
  let timeframeFavorites = ['1h'];
  let timeframeMenuOpen = false;
  let timeframeMenuAnchor: { cellId: string; top: number; left: number } | null = null;
  let visibleTimeframes: string[] = ['1h'];
  $: visibleTimeframes = timeframeFavorites.includes(timeframe) ? timeframeFavorites : [timeframe, ...timeframeFavorites];
  let chartStyle: ChartStyleId = 'candles';
  let appearanceOpen = false;
  let indicatorsOpen = false;
  let pineOpen = false;
  let pinePanelWidth = 50;
  let pineRestoreWidth = 50;
  let pineMaximized = false;
  let pineDragPointer: number | null = null;
  let pineEditor: PineEditor;
  let pineScripts: SavedScript[] = [];
  let pineError = '';
  function persistPine(scripts: SavedScript[]) {
    writeLibrary(window.localStorage, scripts);
    pineScripts = scripts;
  }
  function editPine(script: SavedScript) { pineOpen = true; pineMaximized = false; panelOpen = false; pineEditor.open(script); indicatorsOpen = false; }
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
  let searchTargetCellId = '';
  let panelOpen = (() => { try { return typeof window !== 'undefined' && window.localStorage.getItem(rightPanelKey) === 'open'; } catch { return false; } })();
  let watchlists = (() => { try { return readWatchlists(window.localStorage); } catch { return readWatchlists({ getItem: () => null }); } })();
  let watchlist: WatchlistItem[] = watchlists.lists.find(list => list.id === watchlists.activeId)!.items;
  let watchlistError = false;
  let watchlistQuotes: Record<string, { quote?: WatchlistQuote; error?: string }> = {};
  let watchlistQuotesLoading = false;
  let quoteRequestId = 0;
  let quoteRefreshActive = false;
  let quoteRefreshPending = false;
  let styleMenuOpen = false;
  let screenshotMenuOpen = false;
  let screenshotBusy = false;
  let screenshotError = '';
  let screenshotNotice = '';
  let screenshotNoticeTimer: ReturnType<typeof setTimeout> | undefined;
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
  type ReplayMode = 'off' | 'pick' | 'replay';
  type ReplayState = { mode: ReplayMode; start: number | null; playing: boolean; speed: 0 | 1 | 2 | 3 | 4 };
  let replayState: ReplayState = { mode: 'off', start: null, playing: false, speed: 2 };
  let replayCursorTime: number | null = null;
  let replayHoverTime: number | null = null;
  let replayHoverX: number | null = null;
  let replayDragging = false;
  let replayNotice = '';
  let replayNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  const replaySpeeds = [100, 333, 1000, 3000, 10000] as const;
  const replaySpeedLabels = ['10/s', '3/s', '1/s', '1/3s', '1/10s'];
  const tabs = ['General', 'Profile', 'Imbalance', 'Color', 'Advanced'];
  const modes: { id: FootprintMode; name: string; hint: string }[] = [
    { id: 'split', name: 'Split Bar', hint: 'Bid and ask volume side by side' },
    { id: 'delta', name: 'Delta', hint: 'Net aggressor volume per price level' },
    { id: 'total', name: 'Total Volume', hint: 'Combined traded volume per level' }
  ];
  const intervals = ['1m', '5m', '15m', '1h', '4h', '1D'];
  onMount(() => {
    try {
      const storedTimeframes = JSON.parse(window.localStorage.getItem(timeframeFavoritesKey) ?? 'null');
      if (Array.isArray(storedTimeframes)) timeframeFavorites = intervals.filter(interval => storedTimeframes.includes(interval));
    } catch { /* Keep the selected timeframe as the sole quick-access interval. */ }
    try { pineScripts = readLibrary(window.localStorage); } catch(error) { pineError = String(error); }
    const layouts = [
      { id: 'deplyze-3', label: 'Three charts', cols: [1, 1], rows: [1, 1], areas: ['main main', 'left right'], cells: [{ id: 'c1', area: 'main' }, { id: 'c2', area: 'left' }, { id: 'c3', area: 'right' }] },
    ];
    for (const definition of layouts) registerLayout(definition);
    let savedWorkspace = false;
    let savedLegacy: ReturnType<typeof readPreferences>;
    try {
      savedWorkspace = !!window.localStorage.getItem(workspaceStateKey);
      savedLegacy = readPreferences(window.localStorage);
      const storedExtras = JSON.parse(window.localStorage.getItem(cellExtrasKey) ?? '{}');
      if (storedExtras && typeof storedExtras === 'object' && !Array.isArray(storedExtras)) cellExtrasById = storedExtras as Record<string, ChartExtras>;
    } catch { persistenceError = true; }
    const initialTheme = savedLegacy?.extras.theme ?? 'dark';
    try { drawingsSync = window.localStorage.getItem(drawingSyncKey) === '1'; } catch { persistenceError = true; }
    const providers = Object.fromEntries(['binance', 'coinbase', 'hyperliquid', 'oanda', 'narwhal', 'finzdata'].map(provider => [provider, () => new RustMarketDataProvider(provider as TradeVenue)]));
    const mountedWorkspace = new VelaWorkspace(chartHost, {
      layout: '1',
      cells: Object.fromEntries(cellIds.map((id, index) => [id, { symbol: index === 0 ? chartSymbol() : 'BINANCE:BTCUSDT', timeframe: index === 0 ? timeframeCode(timeframe) : '60' }])),
      symbol: chartSymbol(), timeframe: timeframeCode(timeframe), bars: 500, live: true,
      theme: initialTheme, upColor: '#8a746e', downColor: '#c16f61', currentPriceLine: true,
      volume: true, drawings: { toolbar: false }, animations: { intro: false, zoom: true, pan: true },
      providers, engines: { 'deplyze-pine': () => new NativePineEngine() },
      statusline: true, watermark: false, bottombar: false, topbar: { left: [], right: [] },
      drawingToolbar: false, sync: {}, maxWebglCells: 4, layoutMode: 'desktop', autofocus: false,
      persist: workspaceStateKey,
    });
    workspace = mountedWorkspace;
    layoutId = mountedWorkspace.layout.id;
    const defaultConfig = (chart: Vela) => {
      chart.renderer.set({ settings: false, attribution: false });
      const config = chart.renderer.getConfig() as ChartConfig;
      config.candles = { ...config.candles, ...defaultCandleColors };
      config.timeScale.timezone = defaultTimezone;
      config.layout.background = '#101114';
      config.layout.textColor = '#a3a5ab';
      config.grid.vertLines.color = '#25272d';
      config.grid.horzLines.color = '#25272d';
      config.priceScale.borderColor = 'transparent';
      config.panes.separatorColor = 'transparent';
      return config;
    };
    defaultAppearance = defaultConfig(mountedWorkspace.chart);
    function applyCellExtras(chart: Vela, value: ChartExtras) {
      const { visible, ...inputs } = value.volume;
      const volume = chart.indicators().find(indicator => indicator.nativeType === 'volume') ?? chart.addNativeIndicator('volume');
      volume.setInputs(inputs);
      volume.setVisible(visible);
      chart.renderer.set('crosshairOverride', {
        vertical: value.crosshair === 'both' || value.crosshair === 'vertical',
        horizontal: value.crosshair === 'both' || value.crosshair === 'horizontal',
      });
    }
    const cellDisposers = new Map<string, () => void>();
    const saveCellTimer = new Map<string, ReturnType<typeof setTimeout>>();
    const drawingLinks = new Map<string, Map<string, string>>();
    let drawingSyncBusy = false;
    const drawingLinkKey = (cellId: string, drawingId: string) => `${cellId}\0${drawingId}`;
    const instrumentIdentity = (chart: Vela) => String(chart.market.symbol ?? '').trim().toUpperCase();
    const linkedDrawing = (cellId: string, drawingId: string) => drawingLinks.get(drawingLinkKey(cellId, drawingId));
    function rememberDrawingLink(group: Map<string, string>) {
      for (const [cellId, drawingId] of group) drawingLinks.set(drawingLinkKey(cellId, drawingId), group);
    }
    function syncDrawingCreated(originId: string, drawingId: string) {
      if (!drawingsSync || drawingSyncBusy || !workspace) return;
      const origin = workspace.cell(originId);
      const doc = origin?.chart.drawings.all().find(drawing => drawing.id === drawingId);
      if (!origin || !doc || doc.paneId !== 'price') return;
      const identity = instrumentIdentity(origin.chart);
      if (!identity) return;
      const group = new Map<string, string>([[originId, drawingId]]);
      drawingSyncBusy = true;
      try {
        for (const peer of workspace.cells()) {
          if (peer.id === originId || instrumentIdentity(peer.chart) !== identity) continue;
          const copy = peer.chart.drawings.add(doc.type, { paneId: 'price', anchors: doc.anchors, style: doc.style, text: doc.text, props: doc.props });
          if (copy) group.set(peer.id, copy.id);
        }
        if (group.size > 1) rememberDrawingLink(group);
      } finally { drawingSyncBusy = false; }
    }
    function syncDrawingEdited(originId: string, drawingId: string) {
      if (!drawingsSync || drawingSyncBusy || !workspace) return;
      const group = linkedDrawing(originId, drawingId);
      const doc = workspace.cell(originId)?.chart.drawings.all().find(drawing => drawing.id === drawingId);
      if (!group || !doc || doc.paneId !== 'price') return;
      drawingSyncBusy = true;
      try {
        for (const [peerId, peerDrawingId] of group) {
          if (peerId === originId) continue;
          const peer = workspace.cell(peerId);
          if (peer && instrumentIdentity(peer.chart) === instrumentIdentity(workspace.cell(originId)!.chart)) {
            peer.chart.drawings.update(peerDrawingId, { anchors: doc.anchors, style: doc.style, text: doc.text, props: doc.props });
          }
        }
      } finally { drawingSyncBusy = false; }
    }
    function syncDrawingRemoved(originId: string, drawingId: string) {
      if (drawingSyncBusy || !workspace) return;
      const group = linkedDrawing(originId, drawingId);
      if (!group) return;
      drawingSyncBusy = true;
      try {
        if (drawingsSync) for (const [peerId, peerDrawingId] of group) {
          if (peerId === originId) continue;
          const peer = workspace.cell(peerId);
          const origin = workspace.cell(originId);
          if (peer && origin && instrumentIdentity(peer.chart) === instrumentIdentity(origin.chart)) peer.chart.drawings.remove(peerDrawingId);
        }
        for (const [cellId, peerDrawingId] of group) drawingLinks.delete(drawingLinkKey(cellId, peerDrawingId));
      } finally { drawingSyncBusy = false; }
    }
    reconcileDrawingsSync = () => {
      if (drawingsSync && workspace) workspace.sync.set('drawings', false);
    };
    function saveCellState(id: string, chart: Vela, current: ChartExtras) {
      cellExtrasById[id] = structuredClone(current);
      try { window.localStorage.setItem(cellExtrasKey, JSON.stringify(cellExtrasById)); } catch { persistenceError = true; }
      if (chart === mountedWorkspace.chart) {
        try { persistenceError = !writePreferences(window.localStorage, chart.renderer.getConfig() as ChartConfig, current); }
        catch { persistenceError = true; }
      }
    }
    function syncActiveCell() {
      const cell = mountedWorkspace.active;
      const chart = cell.chart;
      activeCellId = cell.id;
      vela = chart;
      const rawMarket = String(chart.market.symbol ?? cell.symbol ?? chartSymbol());
      const pieces = rawMarket.split(':');
      const provider = pieces.length > 1 ? pieces[0].toLowerCase() : venueId;
      venueId = provider as TradeVenue;
      symbol = pieces.length > 1 ? pieces.slice(1).join(':') : pieces[0];
      venue = providerTitle(venueId);
      setTradeVenue(venueId);
      const interval = cell.timeframe;
      timeframe = interval === '60' ? '1h' : interval === '240' ? '4h' : interval === '1D' || interval === 'D' ? '1D' : `${interval}m`;
      const config = chart.renderer.getConfig() as ChartConfig;
      appearance = config;
      timezone = config.timeScale.timezone ?? defaultTimezone;
      if (isChartStyle(config.series.style)) chartStyle = config.series.style;
      setPriceAppearance(config.candles);
      extras = structuredClone(cellExtrasById[cell.id] ?? (cell.id === 'chartA' && savedLegacy && !savedWorkspace ? savedLegacy.extras : defaultExtras));
      appliedTheme = extras.theme;
      tabQuoteRequestId++;
      tabPrice = null;
      tabPreviousClose = null;
      tabLiveRevision++;
      feedHealth = undefined;
      status = `Loading · ${venue}`;
      void refreshSymbolTabQuote();
      updateDrawingSync();
    }
    async function refreshSymbolTabQuote() {
      const requestId = ++tabQuoteRequestId;
      const requestedSymbol = symbol;
      const requestedVenue = venueId;
      const requestedCell = activeCellId;
      const liveRevision = tabLiveRevision;
      try {
        const bars = await new RustMarketDataProvider(requestedVenue).getBars(requestedSymbol, '1D', { limit: 3 });
        if (requestId !== tabQuoteRequestId || requestedSymbol !== symbol || requestedVenue !== venueId || requestedCell !== activeCellId) return;
        const latest = bars[bars.length - 1];
        const previous = bars[bars.length - 2];
        tabPreviousClose = previous && Number.isFinite(previous.close) ? previous.close : null;
        if (tabLiveRevision === liveRevision) tabPrice = latest && Number.isFinite(latest.close) ? latest.close : null;
      } catch { /* The chart feed remains the source of live tab prices. */ }
    }
    function attachCell(id: string) {
      const cell = mountedWorkspace.cell(id);
      if (!cell || cellDisposers.has(id)) return;
      const chart = cell.chart;
      const statuslineSymbol = cell.host.querySelector<HTMLElement>('.vela-statusline .vela-sl-symbol');
      const statuslineMeta = cell.host.querySelector<HTMLElement>('.vela-statusline .vela-sl-meta');
      const openStatuslineSearch = () => openSymbolSearchForCell(id);
      const openStatuslineTimeframes = () => {
        const anchor = timeframeMenuPosition(id);
        if (!anchor) return;
        const shouldClose = timeframeMenuOpen && timeframeMenuAnchor?.cellId === id;
        cell.focus();
        styleMenuOpen = false;
        if (shouldClose) { timeframeMenuOpen = false; timeframeMenuAnchor = null; return; }
        setTimeout(() => { timeframeMenuAnchor = anchor; timeframeMenuOpen = true; }, 0);
      };
      const onStatuslineKeydown = (action: () => void) => (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        action();
      };
      const onStatuslineSymbolKeydown = onStatuslineKeydown(openStatuslineSearch);
      const onStatuslineMetaKeydown = onStatuslineKeydown(openStatuslineTimeframes);
      if (statuslineSymbol) {
        statuslineSymbol.setAttribute('role', 'button');
        statuslineSymbol.setAttribute('tabindex', '0');
        statuslineSymbol.setAttribute('aria-label', `Search markets for chart ${id}`);
        statuslineSymbol.title = 'Search markets for this chart';
        statuslineSymbol.addEventListener('click', openStatuslineSearch);
        statuslineSymbol.addEventListener('keydown', onStatuslineSymbolKeydown);
      }
      if (statuslineMeta) {
        statuslineMeta.setAttribute('role', 'button');
        statuslineMeta.setAttribute('tabindex', '0');
        statuslineMeta.setAttribute('aria-label', `Choose timeframe for chart ${id}`);
        statuslineMeta.title = 'Choose timeframe for this chart';
        statuslineMeta.addEventListener('click', openStatuslineTimeframes);
        statuslineMeta.addEventListener('keydown', onStatuslineMetaKeydown);
      }
      chart.drawings.showToolbar(false);
      if (!savedWorkspace) chart.renderer.applyConfig(id === 'chartA' && savedLegacy ? savedLegacy.config : defaultConfig(chart));
      else if (cellExtrasById[id]) applyCellExtras(chart, cellExtrasById[id]);
      let customDraft: unknown = null;
      let customSelection: string[] = [];
      const syncCustomDrawings = () => pushCustomDrawingData(chart.renderer, chart, customDraft, customSelection);
      const offCustomCreated = chart.on('drawing:created', syncCustomDrawings);
      const offCustomEdited = chart.on('drawing:edited', syncCustomDrawings);
      const offCustomRemoved = chart.on('drawing:removed', syncCustomDrawings);
      const offCustomDraft = chart.on('drawing:draft', ({ doc }) => { customDraft = doc; syncCustomDrawings(); });
      const offCustomSelection = chart.on('drawing:selected', ({ ids }) => { customSelection = ids; syncCustomDrawings(); });
      const offDrawingCreated = chart.on('drawing:created', ({ id: drawingId }) => syncDrawingCreated(id, drawingId));
      const offDrawingEdited = chart.on('drawing:edited', ({ id: drawingId }) => syncDrawingEdited(id, drawingId));
      const offDrawingRemoved = chart.on('drawing:removed', ({ id: drawingId }) => syncDrawingRemoved(id, drawingId));
      const syncAppearance = () => {
        const config = chart.renderer.getConfig() as ChartConfig;
        const current = structuredClone(cellExtrasById[id] ?? (id === 'chartA' && savedLegacy && !savedWorkspace ? savedLegacy.extras : defaultExtras));
        const volume = chart.indicators().find(indicator => indicator.nativeType === 'volume');
        if (volume) {
          const inputs = volume.inputValues();
          current.volume = {
            visible: volume.visible,
            upColor: typeof inputs.upColor === 'string' ? inputs.upColor : current.volume.upColor,
            downColor: typeof inputs.downColor === 'string' ? inputs.downColor : current.volume.downColor,
            heightPct: typeof inputs.heightPct === 'number' ? inputs.heightPct : current.volume.heightPct,
          };
        } else current.volume = { ...current.volume, visible: false };
        cellExtrasById[id] = current;
        if (chart === mountedWorkspace.chart) {
          appearance = config;
          timezone = config.timeScale.timezone ?? defaultTimezone;
          if (isChartStyle(config.series.style)) chartStyle = config.series.style;
          setPriceAppearance(config.candles);
          extras = current;
        }
        clearTimeout(saveCellTimer.get(id));
        saveCellTimer.set(id, setTimeout(() => saveCellState(id, chart, current), 180));
      };
      const offConfig = chart.renderer.onConfigChanged(syncAppearance);
      const offStyle = chart.on('price-style:changed', syncAppearance);
      const offVolumeInputs = chart.on('indicator:inputs', syncAppearance);
      const offVolumeVisibility = chart.on('indicator:visibility', syncAppearance);
      const offVolumeRemoved = chart.on('indicator:removed', syncAppearance);
      const offTabBar = chart.on('bar', bar => {
        if (chart !== mountedWorkspace.chart || !Number.isFinite(bar.close)) return;
        tabLiveRevision++;
        tabPrice = bar.close;
      });
      const offTabLoad = chart.on('load:end', () => { if (chart === mountedWorkspace.chart) void refreshSymbolTabQuote(); });
      const offMarket = chart.on('market:changed', () => {
        updateDrawingSync();
        if (chart === mountedWorkspace.chart) syncActiveCell();
      });
      const syncReplay = () => {
        if (chart !== vela) return;
        const next = chart.replay.state;
        replayCursorTime = next.cursorTime;
        replayState = { ...replayState, mode: next.active ? 'replay' : replayState.mode === 'pick' ? 'pick' : 'off', playing: next.playing };
      };
      const offReplayStart = chart.on('replay:start', (event) => { if (chart === vela) { replayCursorTime = (event as { cursorTime?: number }).cursorTime ?? null; syncReplay(); } });
      const offReplayStep = chart.on('replay:step', (event) => { if (chart === vela) { replayCursorTime = (event as { cursorTime?: number }).cursorTime ?? null; syncReplay(); } });
      const offReplayPlay = chart.on('replay:play', syncReplay);
      const offReplayPause = chart.on('replay:pause', syncReplay);
      const offReplayClick = chart.renderer.onClick((event) => { if (chart === vela && replayState.mode === 'pick' && event.time != null) void startReplayAt(event.time); });
      const offReplayCrosshair = chart.renderer.onCrosshairMove((event) => { if (chart === vela && replayState.mode === 'pick') replayHoverTime = event.time; });
      const offReplayEnd = chart.on('replay:end', (event) => { if (chart !== vela) return; syncReplay(); const reason = (event as { reason?: string }).reason; if (reason === 'finished') showReplayNotice('Last bar reached'); else if (reason === 'stopped') replayState = { ...replayState, mode: 'off', playing: false, start: null }; });
      syncCustomDrawings();
      syncAppearance();
      if (id === 'chartA' && !savedWorkspace && savedLegacy) applyCellExtras(chart, savedLegacy.extras);
      cellDisposers.set(id, () => {
        offCustomCreated(); offCustomEdited(); offCustomRemoved(); offCustomDraft(); offCustomSelection();
        offConfig(); offStyle(); offVolumeInputs(); offVolumeVisibility(); offVolumeRemoved(); offTabBar(); offTabLoad(); offMarket(); offReplayStart(); offReplayStep(); offReplayPlay(); offReplayPause(); offReplayClick(); offReplayCrosshair(); offReplayEnd();
        offDrawingCreated(); offDrawingEdited(); offDrawingRemoved();
        statuslineSymbol?.removeEventListener('click', openStatuslineSearch);
        statuslineSymbol?.removeEventListener('keydown', onStatuslineSymbolKeydown);
        statuslineMeta?.removeEventListener('click', openStatuslineTimeframes);
        statuslineMeta?.removeEventListener('keydown', onStatuslineMetaKeydown);
        clearTimeout(saveCellTimer.get(id));
        saveCellTimer.delete(id);
      });
    }
    for (const cell of mountedWorkspace.cells()) attachCell(cell.id);
    syncActiveCell();
    symbolSync = !!mountedWorkspace.sync.get('symbol');
    crosshairSync = !!mountedWorkspace.sync.get('crosshair');
    reconcileDrawingsSync();
    const offActive = mountedWorkspace.on('cell:active', syncActiveCell);
    const offCreated = mountedWorkspace.on('cell:created', ({ id }) => { attachCell(id); updateDrawingSync(); });
    const offDestroyed = mountedWorkspace.on('cell:destroyed', ({ id }) => { cellDisposers.get(id)?.(); cellDisposers.delete(id); updateDrawingSync(); });
    const offLayout = mountedWorkspace.on('layout:changed', ({ layout }) => { layoutId = layout; syncActiveCell(); });
    const flushPreferences = () => {
      for (const [id, timer] of saveCellTimer) { clearTimeout(timer); const cell = mountedWorkspace.cell(id); if (cell) saveCellState(id, cell.chart, cellExtrasById[id] ?? extras); }
      saveAppearance();
    };
    window.addEventListener('pagehide', flushPreferences);
    if (!savedWorkspace && savedLegacy) {
      mountedWorkspace.setTheme(savedLegacy.extras.theme);
      applyCellExtras(mountedWorkspace.chart, savedLegacy.extras);
      extras = savedLegacy.extras;
    }
    mountedWorkspace.chart.ready().then(() => status = ['oanda','narwhal','finzdata'].includes(venueId) ? `Market data · ${venue}` : `Live · ${venue}`).catch(() => status = 'Unable to load market data');
    let removeFeedHealth: (() => void) | undefined;
    if ('__TAURI_INTERNALS__' in window) import('@tauri-apps/api/event').then(({ listen }) => listen<FeedHealth>('feed-health', (event) => { if (event.payload.venue !== venueId || event.payload.instrument !== symbol) return; feedHealth = event.payload; status = event.payload.status === 'live' ? `Live · ${venue}` : `${event.payload.status} · ${venue}`; })).then((remove) => { removeFeedHealth = remove; });
    const timer = window.setInterval(() => clock = new Date(), 1000);
    const quoteTimer = window.setInterval(() => { if (panelOpen) void refreshWatchlistQuotes(); }, 30_000);
    if (panelOpen && watchlist.length) void refreshWatchlistQuotes();
    return () => {
      quoteRequestId++; flushPreferences(); window.removeEventListener('pagehide', flushPreferences);
      offActive(); offCreated(); offDestroyed(); offLayout();
      for (const dispose of cellDisposers.values()) dispose();
      cellDisposers.clear(); removeFeedHealth?.(); clearInterval(timer); clearInterval(quoteTimer);
      mountedWorkspace.destroy(); workspace = undefined; vela = undefined;
    };
  });
  function openPlaceholderTool(name: string) { console.info(name + ' coming soon.'); }
  function activeChartHost() {
    return (workspace?.active as unknown as { host?: HTMLElement } | undefined)?.host ?? null;
  }
  async function captureChartImage() {
    const host = activeChartHost();
    if (!host) throw new Error('Chart is not ready');
    return captureChartPng(host, 2.5, vela?.renderer as unknown as { canvasPile?: () => Array<HTMLCanvasElement | null | undefined> } | undefined);
  }
  function showScreenshotNotice(message: string) {
    clearTimeout(screenshotNoticeTimer);
    screenshotNotice = message;
    screenshotNoticeTimer = setTimeout(() => { screenshotNotice = ''; }, 1400);
  }
  async function copyChartImage() {
    screenshotBusy = true; screenshotError = '';
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard is unavailable');
      const blob = await captureChartImage();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      screenshotMenuOpen = false;
      showScreenshotNotice('Chart copied');
    } catch (error) { screenshotError = error instanceof Error ? error.message : 'Unable to copy chart image'; }
    finally { screenshotBusy = false; }
  }
  async function downloadChartImage() {
    screenshotBusy = true; screenshotError = '';
    try {
      const blob = await captureChartImage();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `deplyzeview-${symbol.toUpperCase()}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      screenshotMenuOpen = false;
      showScreenshotNotice('Chart downloaded');
    } catch (error) { screenshotError = error instanceof Error ? error.message : 'Unable to download chart image'; }
    finally { screenshotBusy = false; }
  }
  function trackWorkspaceDockWidth(node: HTMLElement) {
    const shell = node.closest('.app-shell') as HTMLElement | null;
    const update = () => shell?.style.setProperty('--workspace-dock-width', shell?.querySelector('.chart-layout')?.classList.contains('pine-open') ? '38px' : node.getBoundingClientRect().width + 'px');
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    return { destroy() { observer.disconnect(); shell?.style.removeProperty('--workspace-dock-width'); } };
  }
  function timeframeCode(value: string) { return value === '1D' ? '1D' : value === '1h' ? '60' : value === '4h' ? '240' : value.slice(0, -1); }
  function openSymbolSearchForCell(id: string) {
    if (!workspace?.cell(id)) return;
    timeframeMenuOpen = false;
    timeframeMenuAnchor = null;
    searchTargetCellId = id;
    workspace.cell(id)?.focus();
    searchOpen = true;
  }
  function closeSymbolSearch() { searchOpen = false; searchTargetCellId = ''; }
  function chooseTimeframe(value: string) {
    timeframe = value;
    if (!timeframeFavorites.includes(value)) {
      timeframeFavorites = [...timeframeFavorites, value];
      saveTimeframeFavorites();
    }
    timeframeMenuOpen = false;
    timeframeMenuAnchor = null;
    workspace?.active.setTimeframe(timeframeCode(value));
  }
  function timeframeMenuPosition(cellId: string) {
    const meta = workspace?.cell(cellId)?.host.querySelector<HTMLElement>('.vela-statusline .vela-sl-meta');
    if (!meta) return null;
    const rect = meta.getBoundingClientRect();
    return {
      cellId,
      top: Math.max(4, Math.min(rect.bottom + 5, window.innerHeight - 246)),
      left: Math.max(4, Math.min(rect.left, window.innerWidth - 198)),
    };
  }
  function repositionTimeframeMenu() {
    if (!timeframeMenuAnchor) return;
    const next = timeframeMenuPosition(timeframeMenuAnchor.cellId);
    if (next) timeframeMenuAnchor = next;
    else { timeframeMenuOpen = false; timeframeMenuAnchor = null; }
  }
  function saveTimeframeFavorites() {
    try { window.localStorage.setItem(timeframeFavoritesKey, JSON.stringify(timeframeFavorites)); } catch { /* Keep favorites available for this session. */ }
  }
  function toggleTimeframeFavorite(value: string) {
    timeframeFavorites = timeframeFavorites.includes(value) ? timeframeFavorites.filter(interval => interval !== value) : [...timeframeFavorites, value];
    saveTimeframeFavorites();
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
    workspace?.active.setPriceStyle(style);
  }
  function chooseWorkspaceLayout(id: string) {
    if (!workspace) return;
    if (id !== '1' && replayState.mode !== 'off') replayStop();
    timeframeMenuOpen = false;
    timeframeMenuAnchor = null;
    workspace.setLayout(id);
    layoutId = id;
  }
  function setSymbolSync(enabled: boolean) {
    symbolSync = enabled;
    workspace?.sync.set('symbol', enabled ? Object.fromEntries(cellIds.map(id => [id, 'linked'])) : false);
  }
  function setCrosshairSync(enabled: boolean) {
    crosshairSync = enabled;
    workspace?.sync.set('crosshair', enabled ? Object.fromEntries(cellIds.map(id => [id, 'linked'])) : false);
  }
  function updateDrawingSync() {
    reconcileDrawingsSync();
  }
  function setDrawingsSync(enabled: boolean) {
    drawingsSync = enabled;
    try { window.localStorage.setItem(drawingSyncKey, enabled ? '1' : '0'); } catch { persistenceError = true; }
    updateDrawingSync();
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
    cellExtrasById[activeCellId] = structuredClone(value);
    try { window.localStorage.setItem(cellExtrasKey, JSON.stringify(cellExtrasById)); } catch { persistenceError = true; }
    if (appliedTheme !== value.theme) {
      // Theme the renderer's own menus/legends/drawing controls while retaining
      // the complete user configuration, including a custom plot background.
      workspace?.setTheme(value.theme);
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
    const targetId = searchTargetCellId || workspace?.active.id || activeCellId;
    const targetCell = workspace?.cell(targetId);
    targetCell?.focus();
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
    searchTargetCellId = '';
    feedHealth = undefined;
    status = `Loading · ${venue}`;
    if (workspace) {
      try {
        targetCell?.setSymbol(`${provider}:${item.symbol}`);
        if (provider === 'narwhal' || provider === 'finzdata') targetCell?.setTimeframe('1D');
      }
      catch (error) { status = `Unable to load ${item.symbol} · ${String(error)}`; }
    }
  }
  function saveWatchlist(items: WatchlistItem[]) {
    watchlist = items;
    watchlists = { ...watchlists, lists: watchlists.lists.map(list => list.id === watchlists.activeId ? { ...list, items } : list) };
    persistWatchlists();
  }
  function persistWatchlists() {
    try {
      window.localStorage.setItem(watchlistsKey, JSON.stringify(watchlists));
      watchlistError = !writeWatchlist(window.localStorage, watchlists.lists.find(list => list.id === 'default')?.items ?? []);
    } catch { watchlistError = true; }
  }
  function switchWatchlist(id: string) {
    const list = watchlists.lists.find(list => list.id === id);
    if (!list) return;
    quoteRequestId++;
    watchlists = { ...watchlists, activeId: id };
    watchlist = list.items;
    watchlistQuotesLoading = false;
    persistWatchlists();
    void refreshWatchlistQuotes();
  }
  function createWatchlist(name: string) {
    const id = crypto.randomUUID();
    watchlists = { ...watchlists, lists: [...watchlists.lists, { id, name, items: [] }] };
    switchWatchlist(id);
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
          else watchlistQuotes = { ...watchlistQuotes, [item.identity]: { ...watchlistQuotes[item.identity], error: 'No recent daily bars were returned' } };
        } catch (error) {
          if (requestId === quoteRequestId) watchlistQuotes = { ...watchlistQuotes, [item.identity]: { ...watchlistQuotes[item.identity], error: String(error) } };
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
  function togglePineEditor() {
    if (pineOpen) { pineOpen = false; pineMaximized = false; return; }
    pineOpen = true; pineMaximized = false; panelOpen = false;
  }
  function togglePineMaximize() {
    if (pineMaximized) { pineMaximized = false; pinePanelWidth = pineRestoreWidth; }
    else { pineRestoreWidth = pinePanelWidth; pineMaximized = true; }
  }
  function setPinePanelWidth(next: number) {
    const layout = chartArea?.closest<HTMLElement>('.chart-layout');
    if (!layout) return;
    const handle = layout.querySelector<HTMLElement>('.pine-resizer');
    const layoutBounds = layout.getBoundingClientRect();
    const chartLeft = chartArea.getBoundingClientRect().left - layoutBounds.left;
    const available = Math.max(1, layoutBounds.width - chartLeft - (handle?.getBoundingClientRect().width ?? 8));
    const minPanel = Math.min(360, available * .38);
    const maxPanel = Math.max(minPanel, available - Math.min(320, available * .38));
    const panelPixels = Math.max(minPanel, Math.min(maxPanel, available * next / 100));
    pinePanelWidth = panelPixels / available * 100;
  }
  function startPineResize(event: PointerEvent) {
    if (event.button !== 0 || pineMaximized) return;
    event.preventDefault();
    pineDragPointer = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    movePineResize(event);
  }
  function movePineResize(event: PointerEvent) {
    if (pineDragPointer !== event.pointerId) return;
    const layout = chartArea?.closest<HTMLElement>('.chart-layout');
    if (!layout) return;
    const handle = layout.querySelector<HTMLElement>('.pine-resizer');
    const bounds = layout.getBoundingClientRect();
    const chartLeft = chartArea.getBoundingClientRect().left - bounds.left;
    const available = Math.max(1, bounds.width - chartLeft - (handle?.getBoundingClientRect().width ?? 8));
    const panelPixels = bounds.right - event.clientX - (handle?.getBoundingClientRect().width ?? 8) / 2;
    setPinePanelWidth(panelPixels / available * 100);
  }
  function endPineResize(event: PointerEvent) {
    if (pineDragPointer !== event.pointerId) return;
    pineDragPointer = null;
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }
  function keyPineResize(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setPinePanelWidth(pinePanelWidth + (event.key === 'ArrowLeft' ? 2 : -2));
    } else if (event.key === 'Home') { event.preventDefault(); setPinePanelWidth(62); }
    else if (event.key === 'End') { event.preventDefault(); setPinePanelWidth(38); }
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
  function showReplayNotice(message: string) {
    replayNotice = message;
    clearTimeout(replayNoticeTimer);
    replayNoticeTimer = setTimeout(() => replayNotice = '', 2400);
  }
  function replayAvailable() { return layoutId === '1' && !!vela; }
  function beginReplayPick() {
    if (!replayAvailable()) return;
    replayState = { ...replayState, mode: 'pick', playing: false };
    replayHoverTime = null;
    replayHoverX = null;
    replayNotice = '';
  }
  function replayStop() {
    vela?.replay.stop();
    replayState = { ...replayState, mode: 'off', start: null, playing: false };
    replayCursorTime = null;
    replayHoverTime = null;
    replayHoverX = null;
    replayDragging = false;
  }
  async function startReplayAt(time: number) {
    if (!replayAvailable() || replayState.mode !== 'pick' || !vela) return;
    const bounds = vela.replay.bounds;
    if (!bounds || time >= bounds.last) { showReplayNotice('Choose an earlier bar to start replay'); return; }
    try {
      await vela.replay.start({ from: time });
      if (!vela.replay.state.active) throw new Error('Replay did not become active');
      replayState = { ...replayState, mode: 'replay', start: time, playing: vela.replay.state.playing };
    }
    catch { replayState = { ...replayState, mode: 'pick', playing: false }; showReplayNotice('Replay history is unavailable for this range'); }
  }
  function replayStep() { if (replayState.mode === 'replay') vela?.replay.step(); }
  function replayToggle() {
    if (!vela || replayState.mode !== 'replay') return;
    if (vela.replay.state.playing) vela.replay.pause();
    else if (vela.replay.state.remaining > 0) vela.replay.play(replaySpeeds[replayState.speed]);
  }
  function replaySelectBar() {
    if (vela && replayState.mode === 'replay') { vela.replay.pause(); replayState = { ...replayState, mode: 'pick', playing: false }; }
  }
  function replaySetSpeed(index: number) {
    replayState = { ...replayState, speed: index as ReplayState['speed'] };
    if (vela?.replay.state.playing) vela.replay.play(replaySpeeds[index as ReplayState['speed']]);
  }
  function onReplayPointerMove(event: PointerEvent) {
    if (replayState.mode !== 'pick') return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    replayHoverX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  }
  function onReplayPointerDown(event: PointerEvent) {
    if (replayState.mode !== 'pick' || event.button !== 0) return;
    replayDragging = true;
  }
  function onReplayPointerUp(event: PointerEvent) {
    if (!replayDragging) return;
    replayDragging = false;
    if (replayHoverTime != null) void startReplayAt(replayHoverTime);
  }
  function onReplayPointerCancel() {
    replayDragging = false;
  }
  function onReplayPointerLeave() { if (replayState.mode === 'pick' && !replayDragging) { replayHoverX = null; replayHoverTime = null; } }
  function onReplayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && (replayState.mode === 'pick' || replayState.mode === 'replay')) { event.preventDefault(); replayStop(); }
    else if (event.shiftKey && event.key === 'ArrowRight') { event.preventDefault(); replayStep(); }
    else if (event.shiftKey && event.key === 'ArrowDown') { event.preventDefault(); replayToggle(); }
  }
</script>
<svelte:window onkeydown={(event) => { onReplayKeydown(event); if (event.key === 'Escape') { if (styleMenuOpen) { styleMenuOpen = false; document.querySelector<HTMLButtonElement>('.chart-style')?.focus(); } if (timeframeMenuOpen) { const anchor = timeframeMenuAnchor; timeframeMenuOpen = false; timeframeMenuAnchor = null; if (anchor) workspace?.cell(anchor.cellId)?.host.querySelector<HTMLElement>('.vela-statusline .vela-sl-meta')?.focus(); else document.querySelector<HTMLButtonElement>('.timeframe-picker-trigger')?.focus(); } rangePickerOpen = false; timezonePickerOpen = false; screenshotMenuOpen = false; } }} onclick={(event) => { const target = event.target as Element; if (!target.closest('.style-picker')) styleMenuOpen = false; if (!target.closest('.timeframe-picker')) { timeframeMenuOpen = false; timeframeMenuAnchor = null; } if (!target.closest('.range-picker-anchor')) rangePickerOpen = false; if (!target.closest('.clock-control')) timezonePickerOpen = false; if (!target.closest('.screenshot-picker')) screenshotMenuOpen = false; }} onresize={repositionTimeframeMenu}/>
<svelte:head><title>DeplyzeView — {symbol}</title></svelte:head>
<div class="app-shell" data-theme={extras.theme}>
  <header class="titlebar" data-tauri-drag-region><SymbolTabBar tabs={[{ id: chartSymbol(), symbol, price: tabPrice, percentChange: tabPrice !== null && tabPreviousClose !== null && tabPreviousClose !== 0 ? ((tabPrice - tabPreviousClose) / tabPreviousClose) * 100 : null, icon: vela?.data.symbolIcon(chartSymbol()) }]} activeTabId={chartSymbol()} onAdd={() => console.info('Multi-tab coming soon.')}/><div class="window-controls"><button aria-label="Minimize" onclick={() => windowAction('minimize')}><Minus size={12}/></button><button aria-label="Maximize" onclick={() => windowAction('maximize')}><Square size={10}/></button><button class="close" aria-label="Close" onclick={() => windowAction('close')}><X size={12}/></button></div></header>
  <nav class="topbar">
    <div class="market-identity">
      <button class="profile-avatar" type="button" aria-label="Profile settings coming soon" title="Profile settings coming soon" onclick={() => console.info('Profile settings coming soon.')}><UserRound size={16}/></button>
      <div class="market-selector">
        <button class="symbol-button" aria-label="Search markets, current {symbol} from {venue}" onclick={() => openSymbolSearchForCell(workspace?.active.id ?? activeCellId)}><span class="symbol-line"><span>{symbol}</span><Search size={12}/></span><span class="exchange">{venue}</span></button>
      </div>
    </div>
    <div class="top-divider"></div><div class="timeframes" aria-label="Favorite timeframes">{#each visibleTimeframes as interval}<button class:chosen={timeframe === interval} aria-pressed={timeframe === interval} title={`Select ${interval}`} onclick={() => chooseTimeframe(interval)}>{interval}</button>{/each}<div class="timeframe-picker"><button class="more-time timeframe-picker-trigger" type="button" aria-label="Choose timeframe" aria-haspopup="true" aria-expanded={timeframeMenuOpen} title="Choose or favorite timeframes" onclick={() => { timeframeMenuAnchor = null; timeframeMenuOpen = !timeframeMenuOpen; }}><ChevronDown size={11}/></button>{#if timeframeMenuOpen}<div class="timeframe-menu" class:timeframe-menu-cell-anchored={timeframeMenuAnchor !== null} style={`--timeframe-menu-top:${timeframeMenuAnchor?.top ?? 0}px;--timeframe-menu-left:${timeframeMenuAnchor?.left ?? 0}px`} role="group" aria-label="Available timeframes"><div class="timeframe-menu-heading"><strong>Timeframe</strong><small>Choose one or star favorites</small></div>{#each intervals as interval}<div class="timeframe-option"><button class:interval-current={timeframe === interval} class="timeframe-choice" type="button" aria-pressed={timeframe === interval} onclick={() => chooseTimeframe(interval)}><span>{interval}</span>{#if timeframe === interval}<small>Current</small>{/if}</button><button class="timeframe-favorite" class:favorite-active={timeframeFavorites.includes(interval)} type="button" aria-label={timeframeFavorites.includes(interval) ? `Remove ${interval} from favorites` : `Add ${interval} to favorites`} aria-pressed={timeframeFavorites.includes(interval)} title={timeframeFavorites.includes(interval) ? 'Remove favorite' : 'Add favorite'} onclick={(event) => { event.stopPropagation(); toggleTimeframeFavorite(interval); }}><Star size={14} fill={timeframeFavorites.includes(interval) ? 'currentColor' : 'none'}/></button></div>{/each}</div>{/if}</div></div>
    <div class="top-divider"></div><div class="style-picker"><button class="chart-style" aria-label="Chart style" aria-expanded={styleMenuOpen} class:style-selected={chartStyle !== 'candles'} onclick={() => styleMenuOpen = !styleMenuOpen} onkeydown={(e) => { if (e.key === 'Escape') styleMenuOpen = false; }}><CandlestickChart size={14}/><span>{chartStyles.find(style => style.id === chartStyle)?.label}</span><ChevronDown size={10}/></button>{#if styleMenuOpen}<div class="style-menu" role="group" aria-label="Chart styles">{#each chartStyles as style}<button class:menu-selected={chartStyle === style.id} aria-pressed={chartStyle === style.id} onclick={() => chooseStyle(style.id)}><CandlestickChart size={14}/>{style.label}{#if chartStyle === style.id}<span class="new-tag">SELECTED</span>{/if}</button>{/each}<div class="style-menu-note">Appearance controls in Chart settings</div></div>{/if}</div>
    <div class="top-divider"></div><div class="multi-chart-controls" aria-label="Multi-chart controls"><div class="layout-picker" role="group" aria-label="Chart layout">
      <button class:layout-active={layoutId === '1'} aria-label="Single chart" aria-pressed={layoutId === '1'} title="Single chart" onclick={() => chooseWorkspaceLayout('1')}>1</button>
      <button class:layout-active={layoutId === '2h'} aria-label="Two charts side by side" aria-pressed={layoutId === '2h'} title="Two charts side by side" onclick={() => chooseWorkspaceLayout('2h')}>2↔</button>
      <button class:layout-active={layoutId === '2v'} aria-label="Two charts stacked" aria-pressed={layoutId === '2v'} title="Two charts stacked" onclick={() => chooseWorkspaceLayout('2v')}>2↕</button>
      <button class:layout-active={layoutId === 'deplyze-3'} aria-label="Three charts, one above two" aria-pressed={layoutId === 'deplyze-3'} title="Three charts, one above two" onclick={() => chooseWorkspaceLayout('deplyze-3')}>3</button>
      <button class:layout-active={layoutId === '4'} aria-label="Four charts" aria-pressed={layoutId === '4'} title="Four charts" onclick={() => chooseWorkspaceLayout('4')}>4</button>
    </div><button class:sync-active={symbolSync} aria-label="Link symbols across charts" aria-pressed={symbolSync} title="Link symbols across charts" onclick={() => setSymbolSync(!symbolSync)}><ArrowLeftRight size={13}/></button><button class:sync-active={crosshairSync} aria-label="Synchronize crosshairs" aria-pressed={crosshairSync} title="Synchronize crosshairs" onclick={() => setCrosshairSync(!crosshairSync)}><Target size={13}/></button><button class:sync-active={drawingsSync} aria-label="Synchronize drawings on matching instruments" aria-pressed={drawingsSync} title="Synchronize drawings on matching instruments" onclick={() => setDrawingsSync(!drawingsSync)}><Layers size={13}/></button></div>
    <div class="top-spacer"></div>{#if chartStyle === 'footprint'}<button class="top-action" onclick={() => { indicatorsOpen = false; appearanceOpen = false; settingsOpen = true; }}><SlidersHorizontal size={13}/> Footprint</button>{/if}<button class="top-action" aria-label="Indicators" aria-expanded={indicatorsOpen} onclick={() => { appearanceOpen = false; settingsOpen = false; styleMenuOpen = false; vela?.renderer.closeDialogs(); indicatorsOpen = !indicatorsOpen; }}><SlidersHorizontal size={13}/> Indicators</button><button class="top-action"><ArrowLeftRight size={13}/> Alert</button><button class="top-action replay-toolbar-button" class:replay-active={replayState.mode !== 'off'} disabled={layoutId !== '1'} title={layoutId === '1' ? 'Bar Replay' : 'Replay is available in single-chart layout only'} onclick={() => replayState.mode === 'off' ? beginReplayPick() : replayState.mode === 'pick' ? replayStop() : replaySelectBar()}><SkipForward size={13}/> Replay</button><button class="top-action"><Eye size={13}/> View as</button><div class="screenshot-picker"><button class="top-icon" aria-label="Chart snapshot" aria-haspopup="menu" aria-expanded={screenshotMenuOpen} title="Chart snapshot" onclick={() => { screenshotError = ''; screenshotMenuOpen = !screenshotMenuOpen; }}><Camera size={14}/></button>{#if screenshotMenuOpen}<div class="screenshot-menu" role="menu" aria-label="Chart snapshot actions"><button role="menuitem" disabled={screenshotBusy} onclick={() => void copyChartImage()}>Copy Image</button><button role="menuitem" disabled={screenshotBusy} onclick={() => void downloadChartImage()}>Download Image</button>{#if screenshotError}<small role="alert">{screenshotError}</small>{/if}</div>{/if}</div><button class="top-icon" aria-label="Chart settings" onclick={() => { indicatorsOpen = false; settingsOpen = false; appearanceOpen = !appearanceOpen; }}><Settings2 size={14}/></button>
  </nav>
  <main class="chart-layout" class:pine-open={pineOpen} class:pine-maximized={pineOpen && pineMaximized}>{#if vela && chartArea}{#key activeCellId}<ToolRail chart={vela} groups={drawingGroups} bind:prefs={extras.drawingTools} onClear={clearAllDrawings} onLockAll={setAllDrawingsLocked} onHideAll={setAllDrawingsHidden} modeOff={null} disabled={appearanceOpen || settingsOpen || indicatorsOpen || searchOpen}/>{/key}{:else}<aside class="drawing-toolbar" aria-label="Drawing tools"></aside>{/if}
    <section class="chart-area" class:multi-chart={layoutId !== '1'} bind:this={chartArea} role="application" aria-label="Interactive market chart" onpointermove={onReplayPointerMove} onpointerdown={onReplayPointerDown} onpointerup={onReplayPointerUp} onpointercancel={onReplayPointerCancel} onpointerleave={onReplayPointerLeave} style:flex={pineOpen ? `${pineMaximized ? 0 : 100 - pinePanelWidth} 1 0%` : undefined}><div class="chart-plot"><div bind:this={chartHost} class="vela-chart" aria-label="Live DeplyzeView market charts"></div>{#if replayState.mode === 'pick' && replayHoverX !== null}<div class="replay-picker-line" style={`left:${replayHoverX}px`}><span>{replayHoverTime ? new Date(replayHoverTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Drag to select bar'}</span></div><div class="replay-future-dim" style={`left:${replayHoverX}px`}></div>{/if}</div><div class="chart-bottom-controls"><div class="chart-watermark" aria-label="DeplyzeView"><img src={appIcon} alt="" draggable="false"/><span>DeplyzeView</span></div><button class="reset-chart" aria-label="Fit all" title="Fit all" onclick={() => vela?.setVisibleRangePreset('ALL')}><Undo2 size={14}/></button></div>
      {#if replayState.mode === 'pick'}<div class="replay-pick-panel"><MousePointer2 size={14}/><span>Click a bar to start replay</span><button onclick={replayStop}>Cancel</button></div>{/if}
      {#if replayState.mode === 'replay'}<div class="replay-panel"><button class="replay-select" onclick={replaySelectBar}><MousePointer2 size={14}/> Select bar</button><span class="replay-panel-divider"></span><button class="replay-control" aria-label={replayState.playing ? 'Pause' : 'Play'} onclick={replayToggle}>{#if replayState.playing}<Pause size={14}/>{:else}<Play size={14}/>{/if}</button><button class="replay-control" aria-label="Step" onclick={replayStep}><SkipForward size={14}/></button><div class="replay-speeds">{#each replaySpeedLabels as label, index}<button class:chosen={replayState.speed === index} onclick={() => replaySetSpeed(index)}>{label}</button>{/each}</div><span class="replay-time">{replayCursorTime ? new Date(replayCursorTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span><span class="replay-panel-divider"></span><button class="replay-exit" onclick={replayStop}><LogOut size={13}/> Exit</button></div>{/if}
      {#if replayNotice}<div class="replay-notice" role="status">{replayNotice}</div>{/if}
      {#if screenshotNotice}<div class="screenshot-notice" role="status">{screenshotNotice}</div>{/if}
      {#if indicatorsOpen && vela}{#key activeCellId}<IndicatorPicker chart={vela} customScripts={pineScripts} customError={pineError} onCustomAdd={addPine} onCustomEdit={editPine} onCustomDelete={deletePine} close={() => indicatorsOpen = false}/>{/key}{/if}
      {#if appearanceOpen && appearance}<ChartAppearance config={appearance} {extras} {persistenceError} patch={applyAppearance} changeExtras={applyExtras} {chooseStyle} reset={resetAppearance} close={() => appearanceOpen = false}/>{/if}
      {#if settingsOpen}<div class="settings-scrim" role="presentation" onclick={() => settingsOpen = false}></div><dialog open class="settings-dialog" aria-modal="true" aria-labelledby="settings-title" style={settingsDialogPosition ? `left:${settingsDialogPosition.left}px;top:${settingsDialogPosition.top}px;transform:none` : undefined}><header class="dialog-titlebar" role="toolbar" aria-label="Move settings dialog" tabindex="0" onkeydown={nudgeSettingsDialog} onpointerdown={startSettingsDialogDrag} onpointermove={moveSettingsDialog} onpointerup={endSettingsDialogDrag} onpointercancel={endSettingsDialogDrag}><div><span class="dialog-kicker">CHART SETTINGS</span><h2 id="settings-title">Volume Footprint</h2></div><button class="dialog-close" aria-label="Close settings" onclick={() => settingsOpen = false}><X size={14}/></button></header><nav class="dialog-tabs">{#each tabs as tab}<button class:tab-active={settingsTab === tab} onclick={() => settingsTab = tab}>{tab}</button>{/each}</nav><div class="dialog-content"><div class="dialog-section-label">{settingsTab === 'General' ? 'GENERAL' : settingsTab.toUpperCase()}</div>{#if settingsTab === 'General'}<div class="setting-row"><div class="setting-name"><strong>Unit</strong><small>Volume denomination</small></div><div class="segmented"><button class:segment-active={footprintUnit === 'quote'} onclick={() => chooseUnit('quote')}>{feedHealth?.quoteCurrency ?? 'Quote'}</button><button class:segment-active={footprintUnit === 'coin'} onclick={() => chooseUnit('coin')}>Coin</button></div></div><div class="setting-row"><div class="setting-name"><strong>Ticks per bar</strong><small>Price levels per footprint row</small></div><div class="stepper"><button aria-label="Decrease ticks" onclick={() => changeTicks(tickCount - 1)}>−</button><input type="number" min="1" max="100" bind:value={tickCount} oninput={() => changeTicks(tickCount)}/><span>ticks</span><button aria-label="Increase ticks" onclick={() => changeTicks(tickCount + 1)}>+</button></div></div><div class="setting-row mode-row"><div class="setting-name"><strong>Display mode</strong><small>How trade volume is rendered</small></div><div class="mode-options">{#each modes as item}<button class:mode-active={footprintMode === item.id} onclick={() => chooseMode(item.id)}><span>{item.name}</span><small>{item.hint}</small>{#if footprintMode === item.id}<span class="selected-dot"></span>{/if}</button>{/each}</div></div><div class="data-note"><span class="live-indicator" class:health-error={feedHealth?.status === 'error' || (feedHealth?.gapsDetected ?? 0) > 0}></span><span><strong>{feedHealth?.status === 'live' ? 'Live trade feed' : feedHealth?.status === 'error' ? 'Feed needs attention' : 'Market data service'}</strong><small>{feedHealth ? `${feedHealth.tradesStored.toLocaleString()} stored trades · ${feedHealth.gapDetectionAvailable ? `${feedHealth.gapsDetected} gap(s)` : 'gap detection unavailable'}` : 'Waiting for Rust feed status…'}</small><small>{coverageText()}</small><small>{feedHealth?.historyNote ?? `${venue} public trade history`}</small>{#if feedHealth?.lastError}<small class="feed-error-text">{feedHealth.lastError}</small>{/if}</span></div>{:else}<div class="settings-placeholder"><div class="settings-placeholder-icon"><Settings2 size={17}/></div><strong>{settingsTab} settings</strong><span>Configure {settingsTab.toLowerCase()} visualization for the footprint chart.</span><div class="coming-chip">AVAILABLE IN THIS BUILD</div></div>{/if}</div><footer class="dialog-footer"><span class="footer-hint">Settings apply to the active chart</span><button class="done-button" onclick={() => settingsOpen = false}>Done</button></footer></dialog>{/if}
    </section>
    {#if pineOpen}<div class="pine-resizer" role="slider" aria-label="Resize chart and Pine Editor" aria-controls="pine-code-editor" aria-orientation="vertical" aria-valuemin="20" aria-valuemax="80" aria-valuenow={Math.round(pinePanelWidth)} aria-valuetext={`${Math.round(pinePanelWidth)}% editor width`} tabindex="0" onpointerdown={startPineResize} onpointermove={movePineResize} onpointerup={endPineResize} onpointercancel={endPineResize} onkeydown={keyPineResize}><span></span></div>{/if}
    <div class="workspace-dock" style:flex={pineOpen ? `${pineMaximized ? 1 : pinePanelWidth} 1 0%` : undefined} use:trackWorkspaceDockWidth>
      {#if vela}<div style:display={pineOpen ? 'contents' : 'none'}><PineEditor chart={vela} scripts={pineScripts} persist={persistPine} onClose={() => { pineOpen = false; pineMaximized = false; }} maximized={pineMaximized} onMaximize={togglePineMaximize} bind:this={pineEditor}/></div>{/if}
      {#if panelOpen && !pineOpen}
        <Watchlist items={watchlist} collection={watchlists} quotes={watchlistQuotes} {symbol} provider={venueId} loading={watchlistQuotesLoading} storageError={watchlistError} select={selectInstrument} add={() => searchOpen = true} remove={removeFromWatchlist} reorder={saveWatchlist} switchList={switchWatchlist} createList={createWatchlist} refresh={() => void refreshWatchlistQuotes()}/>
      {/if}
      <nav class="workspace-rail" aria-label="Workspace panels">
        <button class:rail-active={panelOpen} aria-label={panelOpen ? 'Close watchlist panel' : 'Open watchlist panel'} title="Watchlist" aria-pressed={panelOpen} onclick={() => { pineOpen = false; toggleWorkspacePanel(); }}><Bookmark size={18}/></button>
        <button class="rail-placeholder" type="button" aria-label="Alerts (coming soon)" title="Alerts (coming soon)" onclick={() => openPlaceholderTool('Alerts')}><History size={18}/></button>
        <button class="rail-placeholder" type="button" aria-label="Object tree (coming soon)" title="Object tree (coming soon)" onclick={() => openPlaceholderTool('Object tree')}><Layers size={18}/></button>
        <span class="rail-group-gap" aria-hidden="true"></span>
        <button class="rail-placeholder" type="button" aria-label="Hotlists (coming soon)" title="Hotlists (coming soon)" onclick={() => openPlaceholderTool('Hotlists')}><Sparkles size={18}/></button>
        <button class="rail-placeholder" type="button" aria-label="Screeners (coming soon)" title="Screeners (coming soon)" onclick={() => openPlaceholderTool('Screeners')}><Target size={18}/></button>
        <button class:rail-active={pineOpen} type="button" aria-label={pineOpen ? 'Close Pine Editor' : 'Open Pine Editor'} title="Pine Editor" aria-pressed={pineOpen} onclick={togglePineEditor}><Mountain size={18}/></button>
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
  {#if searchOpen}<SymbolSearch close={closeSymbolSearch} select={selectInstrument} add={addToWatchlist} isSaved={(item) => watchlist.some(saved => saved.identity === item.identity)}/>{/if}
  <footer class="statusbar"><div class="range-options"><button onclick={() => vela?.setVisibleRangePreset('1D')}>1D</button><button onclick={() => vela?.setVisibleRangePreset('1W')}>1W</button><button onclick={() => vela?.setVisibleRangePreset('1M')}>1M</button><button onclick={() => vela?.setVisibleRangePreset('3M')}>3M</button><button onclick={() => vela?.setVisibleRangePreset('6M')}>6M</button><button onclick={() => vela?.setVisibleRangePreset('1Y')}>1Y</button><button onclick={() => vela?.setVisibleRangePreset('ALL')}>ALL</button><span class="status-divider"></span><div class="range-picker-anchor"><button class="calendar-button" type="button" aria-label="Choose custom chart date range" title="Custom date range" aria-haspopup="dialog" aria-expanded={rangePickerOpen} onclick={toggleRangePicker}><CalendarDays size={14}/></button>{#if rangePickerOpen}<div class="range-picker" role="dialog" aria-label="Custom chart date range"><strong>Custom date range</strong><div class="calendar-selection"><div><span>From</span><strong>{displayCalendarDate(customRangeStart)}</strong></div><div><span>To</span><strong>{displayCalendarDate(customRangeEnd)}</strong></div></div><div class="calendar-month-nav"><button type="button" aria-label="Previous month" onclick={() => shiftCalendarMonth(-1)}><ChevronLeft size={14}/></button><strong>{calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong><button type="button" aria-label="Next month" onclick={() => shiftCalendarMonth(1)}><ChevronRight size={14}/></button></div><div class="calendar-weekdays">{#each ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as weekday}<span>{weekday}</span>{/each}</div><div class="calendar-grid">{#each calendarDays() as day (day.value)}<button type="button" class="calendar-day" class:other-month={!day.inMonth} class:in-range={day.inRange} class:range-start={day.isStart} class:range-end={day.isEnd} class:today={day.isToday} aria-label={day.value} aria-pressed={day.isStart || day.isEnd} onclick={() => selectCalendarDate(day.value)}>{day.day}</button>{/each}</div><div class="range-picker-actions"><button type="button" class="range-cancel" onclick={() => rangePickerOpen = false}>Cancel</button><button type="button" class="range-apply" disabled={!customRangeStart || !customRangeEnd || customRangeStart > customRangeEnd} onclick={applyCustomDateRange}>Apply</button></div></div>{/if}</div></div><div class="clock-control"><button class="clock-button" type="button" aria-label="Current time and time zone preferences" title="Change time zone" aria-haspopup="dialog" aria-expanded={timezonePickerOpen} onclick={() => { timezonePickerOpen = !timezonePickerOpen; rangePickerOpen = false; }}><span class="clock">{formatClock(clock, timezone)}</span><span class="clock-zone">{formatTimezoneOffset(clock, timezone)}</span></button>{#if timezonePickerOpen}<div class="timezone-popover" role="dialog" aria-label="Time zone preference"><label for="clock-timezone">Time zone</label><select id="clock-timezone" class="timezone-select" aria-label="Chart time zone" title="Chart and clock time zone" value={timezone} onchange={(event) => { applyAppearance({ timeScale: { timezone: event.currentTarget.value } }); timezonePickerOpen = false; }}>{#each timezoneChoices(timezone) as zone}<option value={zone.value}>{zone.label}</option>{/each}</select></div>{/if}</div></footer>
</div>
