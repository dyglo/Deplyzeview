<script lang="ts">
  import {
    Bookmark, ChevronDown, Plus, X, MoreHorizontal, Search, RefreshCw,
    ListTree, Copy, Trash2, Check, ExternalLink, ArrowUp, ArrowDown, Edit2
  } from 'lucide-svelte';
  import {
    watchlistCategory, reorderWatchlist, formatWatchlistNumber,
    formatWatchlistPriceParts, type WatchlistItem, type WatchlistCollection
  } from './watchlist';
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
  export let renameList: ((id: string, name: string) => void) | undefined = undefined;
  export let deleteList: ((id: string) => void) | undefined = undefined;
  export let refresh: () => void;

  let menu: 'lists' | 'options' | null = null;
  let newListName = '';
  let editingListId: string | null = null;
  let editingListName = '';
  let filterOpen = false;
  let filterQuery = '';
  let collapsed: string[] = [];
  let width = 320;
  let dragging: string | null = null;
  let dropTarget: string | null = null;
  let resize: { pointer: number; x: number; width: number } | null = null;

  type SortCol = 'symbol' | 'last' | 'chg' | 'chgPercent' | null;
  let sortColumn: SortCol = null;
  let sortDirection: 'asc' | 'desc' = 'asc';

  let contextMenu: { x: number; y: number; item: WatchlistItem } | null = null;
  let copiedToast: string | null = null;
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    width = Math.max(280, Math.min(520, Number(localStorage.getItem('deplyzeview.watchlist.width')) || 320));
    collapsed = JSON.parse(localStorage.getItem('deplyzeview.watchlist.collapsed') ?? '[]');
    if (!Array.isArray(collapsed)) collapsed = [];
  } catch {
    /* Safe fallback. */
  }

  $: active = items.find(item => item.symbol === symbol && item.provider === provider);
  $: listName = collection.lists.find(list => list.id === collection.activeId)?.name ?? 'Watchlist';

  $: filteredItems = filterQuery.trim()
    ? items.filter(item => {
        const q = filterQuery.toLowerCase();
        return item.symbol.toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || item.provider.toLowerCase().includes(q);
      })
    : items;

  $: groups = [...new Set(filteredItems.map(watchlistCategory))].map(category => {
    let catItems = filteredItems.filter(item => watchlistCategory(item) === category);
    if (sortColumn) {
      catItems = [...catItems].sort((a, b) => {
        let va: number | string = 0;
        let vb: number | string = 0;
        if (sortColumn === 'symbol') {
          va = a.symbol;
          vb = b.symbol;
          return sortDirection === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        const qa = quotes[a.identity]?.quote;
        const qb = quotes[b.identity]?.quote;
        if (sortColumn === 'last') {
          va = qa?.price ?? -Infinity;
          vb = qb?.price ?? -Infinity;
        } else if (sortColumn === 'chg') {
          va = qa?.change ?? -Infinity;
          vb = qb?.change ?? -Infinity;
        } else if (sortColumn === 'chgPercent') {
          va = qa?.changePercent ?? -Infinity;
          vb = qb?.changePercent ?? -Infinity;
        }
        return sortDirection === 'asc' ? (va > vb ? 1 : va < vb ? -1 : 0) : (va < vb ? 1 : va > vb ? -1 : 0);
      });
    }
    return { category, items: catItems };
  });

  function persist(key: string, value: unknown) {
    try {
      localStorage.setItem(`deplyzeview.watchlist.${key}`, JSON.stringify(value));
    } catch {
      storageError = true;
    }
  }

  function toggleCategory(category: string) {
    collapsed = collapsed.includes(category) ? collapsed.filter(val => val !== category) : [...collapsed, category];
    persist('collapsed', collapsed);
  }

  function toggleAllCategories() {
    const all = groups.map(g => g.category);
    collapsed = all.every(c => collapsed.includes(c)) ? [] : all;
    persist('collapsed', collapsed);
  }

  function setWidth(next: number) {
    width = Math.max(280, Math.min(520, window.innerWidth - 350, next));
  }

  function finishResize() {
    resize = null;
    persist('width', width);
  }

  function drop(target: string) {
    if (dragging) {
      sortColumn = null;
      reorder(reorderWatchlist(items, dragging, target));
    }
    dragging = null;
    dropTarget = null;
  }

  function rowKey(event: KeyboardEvent, item: WatchlistItem) {
    const rows = groups.flatMap(group => collapsed.includes(group.category) ? [] : group.items);
    const index = rows.findIndex(row => row.identity === item.identity);
    if (event.key === 'Delete') {
      event.preventDefault();
      remove(item.identity);
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (!next) return;
      if (event.altKey) {
        sortColumn = null;
        reorder(reorderWatchlist(items, item.identity, next.identity));
      } else {
        select(next);
        (event.currentTarget as HTMLElement).closest('.wl-items')?.querySelectorAll<HTMLButtonElement>('.wl-select')[rows.indexOf(next)]?.focus();
      }
    }
  }

  function toggleSort(col: 'symbol' | 'last' | 'chg' | 'chgPercent') {
    if (sortColumn === col) {
      if (sortDirection === 'asc') sortDirection = 'desc';
      else {
        sortColumn = null;
        sortDirection = 'asc';
      }
    } else {
      sortColumn = col;
      sortDirection = 'desc';
    }
  }

  function openContextMenu(event: MouseEvent, item: WatchlistItem) {
    event.preventDefault();
    contextMenu = {
      x: Math.min(event.clientX, window.innerWidth - 180),
      y: Math.min(event.clientY, window.innerHeight - 150),
      item
    };
  }

  function copySymbol(sym: string) {
    void navigator.clipboard?.writeText(sym);
    copiedToast = `Copied ${sym}`;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => copiedToast = null, 2000);
  }

  function startRename(id: string, current: string) {
    editingListId = id;
    editingListName = current;
  }

  function saveRename() {
    if (editingListId && editingListName.trim() && renameList) {
      renameList(editingListId, editingListName.trim());
    }
    editingListId = null;
    editingListName = '';
  }

  function clearCurrentWatchlist() {
    if (confirm(`Remove all ${items.length} symbols from "${listName}"?`)) {
      reorder([]);
      menu = null;
    }
  }

  const focusOnMount = (el: HTMLElement) => { el.focus(); };

  const tone = (value: number | null | undefined) => (value == null || value === 0 ? '' : value > 0 ? 'positive' : 'negative');
  const percent = (value: number | null | undefined) => (value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}%`);
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      menu = null;
      contextMenu = null;
      if (filterOpen && !filterQuery) filterOpen = false;
    }
  }}
  onclick={() => { contextMenu = null; }}
/>

<section class="wl-panel" style:width={`${width}px`} aria-label="Watchlist">
  <!-- Left Resizer Handle -->
  <div
    class="wl-resizer"
    role="slider"
    aria-label="Resize watchlist"
    aria-orientation="vertical"
    aria-valuemin={280}
    aria-valuemax={520}
    aria-valuenow={Math.round(width)}
    tabindex="0"
    onpointerdown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      resize = { pointer: event.pointerId, x: event.clientX, width };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }}
    onpointermove={(event) => {
      if (resize?.pointer === event.pointerId) setWidth(resize.width + resize.x - event.clientX);
    }}
    onpointerup={finishResize}
    onpointercancel={finishResize}
    onlostpointercapture={finishResize}
    ondblclick={() => { width = 320; persist('width', width); }}
    onkeydown={(event) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        setWidth(event.key === 'Home' ? 280 : event.key === 'End' ? 520 : width + (event.key === 'ArrowLeft' ? 16 : -16));
        persist('width', width);
      }
    }}
  ></div>

  <!-- Watchlist Header -->
  <header class="wl-header">
    <button
      class="wl-title"
      aria-label="Switch watchlist"
      aria-expanded={menu === 'lists'}
      title="Watchlists"
      onclick={() => (menu = menu === 'lists' ? null : 'lists')}
    >
      <span class="wl-title-text">{listName}</span>
      <ChevronDown size={14} class={`wl-chevron ${menu === 'lists' ? 'open' : ''}`} />
    </button>

    <div class="wl-header-actions">
      <button
        class="wl-control"
        aria-label="Add symbol"
        title="Add symbol (+)"
        onclick={add}
      >
        <Plus size={16} />
      </button>

      <button
        class="wl-control"
        class:active={filterOpen}
        aria-label="Filter watchlist"
        title="Filter watchlist"
        onclick={() => {
          filterOpen = !filterOpen;
          if (!filterOpen) filterQuery = '';
        }}
      >
        <Search size={14} />
      </button>

      <button
        class="wl-control"
        aria-label="Toggle all categories"
        title="Expand / collapse sections"
        onclick={toggleAllCategories}
      >
        <ListTree size={15} />
      </button>

      <button
        class="wl-control"
        aria-label="Watchlist options"
        aria-expanded={menu === 'options'}
        title="More options"
        onclick={() => (menu = menu === 'options' ? null : 'options')}
      >
        <MoreHorizontal size={16} />
      </button>
    </div>
  </header>

  <!-- Inline Search / Filter Bar -->
  {#if filterOpen}
    <div class="wl-filter-bar">
      <Search size={13} class="wl-filter-icon" />
      <input
        type="text"
        placeholder="Search watchlist..."
        bind:value={filterQuery}
        use:focusOnMount
        aria-label="Search symbols in watchlist"
      />
      {#if filterQuery}
        <button class="wl-filter-clear" aria-label="Clear filter" onclick={() => (filterQuery = '')}>
          <X size={12} />
        </button>
      {/if}
    </div>
  {/if}

  <!-- Watchlists Switcher Popover -->
  {#if menu === 'lists'}
    <button class="wl-dismiss" tabindex="-1" aria-label="Close watchlist menu" onclick={() => (menu = null)}></button>
    <div class="wl-popover wl-menu-lists" role="menu">
      <div class="wl-menu-header">WATCHLISTS</div>
      <div class="wl-menu-list">
        {#each collection.lists as list (list.id)}
          <div class="wl-menu-list-row" class:current={list.id === collection.activeId}>
            {#if editingListId === list.id}
              <form class="wl-rename-form" onsubmit={(e) => { e.preventDefault(); saveRename(); }}>
                <input bind:value={editingListName} maxlength="40" use:focusOnMount onblur={saveRename} />
                <button type="submit" aria-label="Save name"><Check size={13} /></button>
              </form>
            {:else}
              <button
                class="wl-menu-item"
                role="menuitem"
                onclick={() => { switchList(list.id); menu = null; }}
              >
                <span class="wl-check">{#if list.id === collection.activeId}<Check size={13} />{/if}</span>
                <span class="wl-item-name">{list.name}</span>
                <span class="wl-item-count">{list.items.length}</span>
              </button>
              {#if renameList && list.id === collection.activeId}
                <button
                  class="wl-sub-action"
                  title="Rename watchlist"
                  aria-label={`Rename ${list.name}`}
                  onclick={() => startRename(list.id, list.name)}
                >
                  <Edit2 size={12} />
                </button>
              {/if}
              {#if deleteList && collection.lists.length > 1 && list.id !== 'default'}
                <button
                  class="wl-sub-action delete"
                  title="Delete watchlist"
                  aria-label={`Delete ${list.name}`}
                  onclick={() => {
                    if (confirm(`Delete watchlist "${list.name}"?`)) deleteList?.(list.id);
                  }}
                >
                  <Trash2 size={12} />
                </button>
              {/if}
            {/if}
          </div>
        {/each}
      </div>

      <div class="wl-menu-divider"></div>
      <form
        class="wl-new-list-form"
        onsubmit={(event) => {
          event.preventDefault();
          if (newListName.trim()) {
            createList(newListName.trim());
            newListName = '';
            menu = null;
          }
        }}
      >
        <input
          aria-label="New watchlist name"
          placeholder="+ New watchlist name"
          maxlength="40"
          bind:value={newListName}
        />
        <button aria-label="Create watchlist" disabled={!newListName.trim()} class="wl-create-btn">
          <Plus size={14} />
        </button>
      </form>

      {#if items.length > 0}
        <div class="wl-menu-divider"></div>
        <button class="wl-menu-action danger" onclick={clearCurrentWatchlist}>
          <Trash2 size={13} />
          <span>Clear all symbols</span>
        </button>
      {/if}
    </div>
  {/if}

  <!-- Watchlist Options Popover -->
  {#if menu === 'options'}
    <button class="wl-dismiss" tabindex="-1" aria-label="Close watchlist menu" onclick={() => (menu = null)}></button>
    <div class="wl-popover wl-menu-options" role="menu">
      <button class="wl-menu-action" onclick={() => { refresh(); menu = null; }}>
        <RefreshCw size={13} class={loading ? 'spinning' : ''} />
        <span>Refresh quotes</span>
      </button>
      <button class="wl-menu-action" onclick={() => { toggleAllCategories(); menu = null; }}>
        <ListTree size={13} />
        <span>Toggle all sections</span>
      </button>

      <div class="wl-menu-divider"></div>
      <div class="wl-menu-header">SORTING</div>
      <button class="wl-menu-action" onclick={() => { toggleSort('symbol'); menu = null; }}>
        <span>Symbol (A–Z)</span>
        {#if sortColumn === 'symbol'}<Check size={13} class="wl-opt-check" />{/if}
      </button>
      <button class="wl-menu-action" onclick={() => { sortColumn = 'chgPercent'; sortDirection = 'desc'; menu = null; }}>
        <span>Change % (High to Low)</span>
        {#if sortColumn === 'chgPercent' && sortDirection === 'desc'}<Check size={13} class="wl-opt-check" />{/if}
      </button>
      <button class="wl-menu-action" onclick={() => { sortColumn = 'chgPercent'; sortDirection = 'asc'; menu = null; }}>
        <span>Change % (Low to High)</span>
        {#if sortColumn === 'chgPercent' && sortDirection === 'asc'}<Check size={13} class="wl-opt-check" />{/if}
      </button>
      {#if sortColumn}
        <button class="wl-menu-action" onclick={() => { sortColumn = null; menu = null; }}>
          <span class="muted-text">Reset to custom order</span>
        </button>
      {/if}

      <div class="wl-menu-divider"></div>
      <div class="wl-menu-shortcuts">
        <span class="wl-shortcut-line"><kbd>↑</kbd><kbd>↓</kbd> Switch symbol</span>
        <span class="wl-shortcut-line"><kbd>Alt</kbd>+<kbd>↑</kbd><kbd>↓</kbd> Move row</span>
        <span class="wl-shortcut-line"><kbd>Del</kbd> Remove symbol</span>
      </div>
    </div>
  {/if}

  <!-- Column Headers -->
  <div class="wl-columns wl-grid">
    <button class="col-btn col-symbol" onclick={() => toggleSort('symbol')} title="Sort by symbol">
      <span>Symbol</span>
      {#if sortColumn === 'symbol'}<span class="sort-icon">{sortDirection === 'asc' ? '▲' : '▼'}</span>{/if}
    </button>
    <button class="col-btn col-last" onclick={() => toggleSort('last')} title="Sort by price">
      <span>Last</span>
      {#if sortColumn === 'last'}<span class="sort-icon">{sortDirection === 'asc' ? '▲' : '▼'}</span>{/if}
    </button>
    <button class="col-btn col-chg" onclick={() => toggleSort('chg')} title="Sort by change">
      <span>Chg</span>
      {#if sortColumn === 'chg'}<span class="sort-icon">{sortDirection === 'asc' ? '▲' : '▼'}</span>{/if}
    </button>
    <button class="col-btn col-chgp" onclick={() => toggleSort('chgPercent')} title="Sort by % change">
      <span>Chg%</span>
      {#if sortColumn === 'chgPercent'}<span class="sort-icon">{sortDirection === 'asc' ? '▲' : '▼'}</span>{/if}
    </button>
  </div>

  <!-- Symbol Items List -->
  <div class="wl-items">
    {#each groups as group (group.category)}
      <button
        class="wl-section"
        aria-expanded={!collapsed.includes(group.category)}
        onclick={() => toggleCategory(group.category)}
      >
        <ChevronDown size={11} class={`wl-section-chevron ${collapsed.includes(group.category) ? 'folded' : ''}`} />
        <span class="wl-section-title">{group.category.toUpperCase()}</span>
        <span class="wl-section-count">{group.items.length}</span>
      </button>

      {#if !collapsed.includes(group.category)}
        {#each group.items as item (item.identity)}
          {@const snapshot = quotes[item.identity]}
          {@const quote = snapshot?.quote}
          {@const priceParts = formatWatchlistPriceParts(quote?.price, item)}
          <div
            class="wl-row"
            class:active={item.identity === active?.identity}
            class:dragging={dragging === item.identity}
            class:drop-target={dropTarget === item.identity}
          >
            <button
              class="wl-select wl-grid"
              draggable="true"
              aria-pressed={item.identity === active?.identity}
              aria-label={`Select ${item.symbol}`}
              title={`${item.name} · ${item.provider}\n${snapshot?.error ?? (quote ? `${quote.freshness} · ${new Date(quote.asOf).toLocaleTimeString()}` : 'Waiting for quote…')}`}
              onclick={() => select(item)}
              oncontextmenu={(event) => openContextMenu(event, item)}
              onkeydown={(event) => rowKey(event, item)}
              ondragstart={(event) => {
                dragging = item.identity;
                if (event.dataTransfer) {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', item.identity);
                }
              }}
              ondragover={(event) => {
                if (dragging && group.items.some(r => r.identity === dragging)) {
                  event.preventDefault();
                  dropTarget = item.identity;
                }
              }}
              ondrop={(event) => {
                event.preventDefault();
                drop(item.identity);
              }}
              ondragend={() => {
                dragging = null;
                dropTarget = null;
              }}
            >
              <!-- Symbol & Icon -->
              <span class="wl-symbol-col">
                <span class="wl-asset-badge" data-category={group.category} data-symbol={item.symbol.toUpperCase()}>
                  {#if item.symbol.toUpperCase() === 'DXY'}
                    <span class="badge-text green">$</span>
                  {:else if item.symbol.toUpperCase() === 'VIX'}
                    <span class="badge-text green small">VIX</span>
                  {:else if /XAU|GOLD/.test(item.symbol.toUpperCase())}
                    <span class="badge-icon gold">
                      <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M2 11h12l-2 3H4l-2-3zm1-4h10l-1.5 2.5H4.5L3 7zm2-4h6l-1.5 2.5h-3L5 3z"/></svg>
                    </span>
                  {:else if /XAG|SILVER/.test(item.symbol.toUpperCase())}
                    <span class="badge-icon silver">
                      <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><circle cx="8" cy="8" r="5"/></svg>
                    </span>
                  {:else if /OIL|WTI|BRENT|USO|CL/.test(item.symbol.toUpperCase())}
                    <span class="badge-icon oil">
                      <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M8 1c0 0-5 6.3-5 9.4 0 2.8 2.2 4.6 5 4.6s5-1.8 5-4.6C13 7.3 8 1 8 1z"/></svg>
                    </span>
                  {:else if /EUR/.test(item.symbol.toUpperCase())}
                    <span class="badge-text euro">€</span>
                  {:else if /GBP/.test(item.symbol.toUpperCase())}
                    <span class="badge-text pound">£</span>
                  {:else if /JPY/.test(item.symbol.toUpperCase())}
                    <span class="badge-text yen">¥</span>
                  {:else if /BTC/.test(item.symbol.toUpperCase())}
                    <span class="badge-text btc">₿</span>
                  {:else if /ETH/.test(item.symbol.toUpperCase())}
                    <span class="badge-icon eth">
                      <svg viewBox="0 0 16 16" width="9" height="9" fill="currentColor"><path d="M8 1L3 8.5 8 11.5 13 8.5 8 1zM3 9.5L8 15l5-5.5-5 2.5-5-2.5z"/></svg>
                    </span>
                  {:else if /AAPL/.test(item.symbol.toUpperCase())}
                    <span class="badge-icon apple">
                      <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M10.8 7.9c0-1.8 1.5-2.7 1.6-2.7-.9-1.2-2.2-1.4-2.6-1.4-1.2-.1-2.3.7-2.9.7-.6 0-1.5-.7-2.5-.7-1.3 0-2.5.8-3.1 2-1.4 2.3-.3 5.8 1 7.7.7.9 1.4 2 2.4 1.9.9 0 1.3-.6 2.4-.6 1.1 0 1.4.6 2.4.6 1 0 1.7-.9 2.3-1.9.8-1.1 1.1-2.2 1.1-2.3-.1-.1-2.1-.8-2.1-3.3zm-1.8-5c.5-.6.9-1.5.8-2.4-.8 0-1.7.5-2.2 1.2-.5.5-.9 1.4-.8 2.3.9.1 1.7-.5 2.2-1.1z"/></svg>
                    </span>
                  {:else if /TSLA/.test(item.symbol.toUpperCase())}
                    <span class="badge-text tsla">T</span>
                  {:else if /NFLX/.test(item.symbol.toUpperCase())}
                    <span class="badge-text nflx">N</span>
                  {:else if group.category === 'Forex'}
                    <span class="badge-text fx">FX</span>
                  {:else if group.category === 'Crypto'}
                    <span class="badge-text btc">C</span>
                  {:else if group.category === 'Indices'}
                    <span class="badge-text green small">IDX</span>
                  {:else}
                    <span class="badge-text mono">{item.symbol.slice(0, 2)}</span>
                  {/if}
                </span>

                <span class="wl-ticker" title={item.symbol}>
                  {item.symbol}
                </span>

                {#if item.delayMs}
                  <span class="wl-delay-dot" title="Delayed data">D</span>
                {/if}
              </span>

              <!-- Last Price Column -->
              <span class="wl-col-val wl-price" class:stale={!!snapshot?.error}>
                {#if priceParts.pip}
                  <span class="wl-price-main">{priceParts.main}</span><sup class="wl-price-pip">{priceParts.pip}</sup>
                {:else}
                  <span>{priceParts.main}</span>
                {/if}
              </span>

              <!-- Change Column -->
              <span class="wl-col-val wl-chg {tone(quote?.change)}">
                {formatWatchlistNumber(quote?.change, item, true)}
              </span>

              <!-- Change % Column -->
              <span class="wl-col-val wl-chgp {tone(quote?.changePercent)}">
                {percent(quote?.changePercent)}
              </span>
            </button>

            <!-- Remove Button on hover -->
            <button
              class="wl-remove"
              aria-label={`Remove ${item.symbol}`}
              title="Remove symbol"
              onclick={(e) => {
                e.stopPropagation();
                remove(item.identity);
              }}
            >
              <X size={12} />
            </button>
          </div>
        {/each}
      {/if}
    {/each}

    {#if !items.length}
      <div class="wl-empty">
        <Bookmark size={26} class="wl-empty-icon" />
        <strong>Your watchlist is empty</strong>
        <span>Add symbols to track real-time prices.</span>
        <button class="wl-empty-add-btn" onclick={add}>
          <Plus size={14} /> Add symbol
        </button>
      </div>
    {:else if filterQuery && !groups.some(g => g.items.length > 0)}
      <div class="wl-empty">
        <Search size={22} class="wl-empty-icon" />
        <strong>No symbols match "{filterQuery}"</strong>
        <span>Try searching for another ticker or name.</span>
      </div>
    {/if}
  </div>

  <!-- Right-Click Context Menu -->
  {#if contextMenu}
    <div
      class="wl-context-menu"
      style:left={`${contextMenu.x}px`}
      style:top={`${contextMenu.y}px`}
      role="menu"
      tabindex="-1"
      onkeydown={(e) => { if (e.key === 'Escape') contextMenu = null; }}
      onclick={(e) => e.stopPropagation()}
    >
      <div class="wl-ctx-header">{contextMenu.item.symbol} · {contextMenu.item.provider}</div>
      <button
        class="wl-ctx-item"
        role="menuitem"
        onclick={() => {
          if (contextMenu) select(contextMenu.item);
          contextMenu = null;
        }}
      >
        <ExternalLink size={13} />
        <span>Open in chart</span>
      </button>
      <button
        class="wl-ctx-item"
        role="menuitem"
        onclick={() => {
          if (contextMenu) copySymbol(contextMenu.item.symbol);
          contextMenu = null;
        }}
      >
        <Copy size={13} />
        <span>Copy symbol</span>
      </button>
      <div class="wl-menu-divider"></div>
      <button
        class="wl-ctx-item danger"
        role="menuitem"
        onclick={() => {
          if (contextMenu) remove(contextMenu.item.identity);
          contextMenu = null;
        }}
      >
        <Trash2 size={13} />
        <span>Remove from watchlist</span>
      </button>
    </div>
  {/if}

  <!-- Copied Toast -->
  {#if copiedToast}
    <div class="wl-toast" role="status">{copiedToast}</div>
  {/if}

  {#if storageError}
    <div class="wl-error" role="status">Unable to save watchlist changes.</div>
  {/if}

  <!-- Watchlist Footer -->
  <footer class="wl-footer">
    <div class="wl-footer-left">
      <span class="wl-footer-symbol" title={active?.name ?? listName}>
        {active?.symbol ?? listName}
      </span>
    </div>
    <div class="wl-footer-right">
      <span class="wl-footer-pulse" class:loading></span>
      <span>{loading ? 'Updating…' : `${items.length} symbols · 30s`}</span>
    </div>
  </footer>
</section>

<style>
  .wl-panel {
    position: relative;
    min-width: 280px;
    max-width: calc(100vw - 350px);
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--tone-c7c9ce, #c7c9ce);
    border-left: 1px solid var(--line);
    --wl-positive: #089981;
    --wl-negative: #f23645;
    user-select: none;
    font-family: inherit;
  }
  :global([data-theme="light"]) .wl-panel {
    --wl-positive: #089981;
    --wl-negative: #f23645;
  }

  button {
    border-radius: 3px;
    cursor: pointer;
    font: inherit;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }

  /* Left Resizer */
  .wl-resizer {
    position: absolute;
    z-index: 10;
    left: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    touch-action: none;
  }
  .wl-resizer:hover,
  .wl-resizer:focus-visible {
    background: color-mix(in srgb, var(--accent) 60%, transparent);
  }

  /* Header */
  .wl-header {
    height: 42px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    border-bottom: 1px solid var(--line);
  }
  .wl-title {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    color: var(--tone-dedfe3, #dedfe3);
    font-size: 13px;
    font-weight: 600;
    background: transparent;
    border: 0;
    border-radius: 4px;
    max-width: 170px;
    transition: background 0.1s;
  }
  :global([data-theme="light"]) .wl-title {
    color: #131722;
  }
  .wl-title:hover {
    background: var(--tone-26282e, #26282e);
  }
  :global([data-theme="light"]) .wl-title:hover {
    background: #f0f3fa;
  }
  .wl-title-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wl-chevron {
    flex: none;
    color: var(--tone-858791, #858791);
    transition: transform 0.15s;
  }
  .wl-chevron.open {
    transform: rotate(180deg);
  }

  .wl-header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .wl-control {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    color: var(--tone-9a9ca5, #9a9ca5);
    background: transparent;
    border: 0;
    border-radius: 4px;
    transition: background 0.1s, color 0.1s;
  }
  .wl-control:hover,
  .wl-control.active {
    background: var(--tone-26282e, #26282e);
    color: var(--tone-dedfe3, #dedfe3);
  }
  :global([data-theme="light"]) .wl-control:hover,
  :global([data-theme="light"]) .wl-control.active {
    background: #f0f3fa;
    color: #131722;
  }

  /* Inline Filter Bar */
  .wl-filter-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 32px;
    border-bottom: 1px solid var(--line);
    background: var(--tone-15161a, #15161a);
  }
  :global([data-theme="light"]) .wl-filter-bar {
    background: #f8f9fd;
  }
  .wl-filter-bar :global(.wl-filter-icon) {
    color: var(--tone-70737c, #70737c);
    flex: none;
  }
  .wl-filter-bar input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: 0;
    color: inherit;
    font-size: 11px;
  }
  .wl-filter-clear {
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    color: var(--tone-858791, #858791);
    background: transparent;
    border: 0;
    border-radius: 3px;
  }
  .wl-filter-clear:hover {
    color: inherit;
  }

  /* Column Headers */
  .wl-columns {
    height: 26px;
    flex: none;
    border-bottom: 1px solid var(--line);
    color: var(--tone-70737c, #787b86);
    font-size: 11px;
    font-weight: 500;
  }
  .wl-grid {
    display: grid;
    grid-template-columns: minmax(80px, 1.4fr) minmax(68px, 1fr) minmax(64px, 0.95fr) minmax(58px, 0.9fr);
    align-items: center;
    gap: 6px;
    padding: 0 12px;
  }
  .col-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0;
    background: transparent;
    border: 0;
    color: inherit;
    font-size: 11px;
    font-weight: 500;
  }
  .col-btn:hover {
    color: var(--tone-c7c9ce, #c7c9ce);
  }
  :global([data-theme="light"]) .col-btn:hover {
    color: #131722;
  }
  .col-symbol {
    justify-content: flex-start;
  }
  .col-last,
  .col-chg,
  .col-chgp {
    justify-content: flex-end;
  }
  .sort-icon {
    font-size: 8px;
    opacity: 0.9;
  }

  /* Items Container */
  .wl-items {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--tone-41434b, #363a45) transparent;
  }
  .wl-items::-webkit-scrollbar {
    width: 6px;
  }
  .wl-items::-webkit-scrollbar-thumb {
    background: var(--tone-41434b, #363a45);
    border-radius: 3px;
  }

  /* Section Header (Category) */
  .wl-section {
    width: 100%;
    height: 26px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    color: var(--tone-70737c, #787b86);
    background: transparent;
    border: 0;
    border-top: 1px solid var(--line);
    text-align: left;
    transition: background 0.1s;
  }
  .wl-section:first-child {
    border-top: 0;
  }
  .wl-section:hover {
    background: rgba(255, 255, 255, 0.02);
  }
  :global([data-theme="light"]) .wl-section:hover {
    background: rgba(0, 0, 0, 0.02);
  }
  .wl-section :global(.wl-section-chevron) {
    flex: none;
    transition: transform 0.12s;
  }
  .wl-section :global(.wl-section-chevron.folded) {
    transform: rotate(-90deg);
  }
  .wl-section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }
  .wl-section-count {
    margin-left: auto;
    font-size: 9px;
    opacity: 0.6;
    font-variant-numeric: tabular-nums;
  }

  /* Symbol Rows */
  .wl-row {
    height: 30px;
    position: relative;
    border-radius: 4px;
    margin: 1px 4px;
    transition: background 0.08s, box-shadow 0.08s;
  }
  .wl-row:hover {
    background: var(--tone-1e2025, #1e2025);
  }
  :global([data-theme="light"]) .wl-row:hover {
    background: #f0f3fa;
  }
  .wl-row.active {
    background: color-mix(in srgb, var(--accent) 9%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
    box-shadow: inset 3px 0 0 var(--accent);
  }
  :global([data-theme="light"]) .wl-row.active {
    background: rgba(41, 98, 255, 0.08);
    border: 1px solid rgba(41, 98, 255, 0.28);
    box-shadow: inset 3px 0 0 #2962ff;
  }
  .wl-row.dragging {
    opacity: 0.35;
  }
  .wl-row.drop-target {
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .wl-select {
    width: 100%;
    height: 100%;
    background: transparent;
    border: 0;
    font-size: 12px;
    text-align: left;
    color: inherit;
    padding: 0 8px 0 8px;
  }
  .wl-row.active .wl-select {
    padding-left: 10px;
  }

  /* Symbol Column */
  .wl-symbol-col {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    overflow: hidden;
  }
  .wl-ticker {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.1px;
    color: var(--tone-dedfe3, #dedfe3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global([data-theme="light"]) .wl-ticker {
    color: #131722;
  }
  .wl-delay-dot {
    font-size: 8px;
    font-weight: 600;
    padding: 1px 3px;
    border-radius: 2px;
    background: var(--tone-2c3038, #2c3038);
    color: var(--tone-9a9ca5, #9a9ca5);
  }

  /* Asset Circular Badges */
  .wl-asset-badge {
    width: 18px;
    height: 18px;
    flex: none;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--tone-292b31, #292b31);
    color: var(--tone-dadbe0, #dadbe0);
    overflow: hidden;
  }
  :global([data-theme="light"]) .wl-asset-badge {
    background: #e9ecf2;
    color: #131722;
  }
  .badge-text {
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
  }
  .badge-text.small {
    font-size: 7px;
    letter-spacing: -0.2px;
  }
  .badge-text.mono {
    font-size: 8px;
    letter-spacing: -0.3px;
  }
  .badge-text.green {
    color: #089981;
  }
  .badge-icon.gold {
    color: #f59e0b;
  }
  .badge-icon.silver {
    color: #94a3b8;
  }
  .badge-icon.oil {
    color: #e2e8f0;
  }
  .badge-text.euro {
    color: #3b82f6;
  }
  .badge-text.pound {
    color: #60a5fa;
  }
  .badge-text.yen {
    color: #ef4444;
  }
  .badge-text.btc {
    color: #f59e0b;
  }
  .badge-icon.eth {
    color: #818cf8;
  }
  .badge-icon.apple {
    color: #f1f5f9;
  }
  :global([data-theme="light"]) .badge-icon.apple {
    color: #0f172a;
  }
  .badge-text.tsla {
    color: #e11d48;
  }
  .badge-text.nflx {
    color: #dc2626;
  }
  .badge-text.fx {
    color: #0284c7;
    font-size: 7px;
  }

  /* Numeric Columns */
  .wl-col-val {
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    font-weight: 400;
  }
  .wl-price {
    font-weight: 500;
    color: var(--tone-c7c9ce, #c7c9ce);
  }
  :global([data-theme="light"]) .wl-price {
    color: #131722;
  }
  .wl-price-pip {
    font-size: 8.5px;
    vertical-align: top;
    position: relative;
    top: -1px;
    line-height: 1;
    font-weight: 600;
    margin-left: 0.5px;
    opacity: 0.9;
  }
  .wl-chg,
  .wl-chgp {
    font-weight: 400;
  }
  .positive {
    color: var(--wl-positive);
  }
  .negative {
    color: var(--wl-negative);
  }
  .stale {
    opacity: 0.55;
  }

  /* Remove Row Button */
  .wl-remove {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 3px;
    opacity: 0;
    background: var(--bg);
    color: var(--tone-858791, #858791);
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
    transition: opacity 0.1s, color 0.1s;
    z-index: 3;
  }
  .wl-row:hover .wl-remove,
  .wl-row:focus-within .wl-remove {
    opacity: 1;
  }
  .wl-remove:hover {
    color: var(--wl-negative);
    background: var(--tone-26282e, #26282e);
  }
  :global([data-theme="light"]) .wl-remove:hover {
    background: #f0f3fa;
  }

  /* Popovers */
  .wl-dismiss {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: transparent;
    border: 0;
    cursor: default;
  }
  .wl-popover {
    position: absolute;
    z-index: 41;
    top: 42px;
    left: 8px;
    right: 8px;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--tone-191a1f, #191a1f);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
    font-size: 11px;
  }
  :global([data-theme="light"]) .wl-popover {
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  .wl-menu-header {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.8px;
    color: var(--tone-70737c, #70737c);
    padding: 4px 8px 6px;
  }
  .wl-menu-list {
    max-height: 180px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .wl-menu-list-row {
    display: flex;
    align-items: center;
    border-radius: 4px;
    padding: 1px;
  }
  .wl-menu-list-row:hover,
  .wl-menu-list-row.current {
    background: var(--tone-26282e, #26282e);
  }
  :global([data-theme="light"]) .wl-menu-list-row:hover,
  :global([data-theme="light"]) .wl-menu-list-row.current {
    background: #f0f3fa;
  }
  .wl-menu-item {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    background: transparent;
    border: 0;
    color: inherit;
    text-align: left;
  }
  .wl-check {
    width: 14px;
    display: grid;
    place-items: center;
    color: var(--accent);
  }
  .wl-item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .wl-item-count {
    font-size: 10px;
    opacity: 0.6;
    padding: 1px 5px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
  }
  .wl-sub-action {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    padding: 0;
    background: transparent;
    border: 0;
    color: var(--tone-858791, #858791);
    border-radius: 3px;
  }
  .wl-sub-action:hover {
    color: inherit;
  }
  .wl-sub-action.delete:hover {
    color: var(--wl-negative);
  }

  .wl-rename-form {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 4px;
    padding: 4px 6px;
  }
  .wl-rename-form input {
    flex: 1;
    min-width: 0;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 3px;
    padding: 4px 6px;
    color: inherit;
    font-size: 11px;
  }
  .wl-rename-form button {
    padding: 4px 8px;
    background: var(--tone-26282e, #26282e);
    border: 1px solid var(--line);
    color: inherit;
  }

  .wl-menu-divider {
    height: 1px;
    background: var(--line);
    margin: 5px 0;
  }
  .wl-new-list-form {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 4px 2px;
  }
  .wl-new-list-form input {
    flex: 1;
    min-width: 0;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 6px 8px;
    color: inherit;
    font-size: 11px;
  }
  .wl-create-btn {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    background: var(--tone-26282e, #26282e);
    border: 1px solid var(--line);
    border-radius: 4px;
    color: inherit;
  }
  .wl-create-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .wl-menu-action {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: transparent;
    border: 0;
    color: inherit;
    text-align: left;
    border-radius: 4px;
    transition: background 0.1s;
  }
  .wl-menu-action:hover {
    background: var(--tone-26282e, #26282e);
  }
  :global([data-theme="light"]) .wl-menu-action:hover {
    background: #f0f3fa;
  }
  .wl-menu-action.danger {
    color: var(--wl-negative);
  }
  .wl-opt-check {
    margin-left: auto;
    color: var(--accent);
  }
  .muted-text {
    opacity: 0.6;
  }

  .wl-menu-shortcuts {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 10px 4px;
    font-size: 10px;
    color: var(--tone-70737c, #70737c);
  }
  .wl-shortcut-line {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .wl-shortcut-line kbd {
    background: var(--tone-26282e, #26282e);
    border: 1px solid var(--line);
    border-radius: 3px;
    padding: 1px 4px;
    font-size: 9px;
    font-family: inherit;
  }

  /* Right-Click Context Menu */
  .wl-context-menu {
    position: fixed;
    z-index: 50;
    width: 175px;
    padding: 5px;
    background: var(--tone-191a1f, #191a1f);
    border: 1px solid var(--line);
    border-radius: 5px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    font-size: 11px;
  }
  :global([data-theme="light"]) .wl-context-menu {
    background: #ffffff;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  }
  .wl-ctx-header {
    padding: 4px 8px;
    font-size: 9px;
    font-weight: 600;
    color: var(--tone-70737c, #70737c);
    border-bottom: 1px solid var(--line);
    margin-bottom: 3px;
  }
  .wl-ctx-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    background: transparent;
    border: 0;
    color: inherit;
    text-align: left;
    border-radius: 3px;
  }
  .wl-ctx-item:hover {
    background: var(--tone-26282e, #26282e);
  }
  :global([data-theme="light"]) .wl-ctx-item:hover {
    background: #f0f3fa;
  }
  .wl-ctx-item.danger {
    color: var(--wl-negative);
  }

  /* Empty State */
  .wl-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 8px;
    height: 100%;
    min-height: 200px;
    padding: 24px;
    color: var(--tone-70737c, #70737c);
  }
  .wl-empty-icon {
    opacity: 0.4;
    margin-bottom: 4px;
  }
  .wl-empty strong {
    color: var(--tone-dedfe3, #dedfe3);
    font-size: 12px;
  }
  :global([data-theme="light"]) .wl-empty strong {
    color: #131722;
  }
  .wl-empty span {
    font-size: 11px;
    max-width: 200px;
    line-height: 1.4;
  }
  .wl-empty-add-btn {
    margin-top: 6px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--tone-26282e, #26282e);
    color: var(--tone-dedfe3, #dedfe3);
    font-size: 11px;
  }
  :global([data-theme="light"]) .wl-empty-add-btn {
    background: #f0f3fa;
    color: #131722;
  }

  /* Toast & Error */
  .wl-toast {
    position: absolute;
    bottom: 38px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--tone-26282e, #26282e);
    border: 1px solid var(--line);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 30;
  }
  .wl-error {
    padding: 6px 12px;
    font-size: 10px;
    color: var(--wl-negative);
    border-top: 1px solid var(--line);
  }

  /* Footer */
  .wl-footer {
    height: 30px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-top: 1px solid var(--line);
    font-size: 11px;
    color: var(--tone-70737c, #70737c);
    background: var(--bg);
  }
  .wl-footer-left {
    min-width: 0;
    display: flex;
    align-items: center;
  }
  .wl-footer-symbol {
    font-weight: 600;
    color: var(--tone-c7c9ce, #c7c9ce);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 140px;
  }
  :global([data-theme="light"]) .wl-footer-symbol {
    color: #131722;
  }
  .wl-footer-right {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
  }
  .wl-footer-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--wl-positive);
  }
  .wl-footer-pulse.loading {
    background: var(--accent);
    animation: pulse 1s infinite alternate;
  }

  @keyframes pulse {
    0% { opacity: 0.3; }
    100% { opacity: 1; }
  }
  .spinning {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .wl-row,
    .wl-section :global(svg),
    .wl-chevron {
      transition: none;
    }
    .spinning,
    .wl-footer-pulse.loading {
      animation: none;
    }
  }
</style>
