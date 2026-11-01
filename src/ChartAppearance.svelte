<script lang="ts">
  import { themeAppearance } from './chart-theme';
  import { timezoneChoices } from './timezones';
  import ColorPicker from './ColorPicker.svelte';
  import type { ChartConfig } from '@luxalgo/vela';
  import type { ChartExtras } from './chart-preferences';
  import { chartStyles, type ChartStyleId } from './chart-styles';
  import { X, CandlestickChart, Scaling, Grid2X2, Crosshair, BarChart3 } from 'lucide-svelte';
  export let config: ChartConfig;
  export let extras: ChartExtras;
  export let persistenceError = false;
  export let patch: (value: unknown) => void;
  export let changeExtras: (value: ChartExtras) => void;
  export let chooseStyle: (value: ChartStyleId) => void;
  export let reset: () => void;
  export let close: () => void;
  let tab = 'Symbol';
  const tabs = [
    { title: 'Symbol', icon: CandlestickChart },
    { title: 'Scales and lines', icon: Scaling },
    { title: 'Canvas', icon: Grid2X2 },
    { title: 'Crosshair', icon: Crosshair },
    { title: 'Volume', icon: BarChart3 },
  ];
  const openingConfig = structuredClone(config);
  const openingExtras = structuredClone(extras);
  function cancel() { patch(openingConfig); changeExtras(openingExtras); close(); }
  function navigateTabs(event: KeyboardEvent) {
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!direction && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const index = tabs.findIndex(item => item.title === tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + direction + tabs.length) % tabs.length;
    tab = tabs[next].title;
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
  }
  function preset(value: string) {
    if (value === 'reset') { reset(); return; }
    const theme = value === 'light' ? 'light' : 'dark';
    changeExtras({ ...extras, theme });
    patch(themeAppearance(theme));
  }
  function focusDialog(dialog: HTMLDialogElement) {
    const previous = document.activeElement;
    dialog.querySelector<HTMLButtonElement>('button')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    dialog.addEventListener('keydown', keydown);
    return { destroy() { dialog.removeEventListener('keydown', keydown); if (previous instanceof HTMLElement) previous.focus(); } };
  }
</script>
{#snippet swatch(label: string, value: string, change: (value: string) => void, disabled = false)}
  <ColorPicker {label} {value} {change} {disabled}/>
{/snippet}
{#snippet color(label: string, value: string, change: (value: string) => void)}
  <div class="setting-row"><span>{label}</span><div class="appearance-control">{@render swatch(label, value, change)}</div></div>
{/snippet}
{#snippet toggle(label: string, value: boolean, change: (value: boolean) => void)}
  <label class="setting-row appearance-toggle"><input type="checkbox" checked={value} onchange={(e) => change(e.currentTarget.checked)}/><span>{label}</span></label>
{/snippet}
{#snippet pair(label: string, visible: boolean, setVisible: (v: boolean) => void, up: string, down: string, setUp: (v: string) => void, setDown: (v: string) => void)}
  <div class="setting-row appearance-pair"><label><input type="checkbox" checked={visible} onchange={(e) => setVisible(e.currentTarget.checked)}/><span>{label}</span></label><div class="appearance-control">{@render swatch(`Bullish ${label.toLowerCase()}`, up, setUp, !visible)}{@render swatch(`Bearish ${label.toLowerCase()}`, down, setDown, !visible)}</div></div>
{/snippet}
{#snippet number(label: string, value: number, min: number, max: number, step: number, change: (value: number) => void)}
  <label class="setting-row"><span class="setting-name"><strong>{label}</strong></span><input class="appearance-number" type="number" {min} {max} {step} {value} onchange={(e) => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n)) change(Math.max(min, Math.min(max, n))); }}/></label>
{/snippet}
<div class="settings-scrim" role="presentation" onclick={cancel}></div>
<dialog open class="settings-dialog appearance-dialog" aria-modal="true" aria-labelledby="appearance-title" use:focusDialog>
  <header class="dialog-titlebar"><h2 id="appearance-title">Settings</h2><button class="dialog-close" aria-label="Close chart settings" onclick={cancel}><X size={18}/></button></header>
  <div class="appearance-body">
    <div class="appearance-rail" role="tablist" tabindex="-1" aria-label="Chart settings categories" aria-orientation="vertical" onkeydown={navigateTabs}>{#each tabs as item}<button id={`settings-tab-${item.title.replace(/ /g, '-')}`} role="tab" aria-selected={tab === item.title} aria-controls="appearance-panel" tabindex={tab === item.title ? 0 : -1} class:tab-active={tab === item.title} onclick={() => tab = item.title}><svelte:component this={item.icon} size={16} strokeWidth={1.4}/><span>{item.title}</span></button>{/each}</div>
    <div class="dialog-content appearance-panel" id="appearance-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab.replace(/ /g, '-')}`} tabindex="0">
  <div class="dialog-section-label">{tab === 'Symbol' ? 'CHART STYLE' : tab.toUpperCase()}</div>
  {#if tab === 'Symbol'}
    <label class="setting-row"><span class="setting-name"><strong>Visualization</strong></span><select value={config.series.style} onchange={(e) => chooseStyle(e.currentTarget.value as ChartStyleId)}>{#each chartStyles as style}<option value={style.id}>{style.label}</option>{/each}</select></label>
    {#if config.series.style === 'heikinashi'}<p class="appearance-note">Heikin Ashi uses smoothed prices. Indicators follow these prices; execution prices may differ.</p>{/if}
    <div class="dialog-section-label appearance-section">{chartStyles.find(style => style.id === config.series.style)?.label.toUpperCase()}</div>
    {#if ['candles', 'hollow', 'heikinashi'].includes(config.series.style)}
    {@render pair('Body', config.candles.bodyVisible, (v) => patch({ candles: { bodyVisible: v } }), config.candles.upColor, config.candles.downColor, (v) => patch({ candles: { upColor: v } }), (v) => patch({ candles: { downColor: v } }))}
    {@render pair('Borders', config.candles.borderVisible, (v) => patch({ candles: { borderVisible: v } }), config.candles.borderUpColor, config.candles.borderDownColor, (v) => patch({ candles: { borderUpColor: v } }), (v) => patch({ candles: { borderDownColor: v } }))}
    {@render pair('Wick', config.candles.wickVisible, (v) => patch({ candles: { wickVisible: v } }), config.candles.wickUpColor, config.candles.wickDownColor, (v) => patch({ candles: { wickUpColor: v } }), (v) => patch({ candles: { wickDownColor: v } }))}
    <div class="appearance-column-key"><span>Bullish</span><span>Bearish</span></div>
    {:else if config.series.style === 'bars'}
    {@render color('Bullish bar', config.bars.upColor, (v) => patch({ bars: { upColor: v } }))}
    {@render color('Bearish bar', config.bars.downColor, (v) => patch({ bars: { downColor: v } }))}
    {:else if config.series.style === 'line'}
    {@render color('Line color', config.line.color, (v) => patch({ line: { color: v } }))}
    {@render number('Line width', config.line.width, 1, 8, 0.5, (v) => patch({ line: { width: v } }))}
    {:else if config.series.style === 'area'}
    {@render color('Line color', config.area.lineColor, (v) => patch({ area: { lineColor: v } }))}
    {@render color('Upper fill', config.area.topColor, (v) => patch({ area: { topColor: v } }))}
    {@render color('Lower fill', config.area.bottomColor, (v) => patch({ area: { bottomColor: v } }))}
    {@render number('Line width', config.area.width, 1, 8, 0.5, (v) => patch({ area: { width: v } }))}
    {:else if config.series.style === 'baseline'}
    {@render color('Above baseline', config.baseline.topLineColor, (v) => patch({ baseline: { topLineColor: v } }))}
    {@render color('Below baseline', config.baseline.bottomLineColor, (v) => patch({ baseline: { bottomLineColor: v } }))}
    {@render color('Upper fill near line', config.baseline.topFillColor, (v) => patch({ baseline: { topFillColor: v } }))}
    {@render color('Upper fill near baseline', config.baseline.topFillColor2, (v) => patch({ baseline: { topFillColor2: v } }))}
    {@render color('Lower fill near line', config.baseline.bottomFillColor, (v) => patch({ baseline: { bottomFillColor: v } }))}
    {@render color('Lower fill near baseline', config.baseline.bottomFillColor2, (v) => patch({ baseline: { bottomFillColor2: v } }))}
    {@render number('Line width', config.baseline.width, 1, 8, 0.5, (v) => patch({ baseline: { width: v } }))}
    {@render number('Baseline position (%)', config.baseline.baselineLevel, 0, 100, 1, (v) => patch({ baseline: { baselineLevel: v } }))}
    {:else if config.series.style === 'columns'}
    {@render color('Bullish column', config.candles.upColor, (v) => patch({ candles: { upColor: v } }))}
    {@render color('Bearish column', config.candles.downColor, (v) => patch({ candles: { downColor: v } }))}
    {:else}<p class="appearance-note">Use the Footprint toolbar button for trade-volume display settings.</p>{/if}
  {:else if tab === 'Canvas'}
    {@render color('Background', config.layout.background, (v) => patch({ layout: { background: v } }))}
    <div class="setting-row appearance-pair"><label><input type="checkbox" checked={config.grid.vertLines.visible} onchange={(e) => patch({ grid: { vertLines: { visible: e.currentTarget.checked } } })}/><span>Vertical grid lines</span></label><div class="appearance-control">{@render swatch('Vertical grid color', config.grid.vertLines.color, (v) => patch({ grid: { vertLines: { color: v } } }), !config.grid.vertLines.visible)}</div></div>
    <div class="setting-row appearance-pair"><label><input type="checkbox" checked={config.grid.horzLines.visible} onchange={(e) => patch({ grid: { horzLines: { visible: e.currentTarget.checked } } })}/><span>Horizontal grid lines</span></label><div class="appearance-control">{@render swatch('Horizontal grid color', config.grid.horzLines.color, (v) => patch({ grid: { horzLines: { color: v } } }), !config.grid.horzLines.visible)}</div></div>
    {@render color('Pane separators', config.panes.separatorColor, (v) => patch({ panes: { separatorColor: v } }))}
    <div class="dialog-section-label appearance-section">MARGINS AND SPACING</div>
    {@render number('Top margin (%)', config.margins.top, 0, 40, 1, (v) => patch({ margins: { top: v } }))}
    {@render number('Bottom margin (%)', config.margins.bottom, 0, 40, 1, (v) => patch({ margins: { bottom: v } }))}
    {@render number('Right margin (bars)', config.margins.right, 0, 100, 1, (v) => patch({ margins: { right: v } }))}
    {@render number('Bar spacing multiplier', config.series.spacing, 0.5, 4, 0.1, (v) => patch({ series: { spacing: v } }))}

  {:else if tab === 'Scales and lines'}
    {@render color('Scale text color', config.layout.textColor, (v) => patch({ layout: { textColor: v } }))}
    {@render number('Scale text size', config.layout.fontSize, 8, 20, 1, (v) => patch({ layout: { fontSize: v } }))}
    {@render color('Scale border', config.priceScale.borderColor, (v) => patch({ priceScale: { borderColor: v } }))}
    <div class="dialog-section-label appearance-section">PRICE SCALE</div>
    {@render toggle('Price labels', config.priceScale.labelsVisible, (v) => patch({ priceScale: { labelsVisible: v } }))}
    {@render toggle('Last-price line', config.priceScale.currentPriceLine, (v) => patch({ priceScale: { currentPriceLine: v } }))}
    {@render toggle('Last-price label', config.priceScale.priceLabel, (v) => patch({ priceScale: { priceLabel: v } }))}
    {@render toggle('Bar-close countdown', config.priceScale.countdown, (v) => patch({ priceScale: { countdown: v } }))}
    {@render toggle('Logarithmic scale', config.priceScale.log, (v) => patch({ priceScale: { log: v } }))}
    {@render toggle('Invert price scale', config.priceScale.invert, (v) => patch({ priceScale: { invert: v } }))}
    <div class="dialog-section-label appearance-section">TIME SCALE</div>
    <label class="setting-row"><span class="setting-name"><strong>Time zone</strong></span><select value={config.timeScale.timezone} onchange={(e) => patch({ timeScale: { timezone: e.currentTarget.value } })}>{#each timezoneChoices(config.timeScale.timezone) as zone}<option value={zone.value}>{zone.label}</option>{/each}</select></label>

  {:else if tab === 'Crosshair'}
    <label class="setting-row"><span class="setting-name"><strong>Lines</strong></span><select value={extras.crosshair} onchange={(e) => changeExtras({ ...extras, crosshair: e.currentTarget.value as ChartExtras['crosshair'] })}><option value="both">Both</option><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option><option value="hidden">Hidden</option></select></label>
    {@render color('Crosshair color', config.crosshair.color, (v) => patch({ crosshair: { color: v } }))}
    {@render color('Axis label background', config.crosshair.labelBackground, (v) => patch({ crosshair: { labelBackground: v } }))}
    {@render number('Line width', config.crosshair.width, 0.5, 8, 0.5, (v) => patch({ crosshair: { width: v } }))}
    {@render number('Opacity', config.crosshair.opacity, 0, 1, 0.05, (v) => patch({ crosshair: { opacity: v } }))}
    <label class="setting-row"><span class="setting-name"><strong>Line style</strong></span><select value={config.crosshair.style} onchange={(e) => patch({ crosshair: { style: e.currentTarget.value } })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
  {:else if tab === 'Volume'}
    {@render toggle('Show volume', extras.volume.visible, (v) => changeExtras({ ...extras, volume: { ...extras.volume, visible: v } }))}
    {@render color('Bullish volume', extras.volume.upColor, (v) => changeExtras({ ...extras, volume: { ...extras.volume, upColor: v } }))}
    {@render color('Bearish volume', extras.volume.downColor, (v) => changeExtras({ ...extras, volume: { ...extras.volume, downColor: v } }))}
    {@render number('Volume height (%)', extras.volume.heightPct, 5, 50, 1, (v) => changeExtras({ ...extras, volume: { ...extras.volume, heightPct: v } }))}
  {/if}
  {#if persistenceError}<p class="appearance-note" role="status">Preferences could not be saved. Changes remain active for this session.</p>{/if}
    </div>
  </div>
  <footer class="dialog-footer"><select class="appearance-template" aria-label="Appearance template" value="" onchange={(e) => { preset(e.currentTarget.value); e.currentTarget.value = ''; }}><option value="" disabled>Template</option><option value="dark">DeplyzeView Dark</option><option value="light">DeplyzeView Light</option><option value="reset">Restore defaults</option></select><div class="appearance-footer-actions"><button class="appearance-cancel" onclick={cancel}>Cancel</button><button class="done-button" onclick={close}>Ok</button></div></footer>
</dialog>
