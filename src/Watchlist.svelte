<script lang="ts">
  import { Bookmark, ChevronDown, Plus, X, MoreHorizontal, ListTree, Droplet, Mountain, Globe, Bitcoin, BarChart3 } from 'lucide-svelte';
  import { watchlistCategory, reorderWatchlist, formatWatchlistNumber, type WatchlistItem, type WatchlistCollection } from './watchlist';
  import type { WatchlistQuote } from './watchlist-quotes';
  export let items: WatchlistItem[];
  export let collection: WatchlistCollection;
  export let quotes: Record<string, { quote?: WatchlistQuote; error?: string }>;
  export let symbol: string;
  export let provider: string;
  export let loading = false;
  export let storageError = false;
  export let select: (item: WatchlistItem) => void;
  export let add: () => void;
  export let remove: (identity: string) => void;
  export let reorder: (items: WatchlistItem[]) => void;
  export let switchList: (id: string) => void;
  export let createList: (name: string) => void;
  export let refresh: () => void;
  let menu: 'lists' | 'options' | null = null;
  let name = '';
  let collapsed: string[] = [];
  let width = 320;
  let dragging: string | null = null;
  let dropTarget: string | null = null;
  let resize: { pointer: number; x: number; width: number } | null = null;
  try { width = Math.max(300, Math.min(520, Number(localStorage.getItem('deplyzeview.watchlist.width')) || 320)); collapsed = JSON.parse(localStorage.getItem('deplyzeview.watchlist.collapsed') ?? '[]'); if (!Array.isArray(collapsed)) collapsed = []; } catch { /* Defaults remain usable. */ }
  $: groups = [...new Set(items.map(watchlistCategory))].map(category => ({ category, items: items.filter(item => watchlistCategory(item) === category) }));
  $: active = items.find(item => item.symbol === symbol && item.provider === provider);
  $: listName = collection.lists.find(list => list.id === collection.activeId)?.name ?? 'Watchlist';
  function persist(key: string, value: unknown) { try { localStorage.setItem(`deplyzeview.watchlist.${key}`, JSON.stringify(value)); } catch { storageError = true; } }
  function toggle(category: string) { collapsed = collapsed.includes(category) ? collapsed.filter(value => value !== category) : [...collapsed, category]; persist('collapsed', collapsed); }
  function setWidth(next: number) { width = Math.max(300, Math.min(520, window.innerWidth - 350, next)); }
  function finishResize() { resize = null; persist('width', width); }
  function drop(target: string) { if (dragging) reorder(reorderWatchlist(items, dragging, target)); dragging = null; dropTarget = null; }
  function rowKey(event: KeyboardEvent, item: WatchlistItem) {
    const rows = groups.flatMap(group => collapsed.includes(group.category) ? [] : group.items);
    const index = rows.findIndex(row => row.identity === item.identity);
    if (event.key === 'Delete') { event.preventDefault(); remove(item.identity); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (!next) return;
      if (event.altKey) reorder(reorderWatchlist(items, item.identity, next.identity));
      else { select(next); (event.currentTarget as HTMLElement).closest('.wl-items')?.querySelectorAll<HTMLButtonElement>('.wl-select')[rows.indexOf(next)]?.focus(); }
    }
  }
  const tone = (value: number | null | undefined) => value == null || value === 0 ? '' : value > 0 ? 'positive' : 'negative';
  const percent = (value: number | null | undefined) => value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}%`;
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape') menu = null; }} />
<section class="wl-panel" style:width={`${width}px`} aria-label="Watchlist">
  <div class="wl-resizer" role="slider" aria-label="Resize watchlist" aria-orientation="vertical" aria-valuemin={300} aria-valuemax={520} aria-valuenow={Math.round(width)} tabindex="0"
    onpointerdown={(event) => { if (event.button !== 0) return; event.preventDefault(); resize = { pointer: event.pointerId, x: event.clientX, width }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }}
    onpointermove={(event) => { if (resize?.pointer === event.pointerId) setWidth(resize.width + resize.x - event.clientX); }}
    onpointerup={finishResize} onpointercancel={finishResize} onlostpointercapture={finishResize}
    ondblclick={() => { width = 320; persist('width', width); }}
    onkeydown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setWidth(event.key === 'Home' ? 300 : event.key === 'End' ? 520 : width + (event.key === 'ArrowLeft' ? 16 : -16)); persist('width', width); } }}></div>
  <header class="wl-header">
    <button class="wl-title" aria-label="Switch watchlist" aria-expanded={menu === 'lists'} onclick={() => menu = menu === 'lists' ? null : 'lists'}><span>{listName}</span><ChevronDown size={12}/></button>
    <button class="wl-control" aria-label="Add symbol to watchlist" title="Add symbol" onclick={add}><Plus size={19}/></button>
    <button class="wl-control" aria-label="Toggle all categories" title="Expand / collapse categories" onclick={() => { collapsed = groups.every(group => collapsed.includes(group.category)) ? [] : groups.map(group => group.category); persist('collapsed', collapsed); }}><ListTree size={17}/></button>
    <button class="wl-control" aria-label="Watchlist options" aria-expanded={menu === 'options'} onclick={() => menu = menu === 'options' ? null : 'options'}><MoreHorizontal size={18}/></button>
  </header>
  {#if menu}
    <button class="wl-dismiss" tabindex="-1" aria-label="Close watchlist menu" onclick={() => menu = null}></button>
    <div class="wl-menu">
      {#if menu === 'lists'}
        {#each collection.lists as list}<button class:current={list.id === collection.activeId} onclick={() => { switchList(list.id); menu = null; }}>{list.name}<span>{list.items.length}</span></button>{/each}
        <form onsubmit={(event) => { event.preventDefault(); if (name.trim()) { createList(name.trim()); name = ''; menu = null; } }}><input aria-label="New watchlist name" placeholder="New watchlist" maxlength="40" bind:value={name}/><button aria-label="Create watchlist" disabled={!name.trim()}><Plus size={16}/></button></form>
      {:else}<button onclick={() => { refresh(); menu = null; }}>Refresh quotes</button><span class="wl-menu-note">Quotes refresh every 30s. Drag rows within a category to reorder; Alt + ↑ / ↓ also works.</span>{/if}
    </div>
  {/if}
  <div class="wl-columns wl-grid"><span>Symbol</span><span>Last</span><span>Chg</span><span>Chg%</span></div>
  <div class="wl-items">
    {#each groups as group (group.category)}
      <button class="wl-section" aria-expanded={!collapsed.includes(group.category)} onclick={() => toggle(group.category)}><ChevronDown size={12} class={collapsed.includes(group.category) ? 'folded' : ''}/>{group.category}</button>
      {#if !collapsed.includes(group.category)}
        {#each group.items as item (item.identity)}
          {@const snapshot = quotes[item.identity]}
          {@const quote = snapshot?.quote}
          <div class="wl-row" class:active={item.identity === active?.identity} class:dragging={dragging === item.identity} class:drop-target={dropTarget === item.identity}>
            <button class="wl-select wl-grid" draggable="true" aria-pressed={item.identity === active?.identity} aria-label={`Load ${item.symbol} from ${item.provider}`} title={`${item.name} · ${item.provider}\n${snapshot?.error ?? (quote ? `${quote.freshness} · ${new Date(quote.asOf).toLocaleString()}` : 'Waiting for quote')}`}
              onclick={() => select(item)} onkeydown={(event) => rowKey(event, item)}
              ondragstart={(event) => { dragging = item.identity; if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.identity); } }}
              ondragover={(event) => { if (dragging && group.items.some(row => row.identity === dragging)) { event.preventDefault(); dropTarget = item.identity; } }}
              ondrop={(event) => { event.preventDefault(); drop(item.identity); }} ondragend={() => { dragging = null; dropTarget = null; }}>
              <span class="wl-symbol"><span class="wl-icon" data-category={group.category}>{#if /OIL|WTI|BRENT/.test(item.symbol)}<Droplet size={12}/>{:else if /XAU|XAG/.test(item.symbol)}<Mountain size={13}/>{:else if group.category === 'Forex'}<Globe size={13}/>{:else if group.category === 'Crypto'}<Bitcoin size={13}/>{:else}<BarChart3 size={13}/>{/if}</span><span>{item.symbol}</span></span>
              <span class="wl-price" class:stale={!!snapshot?.error}>{formatWatchlistNumber(quote?.price, item)}</span><span class={tone(quote?.change)}>{formatWatchlistNumber(quote?.change, item, true)}</span><span class={tone(quote?.changePercent)}>{percent(quote?.changePercent)}</span>
            </button>
            <button class="wl-remove" aria-label={`Remove ${item.symbol} from watchlist`} title="Remove symbol" onclick={() => remove(item.identity)}><X size={12}/></button>
          </div>
        {/each}
      {/if}
    {/each}
    {#if !items.length}<div class="wl-empty"><Bookmark size={24}/><strong>Your watchlist is empty</strong><span>Add symbols to follow their prices.</span><button onclick={add}><Plus size={14}/> Add symbol</button></div>{/if}
  </div>
  {#if storageError}<div class="wl-error" role="status">Changes could not be saved on this device.</div>{/if}
  <footer class="wl-footer"><Bookmark size={17}/><strong>{active?.symbol ?? listName}</strong><span title="Provider snapshots refresh every 30 seconds">{loading ? 'Updating…' : `${items.length} symbols · 30s`}</span></footer>
</section>

<style>
  .wl-panel{position:relative;min-width:300px;max-width:calc(100vw - 350px);height:100%;display:flex;flex-direction:column;background:var(--bg);color:var(--tone-c7c9ce,#c7c9ce);--wl-positive:#83ae96;--wl-negative:#c77d70}
  :global([data-theme="light"]) .wl-panel{--wl-positive:#357455;--wl-negative:#aa5043}
  button{border-radius:3px}button:focus-visible,input:focus-visible{outline:1px solid var(--accent);outline-offset:-1px}
  .wl-header{height:46px;flex:none;display:flex;align-items:center;gap:3px;padding:0 12px}
  .wl-title{min-width:0;margin-right:auto;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:5px 2px}.wl-title span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .wl-control{display:grid;place-items:center;width:28px;height:28px;flex:none;color:var(--tone-9a9ca5,#9a9ca5)}.wl-control:hover,.wl-title:hover{background:var(--tone-26282e,#26282e)}
  .wl-grid{display:grid;grid-template-columns:minmax(78px,1.2fr) minmax(67px,1fr) minmax(62px,.9fr) minmax(50px,.8fr);align-items:center;gap:4px;padding:0 10px 0 16px}
  .wl-grid>span:not(:first-child){text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
  .wl-columns{height:30px;flex:none;border-bottom:1px solid var(--line);color:var(--tone-92949d,#92949d);font-size:11px}
  .wl-items{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--tone-41434b,#41434b) transparent}
  .wl-section{width:100%;height:35px;display:flex;align-items:center;gap:10px;padding:0 18px;color:var(--tone-858791,#858791);font-size:9px;text-transform:uppercase;text-align:left;border-top:1px solid var(--line);border-radius:0}.wl-section:first-child{border-top:0}.wl-section :global(svg){transition:transform .12s}.wl-section :global(.folded){transform:rotate(-90deg)}
  .wl-row{height:30px;position:relative;border-radius:3px;transition:background .1s}.wl-row:hover{background:var(--tone-1e2025,#1e2025)}.wl-row.active{background:var(--tone-202127,#202127);box-shadow:inset 0 0 0 1px var(--tone-83858d,#83858d)}
  .wl-select{height:100%;width:100%;font-size:12px;text-align:left}.wl-symbol{min-width:0;display:flex;align-items:center;gap:6px}.wl-symbol>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wl-icon{width:18px;height:18px;display:grid;place-items:center;flex:none;border-radius:50%;background:var(--tone-34363d,#34363d);color:var(--tone-dadbe0,#dadbe0)}.wl-icon[data-category="Forex"]{color:var(--wl-positive)}.wl-icon[data-category="Commodities"],.wl-icon[data-category="Futures"]{color:var(--accent)}
  .positive{color:var(--wl-positive)}.negative{color:var(--wl-negative)}.stale{opacity:.6}.wl-remove{position:absolute;left:0;top:7px;width:15px;height:16px;display:grid;place-items:center;padding:0;opacity:0;background:var(--bg)}.wl-row:hover .wl-remove,.wl-row:focus-within .wl-remove{opacity:1}.wl-remove:hover{color:var(--wl-negative)}.dragging{opacity:.4}.drop-target{box-shadow:inset 0 2px var(--accent)}
  .wl-footer{height:48px;flex:none;display:flex;align-items:center;gap:8px;padding:0 16px;border-top:3px solid var(--line);font-size:11px}.wl-footer strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wl-footer>span{margin-left:auto;white-space:nowrap;font-size:9px;color:var(--tone-858791,#858791)}
  .wl-resizer{position:absolute;z-index:6;left:-3px;top:0;bottom:0;width:6px;cursor:col-resize;touch-action:none}.wl-resizer:hover,.wl-resizer:focus-visible{background:color-mix(in srgb,var(--accent) 55%,transparent)}
  .wl-dismiss{position:fixed;inset:0;z-index:19;cursor:default}.wl-menu{position:absolute;z-index:20;top:41px;left:8px;right:8px;padding:5px;border:1px solid var(--line);border-radius:5px;background:var(--tone-191a1f,#191a1f);box-shadow:0 8px 24px #0003}.wl-menu>button{display:flex;justify-content:space-between;width:100%;padding:9px;text-align:left}.wl-menu>button:hover,.wl-menu .current{background:var(--tone-26282e,#26282e)}.wl-menu form{display:flex;border-top:1px solid var(--line);margin-top:4px;padding:7px 4px;gap:5px}.wl-menu input{min-width:0;flex:1;background:var(--bg);color:inherit;border:1px solid var(--line);padding:6px;border-radius:3px}.wl-menu-note{display:block;padding:8px;color:var(--tone-92949d,#92949d);line-height:1.6;font-size:10px}
  .wl-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;height:100%;min-height:180px;color:var(--tone-92949d,#92949d)}.wl-empty button{display:flex;align-items:center;gap:5px;border:1px solid var(--line);padding:8px}.wl-error{padding:8px;color:var(--wl-negative);font-size:10px}
  @media(prefers-reduced-motion:reduce){.wl-row,.wl-section :global(svg){transition:none}}
</style>
