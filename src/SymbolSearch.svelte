<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { Search, X, Plus, Check } from 'lucide-svelte';
  import type { InstrumentSearchResult } from './watchlist';
  import { matchesInstrumentQuery, mergeSearchResults, normalizeSearchTerm, sortInstrumentSuggestions } from './market-search';

  type ProviderStatus = { provider: string; status: string; error?: string | null };
  type SearchPayload = { results: InstrumentSearchResult[]; providers: ProviderStatus[] };
  type AssetFilter = 'All' | 'Forex' | 'Crypto' | 'Futures' | 'Commodities' | 'Indices';
  let { close, select, add, isSaved }: {
    close: () => void;
    select: (item: InstrumentSearchResult) => void;
    add: (item: InstrumentSearchResult) => void;
    isSaved: (item: InstrumentSearchResult) => boolean;
  } = $props();

  const filters: AssetFilter[] = ['All', 'Forex', 'Crypto', 'Futures', 'Commodities', 'Indices'];
  let query = $state('');
  let filter = $state<AssetFilter>('All');
  let input: HTMLInputElement;
  let loading = $state(false);
  let catalogLoading = $state(true);
  let catalogReady = false;
  let catalogResults = $state<InstrumentSearchResult[]>([]);
  let providers = $state<ProviderStatus[]>([]);
  let requestId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastQuery = '';
  let activeIndex = $state(0);

  const results = $derived(query.trim() ? sortInstrumentSuggestions(catalogResults.filter(item => matchesInstrumentQuery(item, query)), query) : []);
  const filtered = $derived(results.filter(item => {
    if (filter === 'All') return true;
    if (filter === 'Forex') return item.assetClass === 'forex';
    if (filter === 'Crypto') return item.assetClass === 'crypto';
    if (filter === 'Futures') return item.assetClass === 'futures' || item.instrumentType.includes('future');
    if (filter === 'Commodities') return ['metals', 'commodities', 'commodity', 'commodity_or_index'].includes(item.assetClass);
    return item.assetClass === 'indices' || item.instrumentType.includes('index');
  }));

  onMount(() => {
    input?.focus();
    let mounted = true;
    void invoke<SearchPayload>('get_market_search_catalog').then(payload => {
      if (!mounted) return;
      catalogResults = mergeSearchResults(catalogResults, payload.results, 10_000);
      providers = payload.providers;
      catalogReady = true;
      catalogLoading = false;
      if (normalizeSearchTerm(query).length >= 2) {
        loading = true;
        const current = requestId;
        debounceTimer = setTimeout(() => void runSearch(query, current), 120);
      }
    }).catch(error => {
      if (!mounted) return;
      catalogReady = true;
      catalogLoading = false;
      providers = [{ provider: 'Market data catalog', status: 'error', error: String(error) }];
      if (normalizeSearchTerm(query).length >= 2) {
        loading = true;
        const current = requestId;
        debounceTimer = setTimeout(() => void runSearch(query, current), 120);
      }
    });
    return () => { mounted = false; clearTimeout(debounceTimer); requestId++; };
  });

  function search(next: string) {
    const normalized = next.trim();
    clearTimeout(debounceTimer);
    if (normalized.length < 1) { requestId++; loading = false; providers = []; lastQuery = ''; activeIndex = 0; return; }
    const key = normalizeSearchTerm(normalized);
    if (!key) { requestId++; loading = false; providers = []; lastQuery = ''; activeIndex = 0; return; }
    if (key.length < 2) { requestId++; loading = false; activeIndex = 0; return; }
    if (key === lastQuery && !loading) return;
    const current = ++requestId;
    activeIndex = 0; loading = true;
    if (!catalogReady) return;
    debounceTimer = setTimeout(() => void runSearch(normalized, current), 120);
  }

  async function runSearch(term: string, current: number) {
    lastQuery = normalizeSearchTerm(term);
    loading = true;
    try {
      if (!('__TAURI_INTERNALS__' in window)) throw new Error('Unified market search is available in the DeplyzeView desktop app.');
      const payload = await invoke<SearchPayload>('search_market_instruments', { query: term });
      catalogResults = mergeSearchResults(catalogResults, payload.results);
      if (current === requestId) { providers = payload.providers; activeIndex = 0; }
    } catch (error) {
      if (current === requestId) { lastQuery = ''; providers = [{ provider: 'Market data', status: 'error', error: String(error) }]; }
    } finally { if (current === requestId) loading = false; }
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowDown' && filtered.length) { event.preventDefault(); activeIndex = (activeIndex + 1) % filtered.length; }
    else if (event.key === 'ArrowUp' && filtered.length) { event.preventDefault(); activeIndex = (activeIndex - 1 + filtered.length) % filtered.length; }
    else if (event.key === 'Enter' && filtered[activeIndex]) { event.preventDefault(); select(filtered[activeIndex]); }
  }

  function providerLabel(value: string) {
    return ({ binance: 'Binance', coinbase: 'Coinbase Exchange', hyperliquid: 'Hyperliquid', oanda: 'OANDA', narwhal: 'Narwhal', finzdata: 'FinzData' } as Record<string, string>)[value] ?? value;
  }
  function typeLabel(item: InstrumentSearchResult) {
    const type = item.instrumentType.replace(/_/g, ' ');
    return type === 'continuous futures' ? 'Front-month futures' : type.replace(/^./, c => c.toUpperCase());
  }
  function addFromResult(item: InstrumentSearchResult, event: MouseEvent) {
    event.stopPropagation(); add(item);
  }
</script>

<div class="symbol-search-scrim" role="presentation" onclick={(event) => event.target === event.currentTarget && close()}>
  <div class="symbol-search-dialog" role="dialog" aria-modal="true" aria-labelledby="symbol-search-title" tabindex="-1" onkeydown={keydown}>
    <h2 id="symbol-search-title" class="sr-only">Search instruments</h2>
    <div class="symbol-search-input"><Search size={17}/><input bind:this={input} bind:value={query} oninput={() => search(query)} placeholder="Search symbols, names, or markets" aria-label="Search symbols, names, or markets" autocomplete="off"/><kbd>ESC</kbd><button aria-label="Close search" onclick={close}><X size={15}/></button></div>
    <nav class="symbol-search-filters" aria-label="Filter asset type">{#each filters as item}<button class:filter-active={filter === item} aria-pressed={filter === item} onclick={() => { filter = item; activeIndex = 0; }}>{item}</button>{/each}</nav>
    <div class="symbol-search-meta"><span>{query.trim() ? (loading ? `${filtered.length} suggestions · checking sources…` : catalogLoading ? `${filtered.length} suggestions · loading catalogs…` : `${filtered.length} suggestions`) : catalogLoading ? 'Loading actual provider catalogs…' : 'Search across configured market-data sources'}</span><span><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> open</span></div>
    <div class="symbol-search-results" role="list" aria-label="Search results">
      {#each filtered as item, index (item.identity)}
        <div class="symbol-search-result" class:result-active={index === activeIndex} role="listitem">
          <button class="result-select" onclick={() => select(item)} onmouseenter={() => activeIndex = index}>
            <span class="result-main"><strong>{item.symbol}</strong><small>{item.name}</small></span>
            <span class="result-details"><span>{typeLabel(item)}</span>{#if item.exchange}<span>{item.exchange}</span>{/if}{#if item.contractExpiry}<span>Expiry {item.contractExpiry}</span>{/if}{#if item.dataStatus}<span>{item.dataStatus}</span>{:else if item.delayMs && item.delayMs > 0}<span>Delayed {Math.round(item.delayMs / 60000)}m</span>{/if}</span>
            <span class="result-provider">{providerLabel(item.provider)}</span>
          </button>
          <button class="result-add" aria-label={isSaved(item) ? `${item.symbol} already in watchlist` : `Add ${item.symbol} to watchlist`} title={isSaved(item) ? 'In watchlist' : 'Add to watchlist'} disabled={isSaved(item)} onclick={(event) => addFromResult(item, event)}>{#if isSaved(item)}<Check size={14}/>{:else}<Plus size={15}/>{/if}</button>
        </div>
      {/each}
      {#if query.trim() && !loading && !filtered.length}<div class="symbol-search-empty">No matching instruments in the available provider catalogs.</div>{/if}
      {#if !query.trim()}<div class="symbol-search-empty">{catalogLoading ? 'Loading real provider symbols and instruments…' : 'Type to filter the loaded catalogs. Suggestions update as you type and show their data provider.'}</div>{/if}
      {#if loading && !filtered.length}<div class="symbol-search-empty" role="status">Searching connected providers…</div>{/if}
    </div>
    {#if providers.length}
      <div class="symbol-provider-status" aria-live="polite">
        {#each providers.filter(source => source.status !== 'ok') as source}
          <span><strong>{providerLabel(source.provider)}</strong> {source.status === 'partial' ? 'partially available' : 'unavailable'}{source.error ? ` · ${source.error}` : ''}</span>
        {/each}
        {#if providers.some(source => source.status !== 'ok') && filtered.length}<span class="partial-results">Showing available partial results</span>{/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .symbol-search-scrim{position:fixed;inset:0;z-index:80;display:grid;place-items:start center;padding:8vh 20px 24px;background:#07080bbd;backdrop-filter:blur(2px)}
  .symbol-search-dialog{width:min(820px,100%);max-height:min(78vh,690px);display:flex;flex-direction:column;overflow:hidden;background:var(--tone-15161a,#15161a);border:1px solid var(--tone-363840,#363840);border-radius:7px;box-shadow:0 22px 70px #000b;color:var(--tone-c7c9ce,#c7c9ce)}
  .symbol-search-input{height:55px;flex:none;display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--line);color:var(--tone-999ba4,#999ba4)}
  .symbol-search-input input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:var(--tone-e0e1e5,#e0e1e5);font-size:14px}.symbol-search-input input::placeholder{color:var(--muted)}
  .symbol-search-input kbd,.symbol-search-meta kbd{padding:2px 5px;border:1px solid var(--tone-3b3d45,#3b3d45);border-radius:3px;color:var(--muted);font:8px Inter,sans-serif}.symbol-search-input>button{width:24px;height:24px;display:grid;place-items:center;border-radius:3px}.symbol-search-input>button:hover{background:var(--tone-282a30,#282a30)}
  .symbol-search-filters{height:43px;flex:none;display:flex;align-items:center;gap:5px;padding:0 14px;border-bottom:1px solid var(--line)}.symbol-search-filters button{height:25px;padding:0 11px;border-radius:12px;color:var(--muted);font-size:9px}.symbol-search-filters button:hover,.symbol-search-filters button.filter-active{background:var(--tone-292b32,#292b32);color:var(--tone-e0e1e5,#e0e1e5)}
  .symbol-search-meta{height:34px;flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 16px;color:var(--muted);font-size:8px}.symbol-search-meta>span:last-child{display:flex;align-items:center;gap:5px}
  .symbol-search-results{min-height:125px;overflow-y:auto;padding:0 8px 9px;scrollbar-width:thin;scrollbar-color:var(--tone-41434b,#41434b) transparent}.symbol-search-result{min-height:53px;display:flex;align-items:center;gap:6px;padding:0 4px;border-radius:4px}.symbol-search-result:hover,.symbol-search-result.result-active{background:var(--tone-202127,#202127)}.result-select{flex:1;min-width:0;min-height:48px;display:grid;grid-template-columns:minmax(150px,1.1fr) minmax(170px,1.5fr) minmax(95px,.65fr);align-items:center;gap:12px;padding:6px 8px;text-align:left}.result-main{display:flex;min-width:0;flex-direction:column;gap:3px}.result-main strong{font-size:11px;font-weight:550;color:var(--tone-dadbe0,#dadbe0)}.result-main small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tone-858791,#858791);font-size:8px}.result-details{display:flex;flex-wrap:wrap;gap:4px}.result-details span{padding:3px 5px;border:1px solid var(--tone-303239,#303239);border-radius:3px;color:var(--tone-92949c,#92949c);font-size:7px}.result-provider{justify-self:end;color:var(--tone-b7b8bd,#b7b8bd);font-size:9px}.result-add{width:28px;height:28px;flex:none;display:grid;place-items:center;border:1px solid transparent;border-radius:4px;color:var(--tone-92949c,#92949c)}.result-add:hover:not(:disabled){border-color:var(--tone-3b3d45,#3b3d45);background:var(--tone-282a30,#282a30);color:var(--tone-e0e1e5,#e0e1e5)}.result-add:disabled{color:#7d998c;cursor:default}.symbol-search-empty{padding:42px 18px;text-align:center;color:var(--muted);font-size:10px;line-height:1.6}.symbol-provider-status{display:flex;flex-wrap:wrap;gap:5px 14px;padding:9px 16px;border-top:1px solid var(--line);color:#c58a7c;font-size:8px}.symbol-provider-status strong{font-weight:500}.symbol-provider-status .partial-results{color:var(--muted)}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  @media(max-width:700px){.symbol-search-scrim{padding:4vh 10px}.symbol-search-dialog{max-height:88vh}.symbol-search-filters{overflow-x:auto}.result-select{grid-template-columns:minmax(100px,1fr) minmax(100px,1.2fr) auto;gap:6px}.result-details span:nth-child(n+3){display:none}.result-provider{font-size:8px}}
</style>
