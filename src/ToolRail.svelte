<script lang="ts">
  import './tool-rail.css';
  import designIcons from '../design/tool-icons.json';
  import toolbarHtml from '../design/Toolbar.dc.html?raw';
  import { customToolType } from './custom-drawing-tools';
  import { setPositionToolPreferredDirection } from './drawing-tv-style';

  type Tool = { id: string | null; key: string; label: string; labelText: string; icon: string; shortcut: string; section: string };
  type Group = { id: string; label: string; tools: Tool[]; sections: { title: string; tools: Tool[] }[] };
  type Prefs = {
    favorites: string[];
    lastUsed: Record<string, string>;
    visible?: boolean;
    position?: { x: number; y: number };
  };

  let {
    chart,
    groups: rawGroups,
    prefs = $bindable({ favorites: [], lastUsed: {} } as Prefs),
    onClear = () => {},
    onLockAll = (_on: boolean) => {},
    onHideAll = (_on: boolean) => {},
    modeOff = null,
    disabled = false
  }: {
    chart: any;
    groups: any[];
    prefs?: Prefs;
    onClear?: () => void;
    onLockAll?: (on: boolean) => void;
    onHideAll?: (on: boolean) => void;
    modeOff?: string | null;
    disabled?: boolean;
  } = $props();

  // Rail glyphs come from Toolbar.dc.html; flyout content comes only from tool-icons.json.
  const toolbarDoc = new DOMParser().parseFromString(toolbarHtml, 'text/html');
  function railGlyph(key: string): string {
    const button = [...toolbarDoc.querySelectorAll<HTMLButtonElement>('button.tool')]
      .find((node) => node.getAttribute('class')?.includes(`{{c.${key}}}`));
    return button?.querySelector('svg')?.innerHTML ?? '';
  }
  const GLYPH: Record<string, string> = {
    cursor: railGlyph('cross'), measure: railGlyph('ruler'), magnifier: railGlyph('zoom'),
    stay: railGlyph('pencil'), lock: railGlyph('lock'), eye: railGlyph('eye'), trash: railGlyph('trash')
  };
  const DESIGN_GROUPS: Record<string, string> = {
    Lines: 'lines-channels-pitchforks', Fib: 'fibonacci-gann', Patterns: 'patterns-waves-harmonics',
    Forecasting: 'measurements', Shapes: 'brushes-arrows-shapes', Text: 'text'
  };
  const RAIL_KEYS: Record<string, string> = {
    'lines-channels-pitchforks': 'trend', 'fibonacci-gann': 'fib',
    'patterns-waves-harmonics': 'pattern', measurements: 'proj',
    'brushes-arrows-shapes': 'brush', text: 'text', icons: 'emoji'
  };
  function plainLabel(label: string): string {
    return label.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
  }
  function labelKey(label: string): string {
    return plainLabel(label).replace(/&/g, ' and ').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  const NATIVE_ALIASES: Record<string, string> = {
    regressiontrend: 'regressionchannel', fibtimezone: 'fibtimezones',
    gannsquarefixed: 'gannsquare', cypherpattern: 'cypher',
    elliottimpulsewave12345: 'elliottimpulse', longposition: 'position',
    shortposition: 'position', pricerange: 'datepricerange', daterange: 'datepricerange',
    flagmark: 'flagmark'
  };
  function buildGroups(gs: any[]): Group[] {
    const catalog = new Map<string, string[]>();
    for (const group of gs ?? []) for (const tool of group.tools ?? []) {
      const key = labelKey(tool.label);
      catalog.set(key, [...(catalog.get(key) ?? []), tool.type]);
    }
    const built = Object.entries(designIcons as Record<string, any[]>).map(([designGroup, entries]) => {
      const groupId = DESIGN_GROUPS[designGroup] ?? designGroup.toLowerCase();
      const velaGroup = (gs ?? []).find((group: any) => group.id === groupId);
      const tools: Tool[] = entries.map((entry, index) => {
        const key = labelKey(entry.label);
        const ids = catalog.get(key) ?? [];
        const resolvedId = ids.length === 1 ? ids[0] : ids.length ? null : NATIVE_ALIASES[key] ?? customToolType(entry.label) ?? null;
        return { id: resolvedId, key: `${designGroup}:${index}`, label: entry.label,
          labelText: plainLabel(entry.label), icon: entry.svg, shortcut: entry.shortcut ?? '', section: entry.section };
      });
      const sections = [...new Set(tools.map((tool) => tool.section))].map((title) => ({ title, tools: tools.filter((tool) => tool.section === title) }));
      return { id: groupId, label: velaGroup?.label ?? designGroup, tools, sections };
    });
    const iconsGroup = (gs ?? []).find((group: any) => group.id === 'icons');
    if (iconsGroup && !('Icons' in designIcons)) built.push({ id: iconsGroup.id, label: iconsGroup.label, tools: [], sections: [] });
    return built;
  }
  const groups = $derived(buildGroups(rawGroups));
  const byId = $derived(new Map(groups.flatMap((g) => g.tools.filter((t) => t.id).map((t) => [t.id!, { tool: t, group: g }] as const))));
  const favTools = $derived((prefs.favorites ?? []).map((id) => byId.get(id)?.tool).filter((t): t is Tool => !!t));

  let active = $state<string | null>(null);
  let measure = $state(false);
  let stay = $state(false);
  let locked = $state(false);
  let hidden = $state(false);
  let openId = $state<string | null>(null);
  let root: HTMLElement;

  function sync() {
    active = chart.drawings.getTool();
  }

  // ASSUMPTION: your chart emits 'drawing:tool'. Copy the subscription from your current DrawingToolbar.svelte if it differs.
  $effect(() => {
    sync();
    const handler = ({ type }: { type: string | null }) => { sync(); active = type; };
    const off = chart.on?.('drawing:tool', handler);
    return () => (typeof off === 'function' ? off() : chart.off?.('drawing:tool', handler));
  });

  function leaveMeasure() {
    if (measure) {
      measure = false;
      chart.drawings.setMode(modeOff);
    }
  }

  function cursor() {
    leaveMeasure();
    chart.drawings.setTool(null);
    openId = null;
    sync();
  }

  function pick(t: Tool, g: Group) {
    if (!t.id) return;
    leaveMeasure();
    const lbl = t.labelText.toLowerCase();
    if (lbl.includes('short')) {
      setPositionToolPreferredDirection('short');
    } else if (lbl.includes('long')) {
      setPositionToolPreferredDirection('long');
    }
    chart.drawings.setTool(t.id);
    prefs = { ...prefs, lastUsed: { ...prefs.lastUsed, [g.id]: t.id } };
    openId = null;
    sync();
  }

  function toggleFav(id: string | null) {
    if (!id) return;
    const fav = prefs.favorites ?? [];
    prefs = { ...prefs, favorites: fav.includes(id) ? fav.filter((x) => x !== id) : [...fav, id], visible: true };
  }

  function toggleMeasure() {
    if (measure) return leaveMeasure();
    chart.drawings.setTool(null);
    chart.drawings.setMode('measure');
    measure = true;
    openId = null;
    sync();
  }

  function magnifier() {
    if (byId.has('magnifier')) pick(byId.get('magnifier')!.tool, byId.get('magnifier')!.group);
  }

  function toggleStay() {
    stay = !stay;
    chart.drawings.setStayMode(stay);
  }

  function toggleLock() {
    locked = !locked;
    onLockAll(locked);
  }

  function toggleHide() {
    hidden = !hidden;
    onHideAll(hidden);
  }

  const groupActive = (g: Group) => !!active && g.tools.some((t) => t.id === active);

  // favorites bar drag
  let drag: { dx: number; dy: number } | null = null;
  const pos = $derived(prefs.position ?? { x: 420, y: 12 });
  function gripDown(e: PointerEvent) {
    drag = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function gripMove(e: PointerEvent) {
    if (drag) prefs = { ...prefs, position: { x: e.clientX - drag.dx, y: e.clientY - drag.dy } };
  }
  function gripUp() {
    drag = null;
  }

  function outside(e: PointerEvent) {
    if (openId && root && !root.contains(e.target as Node)) openId = null;
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={(e) => e.key === 'Escape' && (openId = null)} />

<div class="tr" class:tr-off={disabled} bind:this={root}>
  <div class="tr-rail" role="toolbar" aria-label="Drawing tools" aria-orientation="vertical">
    <button class="tr-btn" class:on={active === null && !measure} aria-label="Cursor" aria-pressed={active === null && !measure} onclick={cursor}>
      <span class="tr-tile"><svg viewBox="0 0 28 28" aria-hidden="true">{@html GLYPH.cursor}</svg></span>
    </button>

    {#each groups as g (g.id)}
      <button
        class="tr-btn"
        class:on={groupActive(g)}
        class:open={openId === g.id}
        disabled={!g.tools.length}
        aria-label={g.label}
        aria-haspopup="menu"
        aria-expanded={openId === g.id}
        onclick={() => g.tools.length && (openId = openId === g.id ? null : g.id)}
      >
        <span class="tr-tile"><svg viewBox="0 0 28 28" aria-hidden="true">{@html railGlyph(RAIL_KEYS[g.id] ?? '')}</svg></span>
      </button>
    {/each}

    <div class="tr-div"></div>
    <button class="tr-btn" class:on={measure} aria-label="Measure" aria-pressed={measure} onclick={toggleMeasure}>
      <span class="tr-tile"><svg viewBox="0 0 28 28" aria-hidden="true">{@html GLYPH.measure}</svg></span>
    </button>
    <button class="tr-btn" class:on={active === 'magnifier'} aria-label="Zoom in" aria-pressed={active === 'magnifier'} onclick={magnifier}>
      <span class="tr-tile"><svg viewBox="0 0 28 28" aria-hidden="true">{@html GLYPH.magnifier}</svg></span>
    </button>

    <div class="tr-div"></div>
    <button class="tr-btn" class:on={stay} aria-label="Stay in drawing mode" aria-pressed={stay} onclick={toggleStay}>
      <span class="tr-tile"><svg viewBox="0 0 28 28" aria-hidden="true">{@html GLYPH.stay}</svg></span>
    </button>
    <button class="tr-btn" class:on={locked} aria-label="Lock all drawings" aria-pressed={locked} onclick={toggleLock}>
      <span class="tr-tile"><svg viewBox="0 0 28 28" aria-hidden="true">{@html GLYPH.lock}</svg></span>
    </button>
    <button class="tr-btn" class:on={hidden} aria-label="Hide all drawings" aria-pressed={hidden} onclick={toggleHide}>
      <span class="tr-tile"><svg viewBox="0 0 28 28" aria-hidden="true">{@html GLYPH.eye}</svg></span>
    </button>

    <div class="tr-div"></div>
    <button class="tr-btn" aria-label="Remove drawings" onclick={onClear}>
      <span class="tr-tile"><svg viewBox="0 0 28 28" aria-hidden="true">{@html GLYPH.trash}</svg></span>
    </button>
  </div>

  {#each groups as g (g.id)}
    {#if openId === g.id && !disabled}
      <div class="tr-fly" role="menu" aria-label={g.label}>
        {#each g.sections as s, i}
          {#if i > 0}<div class="tr-sep"></div>{/if}
          {#if s.title}<div class="tr-hd">{s.title}</div>{/if}
          {#each s.tools as t (t.key)}
            <div class="tr-row" class:on={!!t.id && active === t.id} class:unavailable={!t.id}>
              <button class="tr-pick" role="menuitem" disabled={!t.id} onclick={() => pick(t, g)}>
                <span class="tr-ico">{@html t.icon}</span>
                <span class="tr-lbl">{@html t.label}</span>
                {#if t.shortcut}<span class="tr-key">{t.shortcut}</span>{/if}
              </button>
              <button
                class="tr-star"
                disabled={!t.id}
                class:fav={!!t.id && prefs.favorites?.includes(t.id)}
                aria-label="Favorite {t.labelText}"
                aria-pressed={!!t.id && prefs.favorites?.includes(t.id)}
                onclick={() => toggleFav(t.id)}
              ></button>
            </div>
          {/each}
        {/each}
      </div>
    {/if}
  {/each}
</div>

{#if favTools.length && prefs.visible !== false}
  <div class="tr-favs" style="left:{pos.x}px;top:{pos.y}px" role="toolbar" aria-label="Favorite drawing tools">
    <div class="tr-grip" role="presentation" onpointerdown={gripDown} onpointermove={gripMove} onpointerup={gripUp}>
      <svg width="16" height="28" viewBox="0 0 16 28" aria-hidden="true" fill="currentColor"><circle cx="6" cy="9" r="1.1"/><circle cx="10" cy="9" r="1.1"/><circle cx="6" cy="14" r="1.1"/><circle cx="10" cy="14" r="1.1"/><circle cx="6" cy="19" r="1.1"/><circle cx="10" cy="19" r="1.1"/></svg>
    </div>
    {#each favTools as t (t.key)}
      <button class="tr-fv" class:on={active === t.id} aria-label={t.labelText} title={t.labelText} onclick={() => {
        if (!t.id) return;
        const lbl = t.labelText.toLowerCase();
        if (lbl.includes('short')) setPositionToolPreferredDirection('short');
        else if (lbl.includes('long')) setPositionToolPreferredDirection('long');
        chart.drawings.setTool(t.id);
      }}>
        {@html t.icon}
      </button>
    {/each}
  </div>
{/if}
