<script lang="ts">
  import { BarChart3, CandlestickChart, Check, Minus, Plus, Settings2 } from 'lucide-svelte';
  import type { AppearanceKey, ChartAppearance, ChartStyle, CrosshairLineStyle, ScaleMode } from './chart-appearance';
  import type { FeedHealth, FootprintMode, FootprintUnit } from './footprint';

  type SettingsTab = 'Chart Style' | 'Symbol' | 'Canvas' | 'Scales' | 'Crosshair' | 'Volume' | 'Footprint';
  export let tab: SettingsTab = 'Chart Style';
  export let chartStyle: ChartStyle = 'candles';
  export let appearance: ChartAppearance;
  export let volumeVisible = true;
  export let footprintMode: FootprintMode = 'split';
  export let footprintUnit: FootprintUnit = 'quote';
  export let tickCount = 15;
  export let feedHealth: FeedHealth | undefined;
  export let venue = '';
  export let coverageText = '';
  export let onStyleChange: (style: ChartStyle) => void;
  export let onAppearanceChange: (key: AppearanceKey, value: string | number | boolean) => void;
  export let onVolumeChange: (visible: boolean) => void;
  export let onFootprintModeChange: (mode: FootprintMode) => void;
  export let onFootprintUnitChange: (unit: FootprintUnit) => void;
  export let onTickCountChange: (count: number) => void;

  const styleOptions: { id: ChartStyle; name: string; detail: string; icon: typeof CandlestickChart }[] = [
    { id: 'candles', name: 'Candles', detail: 'OHLC candle bodies', icon: CandlestickChart },
    { id: 'hollow', name: 'Hollow candles', detail: 'Outlined rising bars', icon: CandlestickChart },
    { id: 'bars', name: 'Bars (OHLC)', detail: 'Open, high, low, close', icon: BarChart3 },
    { id: 'line', name: 'Line', detail: 'Closing-price series', icon: Settings2 },
    { id: 'area', name: 'Area', detail: 'Line with gradient fill', icon: Settings2 },
    { id: 'baseline', name: 'Baseline', detail: 'Above/below reference', icon: Minus },
    { id: 'heikinashi', name: 'Heikin Ashi', detail: 'Vela time-preserving transform', icon: CandlestickChart },
    { id: 'footprint', name: 'Volume Footprint', detail: 'Tick-level bid × ask cells', icon: BarChart3 },
  ];
  const modes: { id: FootprintMode; name: string; hint: string }[] = [
    { id: 'split', name: 'Split Bar', hint: 'Bid and ask side by side' },
    { id: 'delta', name: 'Delta', hint: 'Net aggressor volume' },
    { id: 'total', name: 'Total Volume', hint: 'Combined volume per level' },
  ];
  const units: { id: FootprintUnit; name: string }[] = [
    { id: 'quote', name: 'Quote' },
    { id: 'coin', name: 'Coin' },
  ];
  const scaleModes: { id: ScaleMode; name: string }[] = [
    { id: 'price', name: 'Price' },
    { id: 'percent', name: 'Percent' },
    { id: 'indexed', name: 'Indexed' },
  ];
  const lineStyles: CrosshairLineStyle[] = ['solid', 'dashed', 'dotted'];

  function setNumber(key: AppearanceKey, event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    onAppearanceChange(key, value);
  }
  function setBoolean(key: AppearanceKey, event: Event) {
    onAppearanceChange(key, (event.currentTarget as HTMLInputElement).checked);
  }
  function setColor(key: AppearanceKey, event: Event) {
    onAppearanceChange(key, (event.currentTarget as HTMLInputElement).value);
  }
</script>

{#if tab === 'Chart Style'}
  <div class="dialog-section-label">TIME-BASED AND NATIVE STYLES</div>
  <div class="settings-style-grid">
    {#each styleOptions as item (item.id)}
      <button class="settings-style-card" class:style-card-active={chartStyle === item.id} aria-pressed={chartStyle === item.id} onclick={() => onStyleChange(item.id)}>
        <svelte:component this={item.icon} size={15} strokeWidth={1.6} />
        <span class="style-card-copy"><strong>{item.name}</strong><small>{item.detail}</small></span>
        {#if chartStyle === item.id}<Check size={13} class="style-card-check" />{/if}
      </button>
    {/each}
  </div>
  <div class="settings-note"><strong>Engine limits</strong><span>Columns are not a native Vela price style. Renko, Line Break, Kagi, Point &amp; Figure, and Range need dedicated price/tick-based bar construction; they are intentionally not approximated as visual filters.</span></div>
{:else if tab === 'Symbol'}
  <div class="dialog-section-label">{chartStyle === 'footprint' ? 'FOOTPRINT' : chartStyle === 'bars' ? 'OHLC BARS' : chartStyle === 'line' ? 'LINE' : chartStyle === 'area' ? 'AREA' : chartStyle === 'baseline' ? 'BASELINE' : 'CANDLES'}</div>
  {#if chartStyle === 'footprint'}
    <div class="settings-note"><strong>Footprint palette</strong><span>Bid/ask cells use the native Vela footprint palette. Candle-specific controls apply when a candle-based style is selected.</span></div>
  {:else if chartStyle === 'bars'}
    <div class="setting-row"><div class="setting-name"><strong>Rising bars</strong><small>OHLC bar color</small></div><input aria-label="Rising bar color" class="color-input" type="color" value={appearance.barUpColor} oninput={(event) => setColor('barUpColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Falling bars</strong><small>OHLC bar color</small></div><input aria-label="Falling bar color" class="color-input" type="color" value={appearance.barDownColor} oninput={(event) => setColor('barDownColor', event)} /></div>
  {:else if chartStyle === 'line'}
    <div class="setting-row"><div class="setting-name"><strong>Line color</strong><small>Closing-price series</small></div><input aria-label="Line color" class="color-input" type="color" value={appearance.lineColor} oninput={(event) => setColor('lineColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Line width</strong><small>{appearance.lineWidth}px</small></div><input class="range-input" aria-label="Line width" type="range" min="1" max="5" step="1" value={appearance.lineWidth} oninput={(event) => setNumber('lineWidth', event)} /></div>
  {:else if chartStyle === 'area'}
    <div class="setting-row"><div class="setting-name"><strong>Line color</strong><small>Area outline</small></div><input aria-label="Area line color" class="color-input" type="color" value={appearance.areaLineColor} oninput={(event) => setColor('areaLineColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Area fill</strong><small>Gradient opacity remains restrained</small></div><input aria-label="Area fill color" class="color-input" type="color" value={appearance.areaFillColor} oninput={(event) => setColor('areaFillColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Line width</strong><small>{appearance.areaWidth}px</small></div><input class="range-input" aria-label="Area line width" type="range" min="1" max="5" step="1" value={appearance.areaWidth} oninput={(event) => setNumber('areaWidth', event)} /></div>
  {:else if chartStyle === 'baseline'}
    <div class="setting-row"><div class="setting-name"><strong>Above baseline</strong><small>Positive side</small></div><input aria-label="Above baseline color" class="color-input" type="color" value={appearance.baselineUpColor} oninput={(event) => setColor('baselineUpColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Below baseline</strong><small>Negative side</small></div><input aria-label="Below baseline color" class="color-input" type="color" value={appearance.baselineDownColor} oninput={(event) => setColor('baselineDownColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Baseline level</strong><small>{appearance.baselineLevel}% of visible range</small></div><input class="range-input" aria-label="Baseline level" type="range" min="0" max="100" step="1" value={appearance.baselineLevel} oninput={(event) => setNumber('baselineLevel', event)} /></div>
  {:else}
    <div class="setting-row"><div class="setting-name"><strong>Bullish body</strong><small>Rising candles and volume</small></div><input aria-label="Bullish candle color" class="color-input" type="color" value={appearance.upColor} oninput={(event) => setColor('upColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Bearish body</strong><small>Falling candles and volume</small></div><input aria-label="Bearish candle color" class="color-input" type="color" value={appearance.downColor} oninput={(event) => setColor('downColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Bullish border</strong><small>Outline color</small></div><input aria-label="Bullish candle border color" class="color-input" type="color" value={appearance.borderUpColor} oninput={(event) => setColor('borderUpColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Bearish border</strong><small>Outline color</small></div><input aria-label="Bearish candle border color" class="color-input" type="color" value={appearance.borderDownColor} oninput={(event) => setColor('borderDownColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Bullish wick</strong><small>Wick color</small></div><input aria-label="Bullish candle wick color" class="color-input" type="color" value={appearance.wickUpColor} oninput={(event) => setColor('wickUpColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Bearish wick</strong><small>Wick color</small></div><input aria-label="Bearish candle wick color" class="color-input" type="color" value={appearance.wickDownColor} oninput={(event) => setColor('wickDownColor', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Candle borders</strong><small>Show outline around bodies</small></div><input class="toggle-input" type="checkbox" aria-label="Show candle borders" checked={appearance.borderVisible} onchange={(event) => setBoolean('borderVisible', event)} /></div>
    <div class="setting-row"><div class="setting-name"><strong>Candle wicks</strong><small>Show high/low wicks</small></div><input class="toggle-input" type="checkbox" aria-label="Show candle wicks" checked={appearance.wickVisible} onchange={(event) => setBoolean('wickVisible', event)} /></div>
  {/if}
{:else if tab === 'Canvas'}
  <div class="dialog-section-label">CANVAS AND GRID</div>
  <div class="setting-row"><div class="setting-name"><strong>Background</strong><small>Chart canvas</small></div><input aria-label="Chart background color" class="color-input" type="color" value={appearance.background} oninput={(event) => setColor('background', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Text and axes</strong><small>Chart labels</small></div><input aria-label="Chart text color" class="color-input" type="color" value={appearance.textColor} oninput={(event) => setColor('textColor', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Label size</strong><small>{appearance.fontSize}px</small></div><input class="range-input" aria-label="Chart label size" type="range" min="9" max="16" step="1" value={appearance.fontSize} oninput={(event) => setNumber('fontSize', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Vertical grid</strong><small>Show time divisions</small></div><input class="toggle-input" type="checkbox" aria-label="Show vertical grid" checked={appearance.gridVertVisible} onchange={(event) => setBoolean('gridVertVisible', event)} /></div>
  {#if appearance.gridVertVisible}<div class="setting-row"><div class="setting-name"><strong>Vertical grid color</strong><small>Time divisions</small></div><input aria-label="Vertical grid color" class="color-input" type="color" value={appearance.gridVertColor} oninput={(event) => setColor('gridVertColor', event)} /></div>{/if}
  <div class="setting-row"><div class="setting-name"><strong>Horizontal grid</strong><small>Show price divisions</small></div><input class="toggle-input" type="checkbox" aria-label="Show horizontal grid" checked={appearance.gridHorzVisible} onchange={(event) => setBoolean('gridHorzVisible', event)} /></div>
  {#if appearance.gridHorzVisible}<div class="setting-row"><div class="setting-name"><strong>Horizontal grid color</strong><small>Price divisions</small></div><input aria-label="Horizontal grid color" class="color-input" type="color" value={appearance.gridHorzColor} oninput={(event) => setColor('gridHorzColor', event)} /></div>{/if}
  <div class="setting-row"><div class="setting-name"><strong>Pane separator</strong><small>Between indicator panes</small></div><input aria-label="Pane separator color" class="color-input" type="color" value={appearance.separatorColor} oninput={(event) => setColor('separatorColor', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Top margin</strong><small>{appearance.marginTop}% of pane</small></div><input class="range-input" aria-label="Top margin" type="range" min="0" max="30" step="1" value={appearance.marginTop} oninput={(event) => setNumber('marginTop', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Bottom margin</strong><small>{appearance.marginBottom}% of pane</small></div><input class="range-input" aria-label="Bottom margin" type="range" min="0" max="30" step="1" value={appearance.marginBottom} oninput={(event) => setNumber('marginBottom', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Right margin</strong><small>{appearance.marginRight} bars</small></div><input class="range-input" aria-label="Right margin" type="range" min="0" max="40" step="1" value={appearance.marginRight} oninput={(event) => setNumber('marginRight', event)} /></div>
  <div class="settings-note"><span>Session breaks are not shown for the configured 24/7 crypto feeds. Pane separator color applies when indicators create separate panes.</span></div>
{:else if tab === 'Scales'}
  <div class="dialog-section-label">SCALE AND PRICE LABELS</div>
  <div class="setting-row"><div class="setting-name"><strong>Price scale</strong><small>Scale interpretation</small></div><div class="segmented">{#each scaleModes as mode}<button class:segment-active={appearance.scaleMode === mode.id} aria-pressed={appearance.scaleMode === mode.id} onclick={() => onAppearanceChange('scaleMode', mode.id)}>{mode.name}</button>{/each}</div></div>
  <div class="setting-row"><div class="setting-name"><strong>Logarithmic</strong><small>Log price axis</small></div><input class="toggle-input" type="checkbox" aria-label="Logarithmic price scale" checked={appearance.scaleLog} onchange={(event) => setBoolean('scaleLog', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Invert price scale</strong><small>High values at bottom</small></div><input class="toggle-input" type="checkbox" aria-label="Invert price scale" checked={appearance.invertScale} onchange={(event) => setBoolean('invertScale', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Price-only autoscale</strong><small>Exclude indicator panes from price range</small></div><input class="toggle-input" type="checkbox" aria-label="Price-only autoscale" checked={appearance.priceOnly} onchange={(event) => setBoolean('priceOnly', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Price labels</strong><small>Show right-axis values</small></div><input class="toggle-input" type="checkbox" aria-label="Show price labels" checked={appearance.priceLabels} onchange={(event) => setBoolean('priceLabels', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Last-price line</strong><small>Current traded price guide</small></div><input class="toggle-input" type="checkbox" aria-label="Show last-price line" checked={appearance.currentPriceLine} onchange={(event) => setBoolean('currentPriceLine', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Last-price label</strong><small>Right-axis price chip</small></div><input class="toggle-input" type="checkbox" aria-label="Show last-price label" checked={appearance.priceLabel} onchange={(event) => setBoolean('priceLabel', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Bar countdown</strong><small>Time remaining in the active interval</small></div><input class="toggle-input" type="checkbox" aria-label="Show bar countdown" checked={appearance.countdown} onchange={(event) => setBoolean('countdown', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Axis border</strong><small>Price-scale separator</small></div><input aria-label="Axis border color" class="color-input" type="color" value={appearance.axisBorderColor} oninput={(event) => setColor('axisBorderColor', event)} /></div>
  <div class="settings-note"><span>Axis side and time-axis visibility are engine-managed in this Vela release; no non-functional placement controls are shown.</span></div>
{:else if tab === 'Crosshair'}
  <div class="dialog-section-label">CROSSHAIR APPEARANCE</div>
  <div class="setting-row"><div class="setting-name"><strong>Crosshair color</strong><small>Cursor guide lines</small></div><input aria-label="Crosshair color" class="color-input" type="color" value={appearance.crosshairColor} oninput={(event) => setColor('crosshairColor', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Axis label background</strong><small>Crosshair price/time chips</small></div><input aria-label="Crosshair label background" class="color-input" type="color" value={appearance.crosshairLabelBackground} oninput={(event) => setColor('crosshairLabelBackground', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Line style</strong><small>{appearance.crosshairStyle}</small></div><div class="segmented">{#each lineStyles as style}<button class:segment-active={appearance.crosshairStyle === style} aria-pressed={appearance.crosshairStyle === style} onclick={() => onAppearanceChange('crosshairStyle', style)}>{style}</button>{/each}</div></div>
  <div class="setting-row"><div class="setting-name"><strong>Line width</strong><small>{appearance.crosshairWidth}px</small></div><input class="range-input" aria-label="Crosshair width" type="range" min="1" max="3" step="1" value={appearance.crosshairWidth} oninput={(event) => setNumber('crosshairWidth', event)} /></div>
  <div class="setting-row"><div class="setting-name"><strong>Opacity</strong><small>{Math.round(appearance.crosshairOpacity * 100)}%</small></div><input class="range-input" aria-label="Crosshair opacity" type="range" min="0.1" max="1" step="0.05" value={appearance.crosshairOpacity} oninput={(event) => setNumber('crosshairOpacity', event)} /></div>
  <div class="settings-note"><span>Crosshair mode follows Vela's native cursor interaction; color, line, weight, opacity, and axis chips update live.</span></div>
{:else if tab === 'Volume'}
  <div class="dialog-section-label">NATIVE VOLUME STUDY</div>
  <div class="setting-row"><div class="setting-name"><strong>Volume</strong><small>Toggle the chart's native volume pane</small></div><input class="toggle-input" type="checkbox" aria-label="Show volume" checked={volumeVisible} onchange={(event) => onVolumeChange((event.currentTarget as HTMLInputElement).checked)} /></div>
  <div class="settings-note"><strong>Volume colors</strong><span>Vela colors native volume columns from the selected bullish and bearish chart palette; changing candle colors updates volume colors as well.</span></div>
{:else}
  <div class="dialog-section-label">LIVE FOOTPRINT · {venue.toUpperCase()}</div>
  <div class="setting-row"><div class="setting-name"><strong>Unit</strong><small>Volume denomination</small></div><div class="segmented">{#each units as item}<button class:segment-active={footprintUnit === item.id} aria-pressed={footprintUnit === item.id} onclick={() => onFootprintUnitChange(item.id)}>{item.id === 'quote' ? feedHealth?.quoteCurrency ?? item.name : item.name}</button>{/each}</div></div>
  <div class="setting-row"><div class="setting-name"><strong>Ticks per row</strong><small>Exchange price ticks grouped</small></div><div class="stepper"><button aria-label="Decrease ticks per row" onclick={() => onTickCountChange(Math.max(1, tickCount - 1))}><Minus size={12}/></button><input aria-label="Ticks per row" type="number" min="1" max="100" value={tickCount} oninput={(event) => onTickCountChange(Math.max(1, Math.min(100, Number((event.currentTarget as HTMLInputElement).value) || 1)))} /><span>ticks</span><button aria-label="Increase ticks per row" onclick={() => onTickCountChange(Math.min(100, tickCount + 1))}><Plus size={12}/></button></div></div>
  <div class="setting-row mode-row"><div class="setting-name"><strong>Display mode</strong><small>Trade volume per price level</small></div><div class="mode-options">{#each modes as item}<button class:mode-active={footprintMode === item.id} onclick={() => onFootprintModeChange(item.id)}><span>{item.name}</span><small>{item.hint}</small>{#if footprintMode === item.id}<span class="selected-dot"></span>{/if}</button>{/each}</div></div>
  <div class="data-note"><span class="live-indicator" class:health-error={feedHealth?.status === 'error' || (feedHealth?.gapsDetected ?? 0) > 0}></span><span><strong>{feedHealth?.status === 'live' ? 'Live trade feed' : feedHealth?.status === 'error' ? 'Feed needs attention' : 'Market data service'}</strong><small>{feedHealth ? `${feedHealth.tradesStored.toLocaleString()} stored trades · ${feedHealth.gapDetectionAvailable ? `${feedHealth.gapsDetected} gap(s)` : 'gap detection unavailable'}` : 'Waiting for Rust feed status…'}</small><small>{coverageText}</small><small>{feedHealth?.historyNote ?? `${venue} public trade history`}</small>{#if feedHealth?.lastError}<small class="feed-error-text">{feedHealth.lastError}</small>{/if}</span></div>
{/if}
