<script lang="ts">
  import { tick } from 'svelte';
  import { Plus, X } from 'lucide-svelte';
  import { parseColor, colorWithOpacity, hsvToHex, hexToHsv } from './color-utils';
  export let label: string;
  export let value: string;
  export let disabled = false;
  export let change: (value: string) => void;
  let trigger: HTMLButtonElement;
  let popup: HTMLDivElement;
  let open = false;
  let custom = false;
  let draft = '';
  let hue = 0;
  let saturation = 0;
  let brightness = 0;
  $: selected = parseColor(value) ?? { hex: '#808080', opacity: 100 };
  const palette = [
    '#ffffff','#e0e0e0','#bdbdbd','#9e9e9e','#757575','#616161','#424242','#212121','#111111','#000000',
    '#f23645','#ff9800','#ffeb3b','#4caf50','#089981','#00bcd4','#2962ff','#673ab7','#9c27b0','#e91e63',
    '#ffcdd2','#ffe0b2','#fff9c4','#c8e6c9','#b2dfdb','#b2ebf2','#bbdefb','#d1c4e9','#e1bee7','#f8bbd0',
    '#ef9a9a','#ffcc80','#fff59d','#a5d6a7','#80cbc4','#80deea','#90caf9','#b39ddb','#ce93d8','#f48fb1',
    '#e57373','#ffb74d','#fff176','#81c784','#4db6ac','#4dd0e1','#64b5f6','#9575cd','#ba68c8','#f06292',
    '#ef5350','#ffa726','#ffee58','#66bb6a','#26a69a','#26c6da','#42a5f5','#7e57c2','#ab47bc','#ec407a',
    '#c62828','#ef6c00','#f9a825','#2e7d32','#00897b','#0097a7','#1565c0','#5e35b1','#8e24aa','#d81b60',
    '#b71c1c','#e65100','#f57f17','#1b5e20','#00695c','#006064','#0d47a1','#4527a0','#6a1b9a','#880e4f',
  ];
  function dismiss(restore = false) { open = false; if (restore) trigger?.focus(); }
  function pick(hex: string) { change(colorWithOpacity(hex, selected.opacity)); draft = hex; }
  function opacity(percent: number) { if (Number.isFinite(percent)) change(colorWithOpacity(selected.hex, percent)); }
  async function toggle() {
    if (open) { dismiss(); return; }
    // One active picker across the modal, including paired bullish/bearish controls.
    document.dispatchEvent(new CustomEvent('deplyzeview-color-picker-open'));
    custom = false;
    draft = selected.hex;
    open = true;
    await tick();
    popup?.querySelector<HTMLButtonElement>('[data-color-index][tabindex="0"]')?.focus();
  }
  function showCustom() {
    custom = !custom;
    draft = selected.hex;
    ({ hue, saturation, brightness } = hexToHsv(selected.hex));
  }
  function updateSpectrum() { pick(hsvToHex(hue, saturation, brightness)); }
  function moveSpectrum(event: PointerEvent) {
    const node = event.currentTarget as HTMLElement;
    if (event.type === 'pointerdown') node.setPointerCapture(event.pointerId);
    else if (!node.hasPointerCapture(event.pointerId)) return;
    const bounds = node.getBoundingClientRect();
    saturation = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    brightness = 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    updateSpectrum();
  }
  function spectrumKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    saturation = Math.max(0, Math.min(1, saturation + (event.key === 'ArrowRight' ? .01 : event.key === 'ArrowLeft' ? -.01 : 0)));
    brightness = Math.max(0, Math.min(1, brightness + (event.key === 'ArrowUp' ? .01 : event.key === 'ArrowDown' ? -.01 : 0)));
    updateSpectrum();
  }
  function paletteKey(event: KeyboardEvent) {
    const target = event.target as HTMLButtonElement;
    const index = Number(target.dataset.colorIndex);
    if (!Number.isInteger(index)) return;
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 10 : event.key === 'ArrowUp' ? -10 : 0;
    if (!offset) return;
    event.preventDefault();
    popup.querySelector<HTMLButtonElement>(`[data-color-index="${(index + offset + palette.length) % palette.length}"]`)?.focus();
  }
  // Portal into the settings dialog so the scrolling settings panel cannot clip
  // the palette. Geometry is measured and clamped to the dialog's available space.
  function mountPopup(node: HTMLDivElement) {
    const dialog = trigger.closest('dialog');
    if (!dialog) return;
    dialog.appendChild(node);
    function position() {
      if (!dialog) return;
      const anchor = trigger.getBoundingClientRect(), frame = dialog.getBoundingClientRect();
      node.style.maxHeight = `${Math.max(0, dialog.clientHeight - 16)}px`;
      const width = node.offsetWidth, height = node.offsetHeight;
      const left = Math.min(Math.max(8, anchor.left - frame.left), Math.max(8, dialog.clientWidth - width - 8));
      const below = anchor.bottom - frame.top + 6;
      const top = below + height <= dialog.clientHeight - 8 ? below : Math.max(8, Math.min(anchor.top - frame.top - height - 6, dialog.clientHeight - height - 8));
      node.style.left = `${left}px`; node.style.top = `${top}px`;
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !node.contains(event.target) && !trigger.contains(event.target)) dismiss();
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dismiss(true); }
    }
    function anotherPicker() { dismiss(); }
    function scroll(event: Event) { if (event.target instanceof Node && !node.contains(event.target)) dismiss(); }
    const observer = new ResizeObserver(position);
    observer.observe(node); observer.observe(dialog);
    position();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('deplyzeview-color-picker-open', anotherPicker);
    window.addEventListener('resize', position);
    dialog.addEventListener('scroll', scroll, true);
    return { destroy() {
      observer.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('deplyzeview-color-picker-open', anotherPicker);
      window.removeEventListener('resize', position);
      dialog.removeEventListener('scroll', scroll, true);
      node.remove();
    } };
  }
</script>
<button class="appearance-swatch color-trigger" bind:this={trigger} type="button" aria-label={label} title={`${label}: ${value}`} aria-haspopup="dialog" aria-expanded={open} {disabled} onclick={toggle}><span style:background={value}></span></button>
{#if open}
  <div class="color-popover" bind:this={popup} role="dialog" aria-label={`${label} color`} tabindex="-1" use:mountPopup>
    <div class="color-palette" role="group" aria-label="Color palette" tabindex="-1">
      {#each palette as hex, index}<button type="button" class="palette-cell" style:background={hex} aria-label={hex} aria-pressed={selected.hex === hex} data-color-index={index} onkeydown={paletteKey} tabindex={index === Math.max(0, palette.indexOf(selected.hex)) ? 0 : -1} onclick={() => pick(hex)}></button>{/each}
    </div>
    <div class="color-custom-row"><button type="button" class="color-custom-toggle" aria-label="Custom color" aria-expanded={custom} onclick={showCustom}><Plus size={15}/></button><button type="button" class="color-picker-close" aria-label="Close color picker" onclick={() => dismiss(true)}><X size={13}/></button></div>
    {#if custom}
      <div class="color-custom-editor">
        <button type="button" class="color-spectrum" aria-label="Saturation and brightness, use arrow keys to adjust" tabindex="0" style:background-color={hsvToHex(hue, 1, 1)} onpointerdown={moveSpectrum} onpointermove={moveSpectrum} onkeydown={spectrumKey}><span style:left={`${saturation * 100}%`} style:top={`${(1 - brightness) * 100}%`}></span></button>
        <input class="color-hue" aria-label="Hue" type="range" min="0" max="359" step="1" value={hue} oninput={(e) => { hue = e.currentTarget.valueAsNumber; updateSpectrum(); }}/>
        <label class="color-hex-row">Hex<input aria-label="Custom hex color" maxlength="7" bind:value={draft} aria-invalid={!/^#[0-9a-f]{6}$/i.test(draft)} onchange={() => { if (/^#[0-9a-f]{6}$/i.test(draft)) { pick(draft.toLowerCase()); ({ hue, saturation, brightness } = hexToHsv(draft)); } }}/></label>
      </div>
    {/if}
    <label class="color-opacity-label" for={`opacity-${label.replace(/ /g, '-')}`}>Opacity</label>
    <div class="color-opacity-controls"><input id={`opacity-${label.replace(/ /g, '-')}`} aria-label={`${label} opacity`} type="range" min="0" max="100" step="1" value={selected.opacity} style:--selected-color={selected.hex} oninput={(e) => opacity(e.currentTarget.valueAsNumber)}/><div class="color-opacity-number"><input aria-label={`${label} opacity percent`} type="number" min="0" max="100" value={Math.round(selected.opacity)} oninput={(e) => opacity(e.currentTarget.valueAsNumber)}/><span>%</span></div></div>
  </div>
{/if}
