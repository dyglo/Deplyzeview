<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Vela, DrawingTypeKey } from '@luxalgo/vela';
  import { Crosshair, ChevronRight, Star, GripVertical, Eye, EyeOff, LockKeyhole, UnlockKeyhole, Undo2, Ruler, X } from 'lucide-svelte';
  import { drawingGroups, drawingCatalog, groupTool, clampToolbarPosition, type DrawingToolPreferences } from './drawing-catalog';
  export let chart: Vela;
  export let area: HTMLElement;
  export let preferences: DrawingToolPreferences;
  export let change: (preferences: DrawingToolPreferences) => void;
  export let blocked = false;
  let aside: HTMLElement;
  let menu: HTMLDivElement;
  let bar: HTMLDivElement;
  let openGroup: string | null = null;
  let menuAnchor: HTMLButtonElement;
  let active: DrawingTypeKey | null = null;
  let measuring = false;
  let selectedIds: string[] = [];
  let selectedVisible = true;
  let selectedLocked = false;
  let undo = false;
  let redo = false;
  let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
  let transientPosition: { left: number; top: number } | null = null;
  $: group = drawingGroups.find(group => group.id === openGroup);
  $: favorites = preferences.favorites.flatMap(type => { const tool = drawingCatalog.get(type); return tool ? [tool] : []; });
  $: chart.drawings.setFavorites(preferences.favorites);
  $: if (blocked) openGroup = null;
  function save(patch: Partial<DrawingToolPreferences>) { change({ ...preferences, ...patch }); }
  function sync() {
    active = chart.drawings.getTool();
    measuring = chart.drawings.getMode() === 'measure';
    undo = chart.drawings.canUndo(); redo = chart.drawings.canRedo();
    const selected = chart.drawings.all().filter(drawing => selectedIds.includes(drawing.id));
    selectedIds = selected.map(drawing => drawing.id);
    selectedVisible = selected.every(drawing => drawing.visible !== false);
    selectedLocked = selected.every(drawing => drawing.locked === true);
  }
  onMount(() => {
    chart.drawings.setFavorites(preferences.favorites);
    sync();
    const dispose = [
      chart.on('drawing:tool', ({ type }) => {
        sync();
        const group = drawingGroups.find(group => group.tools.some(tool => tool.type === type));
        if (group && type && preferences.lastUsed[group.id] !== type) save({ lastUsed: { ...preferences.lastUsed, [group.id]: type } });
      }),
      chart.on('drawing:mode', sync), chart.on('drawing:created', sync),
      chart.on('drawing:edited', sync), chart.on('drawing:removed', sync),
      chart.on('drawing:selected', ({ ids }) => { selectedIds = ids; sync(); }),
      chart.on('drawing:favorites', () => save({ favorites: chart.drawings.favorites() })),
    ];
    return () => dispose.forEach(fn => fn());
  });
  function activate(type: DrawingTypeKey) {
    openGroup = null;
    const group = drawingGroups.find(group => group.tools.some(tool => tool.type === type));
    if (group) save({ lastUsed: { ...preferences.lastUsed, [group.id]: type } });
    chart.drawings.setTool(type);
    chart.renderer.focus();
    sync();
  }
  function cursor() { openGroup = null; chart.drawings.setMode(null); chart.drawings.setTool(null); chart.renderer.focus(); sync(); }
  function toggleFavorite(type: DrawingTypeKey) {
    const adding = !chart.drawings.isFavorite(type);
    // Starring makes the shortcut bar available without changing the armed tool.
    chart.drawings.setFavorite(type, adding);
    if (adding) save({ visible: true, favorites: chart.drawings.favorites() });
  }
  async function showGroup(id: string, event: MouseEvent) {
    menuAnchor = event.currentTarget as HTMLButtonElement;
    openGroup = openGroup === id ? null : id;
    if (openGroup) { await tick(); menu?.querySelector<HTMLButtonElement>('.drawing-menu-tool[aria-pressed="true"]')?.focus(); if (!menu?.contains(document.activeElement)) menu?.querySelector<HTMLButtonElement>('.drawing-menu-tool')?.focus(); }
  }
  function closeGroup(restore = false) { openGroup = null; if (restore) menuAnchor?.focus(); }
  function selectedAction(action: 'visibility' | 'lock') {
    const next = action === 'visibility' ? !selectedVisible : !selectedLocked;
    for (const id of selectedIds) {
      if (action === 'visibility') chart.drawings.show(id, next);
      else chart.drawings.lock(id, next);
    }
    sync();
  }
  // These nodes share chart coordinates but sit outside its input surface. The
  // renderer never sees menu clicks or favorites-bar drags as drawing gestures.
  function placeMenu(node: HTMLDivElement, _group: string | null) {
    area.appendChild(node);
    function position() {
      const frame = area.getBoundingClientRect(), anchor = menuAnchor.getBoundingClientRect();
      node.style.maxHeight = `${Math.max(0, area.clientHeight - 16)}px`;
      node.style.top = `${Math.max(8, Math.min(anchor.top - frame.top, area.clientHeight - node.offsetHeight - 8))}px`;
      node.style.left = `${Math.max(8, Math.min(anchor.right - frame.left + 6, area.clientWidth - node.offsetWidth - 8))}px`;
    }
    function outside(event: PointerEvent) { if (event.target instanceof Node && !node.contains(event.target) && !aside.contains(event.target)) closeGroup(); }
    function focusOutside(event: FocusEvent) { if (event.relatedTarget instanceof Node && !node.contains(event.relatedTarget) && !aside.contains(event.relatedTarget)) closeGroup(); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeGroup(true); } }
    const observer = new ResizeObserver(position); observer.observe(area); observer.observe(node); position();
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true); node.addEventListener('focusout', focusOutside);
    return { update: position, destroy() { observer.disconnect(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); node.removeEventListener('focusout', focusOutside); node.remove(); } };
  }
  function menuKeys(event: KeyboardEvent) {
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('.drawing-menu-tool')];
    const row = (event.target as HTMLElement).closest('.drawing-menu-row');
    const index = buttons.findIndex(button => button.parentElement === row);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
    if (event.key === 'ArrowRight') { event.preventDefault(); row?.querySelector<HTMLButtonElement>('.drawing-menu-star')?.focus(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); row?.querySelector<HTMLButtonElement>('.drawing-menu-tool')?.focus(); }
  }
  function positionBar() {
    if (!bar) return;
    const point = transientPosition ?? clampToolbarPosition(preferences.position.x, preferences.position.y, area.clientWidth, area.clientHeight, bar.offsetWidth, bar.offsetHeight);
    bar.style.left = `${point.left}px`; bar.style.top = `${point.top}px`;
  }
  function mountBar(node: HTMLDivElement, _position: DrawingToolPreferences['position']) {
    area.appendChild(node);
    const observer = new ResizeObserver(positionBar); observer.observe(area); observer.observe(node); positionBar();
    return { update: positionBar, destroy() { observer.disconnect(); node.remove(); } };
  }
  function startDrag(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: bar.offsetLeft, top: bar.offsetTop };
  }
  function moveDrag(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    const maxLeft = Math.max(8, area.clientWidth - bar.offsetWidth - 8), maxTop = Math.max(8, area.clientHeight - bar.offsetHeight - 8);
    transientPosition = { left: Math.max(8, Math.min(maxLeft, drag.left + event.clientX - drag.x)), top: Math.max(8, Math.min(maxTop, drag.top + event.clientY - drag.y)) };
    positionBar();
  }
  function finishDrag(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    const position = { x: Math.max(0, Math.min(1, (bar.offsetLeft - 8) / Math.max(1, area.clientWidth - bar.offsetWidth - 16))), y: Math.max(0, Math.min(1, (bar.offsetTop - 8) / Math.max(1, area.clientHeight - bar.offsetHeight - 16))) };
    transientPosition = null; save({ position });
  }
  function nudgeBar(event: KeyboardEvent) {
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-.02, 0], ArrowRight: [.02, 0], ArrowUp: [0, -.02], ArrowDown: [0, .02] };
    const offset = offsets[event.key]; if (!offset) return;
    event.preventDefault();
    save({ position: { x: Math.max(0, Math.min(1, preferences.position.x + offset[0])), y: Math.max(0, Math.min(1, preferences.position.y + offset[1])) } });
  }
</script>
<aside class="drawing-toolbar grouped-drawing-toolbar" aria-label="Drawing tools" inert={blocked} bind:this={aside}>
  <button aria-label="Cursor" title="Cursor" class:active-tool={!active && !measuring} aria-pressed={!active && !measuring} onclick={cursor}><Crosshair size={14}/></button>
  <div class="tool-divider"></div>
  {#each drawingGroups as group (group.id)}{@const tool = groupTool(group, preferences)}
    <div class="drawing-tool-group" class:active-group={group.tools.some(tool => tool.type === active)}>
      <button class="drawing-group-main" aria-label={tool.label} title={`${tool.label} · ${group.label}`} aria-pressed={active === tool.type} onclick={() => activate(tool.type)}><span class="drawing-svg">{@html tool.icon}</span></button>
      <button class="drawing-group-more" aria-label={`Open ${group.label} tools`} title={`${group.label} tools`} aria-expanded={openGroup === group.id} aria-haspopup="dialog" onclick={(event) => showGroup(group.id, event)}><ChevronRight size={9}/></button>
    </div>
  {/each}
  <div class="tool-divider"></div>
  <button aria-label="Measure" title="Measure" aria-pressed={measuring} class:active-tool={measuring} onclick={() => { closeGroup(); chart.drawings.setMode(measuring ? null : 'measure'); chart.renderer.focus(); sync(); }}><Ruler size={14}/></button>
  <button aria-label="Toggle selected drawings visibility" title="Selected drawings visibility" disabled={!selectedIds.length} aria-pressed={!selectedVisible} onclick={() => selectedAction('visibility')}>{#if selectedVisible}<Eye size={14}/>{:else}<EyeOff size={14}/>{/if}</button>
  <button aria-label="Lock selected drawings" title="Lock selected drawings" disabled={!selectedIds.length} aria-pressed={selectedLocked} onclick={() => selectedAction('lock')}>{#if selectedLocked}<LockKeyhole size={14}/>{:else}<UnlockKeyhole size={14}/>{/if}</button>
  <div class="toolbar-bottom">
    <button aria-label="Show favorite drawing tools" title="Show/hide favorites toolbar" aria-pressed={preferences.visible && favorites.length > 0} disabled={!favorites.length} onclick={() => save({ visible: !preferences.visible })}><Star size={14}/></button>
    <button aria-label="Undo drawing" title="Undo drawing" disabled={!undo} onclick={() => { chart.drawings.undo(); sync(); }}><Undo2 size={14}/></button>
    <button aria-label="Redo drawing" title="Redo drawing" disabled={!redo} onclick={() => { chart.drawings.redo(); sync(); }}><Undo2 size={14} class="redo-icon"/></button>
  </div>
</aside>
{#if group && !blocked}
  <div class="drawing-tools-menu" role="dialog" aria-label={`${group.label} drawing tools`} tabindex="-1" bind:this={menu} use:placeMenu={openGroup}>
    <div class="drawing-menu-content" role="toolbar" aria-label={`${group.label} tools`} tabindex="-1" onkeydown={menuKeys}>
      {#each group.sections ?? [{ label: group.label, tools: group.tools }] as section}
        <div class="drawing-menu-heading">{section.label}</div>
        {#each section.tools as tool (tool.type)}
          <div class="drawing-menu-row">
            <button class="drawing-menu-tool" aria-pressed={active === tool.type} onclick={() => activate(tool.type)}><span class="drawing-svg">{@html tool.icon}</span><span>{tool.label}</span></button>
            <button class="drawing-menu-star" aria-label={`${preferences.favorites.includes(tool.type) ? 'Remove' : 'Add'} ${tool.label} ${preferences.favorites.includes(tool.type) ? 'from' : 'to'} favorites`} title="Favorite" aria-pressed={preferences.favorites.includes(tool.type)} onclick={() => toggleFavorite(tool.type)}><Star size={13} fill={preferences.favorites.includes(tool.type) ? 'currentColor' : 'none'}/></button>
          </div>
        {/each}
      {/each}
    </div>
  </div>
{/if}
{#if favorites.length && preferences.visible}
  <div class="drawing-favorites" class:favorites-blocked={blocked} role="toolbar" aria-label="Favorite drawing tools" bind:this={bar} use:mountBar={preferences.position}>
    <button class="drawing-favorites-grip" aria-label="Move favorites toolbar" title="Drag to move · arrow keys to nudge" onpointerdown={startDrag} onpointermove={moveDrag} onpointerup={finishDrag} onpointercancel={finishDrag} onlostpointercapture={finishDrag} onkeydown={nudgeBar}><GripVertical size={13}/></button>
    <div class="drawing-favorites-tools">{#each favorites as tool (tool.type)}<button title={tool.label} aria-label={tool.label} aria-pressed={active === tool.type} class:active-tool={active === tool.type} onclick={() => activate(tool.type)}><span class="drawing-svg">{@html tool.icon}</span></button>{/each}</div>
    <button class="drawing-favorites-close" aria-label="Hide favorites toolbar" title="Hide favorites toolbar" onclick={() => save({ visible: false })}><X size={11}/></button>
  </div>
{/if}
