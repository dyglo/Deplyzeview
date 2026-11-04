<script lang="ts">
  type SymbolTab = {
    id: string;
    symbol: string;
    price: number | null;
    percentChange: number | null;
    icon?: string;
  };

  export let tabs: SymbolTab[] = [];
  export let activeTabId = '';
  export let onAdd: () => void = () => console.info('Multi-tab coming soon.');

  function formatPrice(price: number | null) {
    return price === null || !Number.isFinite(price)
      ? '—'
      : new Intl.NumberFormat(undefined, { maximumSignificantDigits: 8 }).format(price);
  }

  function formatChange(change: number | null) {
    return change === null || !Number.isFinite(change)
      ? '—'
      : `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(2)}%`;
  }
</script>

<nav class="symbol-tab-strip" aria-label="Chart tabs">
  {#each tabs as tab (tab.id)}
    <div class="symbol-tab" class:active={tab.id === activeTabId} title={tab.symbol} aria-current={tab.id === activeTabId ? 'page' : undefined}>
      {#if tab.icon}
        <img class="symbol-tab-icon" src={tab.icon} alt="" draggable="false" />
      {:else}
        <span class="symbol-tab-icon symbol-tab-fallback" aria-hidden="true">{tab.symbol.slice(0, 1)}</span>
      {/if}
      <span class="symbol-tab-symbol">{tab.symbol}</span>
      <span class="symbol-tab-price">{formatPrice(tab.price)}</span>
      <span class="symbol-tab-change" class:positive={tab.percentChange !== null && tab.percentChange >= 0} class:negative={tab.percentChange !== null && tab.percentChange < 0}>{formatChange(tab.percentChange)}</span>
      <button class="symbol-tab-close" type="button" aria-label={`Close ${tab.symbol} tab`} title="Close tab" onclick={() => console.info('Multi-tab coming soon.')}><span aria-hidden="true">×</span></button>
    </div>
  {/each}
  <button class="symbol-tab-add" type="button" aria-label="Add chart tab" title="Add tab" onclick={onAdd}>+</button>
</nav>
