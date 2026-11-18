<script lang="ts">
  import { resolveAssetIcon } from './asset-icons';

  export let symbol: string;
  export let provider = '';
  export let assetClass = '';
  export let size = 16;

  $: resolved = resolveAssetIcon(symbol, provider, assetClass);
</script>

<span
  class="asset-icon"
  data-kind={resolved.kind}
  data-base={resolved.base}
  data-quote={resolved.quote ?? undefined}
  style:width={`${size}px`}
  style:height={`${size}px`}
  aria-hidden="true"
>
  {@html resolved.svg}
</span>

<style>
  .asset-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    line-height: 0;
    user-select: none;
    pointer-events: none;
  }
  .asset-icon :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
</style>
