<script lang="ts">
  import type { SavedScript } from './pine/library';
  import { onMount } from 'svelte';
  import type { Vela } from '@luxalgo/vela';
  import type { NativeIndicatorInfo } from '@luxalgo/vela/plugin';
  import { Search, X, Plus, Check } from 'lucide-svelte';
  import { findIndicators, addCatalogIndicator } from './indicator-catalog';
  export let chart: Vela;
  export let customScripts: SavedScript[] = [];
  export let customError = '';
  export let onCustomAdd: (script:SavedScript)=>void;
  export let onCustomEdit: (script:SavedScript)=>void;
  export let onCustomDelete: (script:SavedScript)=>void;
  export let close: () => void;
  let query = '';
  let catalog: NativeIndicatorInfo[] = [];
  let loading = true;
  let loadError = '';
  let notice = '';
  let addError = '';
  let active: Array<{ type: string | undefined; visible: boolean }> = [];
  let resultsHost: HTMLDivElement;
  $: results = findIndicators(catalog, query);
  const addedIds = new Set<string>();
  let refresh = async () => {};
  function syncActive() { active = chart.indicators().map(handle => ({ type: handle.nativeType, visible: handle.visible })); }
  function count(type: string) { return active.filter(item => item.type === type).length; }
  function alreadyVisible(item: NativeIndicatorInfo) { return !item.multiInstance && active.some(handle => handle.type === item.type && handle.visible); }
  onMount(() => {
    let mounted = true;
    let generation = 0;
    refresh = async () => {
      const request = ++generation;
      loading = true; loadError = '';
      try {
        const available = await chart.availableNativeIndicators();
        if (!mounted || request !== generation) return;
        catalog = available;
        syncActive();
      } catch { if (mounted && request === generation) loadError = 'Could not load indicators. Try again.'; }
      finally { if (mounted && request === generation) loading = false; }
    };
    void refresh();
    const disposers = [
      chart.on('indicator:added', syncActive), chart.on('indicator:removed', syncActive),
      chart.on('indicator:visibility', syncActive), chart.on('market:changed', () => { void refresh(); }),
      chart.on('indicator:error', ({ id, error }) => {
        if (!addedIds.has(id)) return;
        addedIds.delete(id);
        notice = ''; addError = `Unable to add indicator: ${error.message}`;
        chart.indicators().find(handle => handle.id === id)?.remove();
        syncActive();
      }),
    ];
    return () => { mounted = false; generation++; disposers.forEach(dispose => dispose()); };
  });
  function add(item: NativeIndicatorInfo) {
    notice = ''; addError = '';
    try {
      const { handle, added } = addCatalogIndicator(chart, item);
      if (added) addedIds.add(handle.id);
      syncActive();
      notice = `${added ? 'Added' : 'Showing'} ${item.title}.`;
    } catch (error) { addError = error instanceof Error ? error.message : 'Could not add this indicator.'; }
  }
  function focusDialog(dialog: HTMLDialogElement) {
    const previous = document.activeElement;
    dialog.querySelector<HTMLInputElement>('input')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('.indicator-result:not(:disabled)')];
      const index = buttons.indexOf(event.target as HTMLButtonElement);
      if (event.key === 'ArrowDown' && (event.target instanceof HTMLInputElement || index >= 0)) {
        event.preventDefault(); buttons[Math.min(index + 1, buttons.length - 1)]?.focus();
      } else if (event.key === 'ArrowUp' && index >= 0) {
        event.preventDefault();
        if (index) buttons[index - 1]?.focus(); else dialog.querySelector<HTMLInputElement>('input')?.focus();
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    dialog.addEventListener('keydown', keydown);
    return { destroy() { dialog.removeEventListener('keydown', keydown); if (previous instanceof HTMLElement) previous.focus(); } };
  }
</script>
<div class="settings-scrim" role="presentation" onclick={close}></div>
<dialog open class="settings-dialog indicator-dialog" aria-modal="true" aria-labelledby="indicator-title" use:focusDialog>
  <header class="dialog-titlebar"><h2 id="indicator-title">Indicators</h2><button class="dialog-close" aria-label="Close indicators" onclick={close}><X size={17}/></button></header>
  <div class="indicator-search"><Search size={15}/><input aria-label="Search indicators" placeholder="Search indicators — EMA, RSI, moving average…" bind:value={query} onkeydown={(event) => { if (event.key === 'Enter' && !event.isComposing && !loading && !loadError) { const item = results.find(item => item.supported && !alreadyVisible(item)); if (item) { event.preventDefault(); add(item); } } }} oninput={() => { if (resultsHost) resultsHost.scrollTop = 0; }}/>{#if query}<button aria-label="Clear indicator search" onclick={() => query = ''}><X size={13}/></button>{/if}</div>
  <div class="indicator-list-heading"><span>CUSTOM INDICATORS</span></div>
  {#each customScripts.filter(item=>item.name.toLowerCase().includes(query.toLowerCase())) as script (script.id)}
    <div class="indicator-result"><span>{script.name}</span><button onclick={()=>onCustomAdd(script)}>Add</button><button onclick={()=>onCustomEdit(script)}>Edit</button><button onclick={()=>onCustomDelete(script)}>Delete</button></div>
  {/each}
  {#if customError}<p role="alert">{customError}</p>{/if}
  <div class="indicator-list-heading"><span>BUILT-IN INDICATORS</span><span>{loading ? 'Loading…' : `${results.length} results`}</span></div>
  <div class="indicator-results" bind:this={resultsHost} aria-busy={loading}>
    {#if loading}<p class="indicator-empty" role="status">Loading indicators…</p>
    {:else if loadError}<div class="indicator-empty" role="alert">{loadError}<button class="done-button" onclick={() => refresh()}>Retry</button></div>
    {:else if results.length === 0}<p class="indicator-empty">No indicators match “{query}”. Try a name or abbreviation.</p>
    {:else}{#each results as item (item.type)}
      <button class="indicator-result" disabled={!item.supported || alreadyVisible(item)} aria-label={`${alreadyVisible(item) ? 'Already on chart:' : 'Add'} ${item.title}`} title={!item.supported ? 'Unavailable for this market' : alreadyVisible(item) ? 'Already on chart' : `Add ${item.title}`} onclick={() => add(item)}>
        <span class="indicator-result-name">{item.title}{#if item.beta}<small class="indicator-beta">BETA</small>{/if}</span>
        <span class="indicator-result-state">{#if !item.supported}Unavailable{:else if count(item.type)}{count(item.type)} on chart{/if}{#if alreadyVisible(item)}<Check size={13}/>{:else if item.supported}<Plus size={14}/>{/if}</span>
      </button>
    {/each}{/if}
  </div>
  <footer class="dialog-footer indicator-footer"><span class:indicator-error={!!addError} role="status">{addError || notice || 'Add an indicator, then use its chart label to edit settings or remove it.'}</span><button class="done-button" onclick={close}>Done</button></footer>
</dialog>
