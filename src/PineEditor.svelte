<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { StreamLanguage } from '@codemirror/language';
  import { Activity, ChevronDown, Maximize2, Minimize2, Minus, Play, Plus, Save, X } from 'lucide-svelte';
  import type { Vela } from '@luxalgo/vela';
  import { PineEngine } from '@luxalgo/vela-pinets';
  import { SOURCE_LIMIT } from './pine/lexer';
  import { runPineIndicator, withPineWorkerTimeout } from './pine/execution';
  import type { SavedScript } from './pine/library';
  export let chart: Vela;
  export let scripts: SavedScript[] = [];
  export let persist: (scripts: SavedScript[]) => void;
  export let onClose: () => void = () => {};
  export let maximized = false;
  export let onMaximize: () => void = () => {};
  let host: HTMLDivElement;
  let editor: EditorView;
  let id = '';
  const aliases = new Map<string, string>();
  let name = 'My indicator';
  let source = '//@version=5\nindicator("My EMA", overlay=true)\nlength = 20\naverage = ta.ema(close, length)\nplot(average, color=color.orange, linewidth=2)\n';
  let savedSource = '';
  let savedName = '';
  let message = '';
  let busy = false;
  let mounted = true;
  let cursorLine = 1;
  let cursorColumn = 1;
  let scrollRatio = 0;
  let viewportRatio = 0.2;
  let previewLines = source;
  const validator = new PineEngine();
  $: previewLines = source.split('\n').slice(0, 320).map(line => line.slice(0, 48)).join('\n');

  export function open(script: SavedScript) {
    if ((source !== savedSource || name !== savedName) && !confirm('Replace the current unsaved editor draft?')) return;
    id = script.id;
    name = script.name;
    source = script.source;
    savedSource = source;
    savedName = name;
    editor?.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source } });
    message = '';
  }
  export function detach(scriptId: string) {
    if (id === scriptId) { id = ''; savedSource = ''; savedName = ''; }
    aliases.delete('pine:' + scriptId);
  }
  function newScript() {
    if ((source !== savedSource || name !== savedName) && !confirm('Discard this editor draft?')) return;
    id = '';
    name = 'My indicator';
    source = '//@version=5\nindicator("My indicator", overlay=true)\nplot(close)\n';
    savedSource = '';
    savedName = '';
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source } });
    editor.focus();
  }
  async function action(save: boolean) {
    busy = true;
    message = '';
    const snapshot = source, scriptId = id, scriptName = name.trim();
    try {
      await withPineWorkerTimeout(validator.prepare(snapshot, 'pine-editor-validation'), {
        message: 'Pine validation did not respond within 30 seconds. Check the script and try again.',
      });
      if (!mounted) return;
      if (save) {
        if (!scriptName) throw new Error('Enter a name before saving.');
        const record: SavedScript = { id: scriptId || crypto.randomUUID(), name: scriptName, source: snapshot, updatedAt: new Date().toISOString() };
        persist([...scripts.filter(s => s.id !== record.id), record]);
        if (!scriptId && chart.indicators().some(h => h.id === 'pine:draft')) aliases.set('pine:' + record.id, 'pine:draft');
        id = record.id;
        savedSource = snapshot;
        savedName = scriptName;
        message = 'Saved. Run to apply this revision.';
      } else {
        await runSource(snapshot, 'pine:' + (scriptId || 'draft'));
        message = 'Run complete. Applied to the active chart.';
      }
    } catch (error) { message = error instanceof Error ? error.message : String(error); }
    finally { busy = false; }
  }
  export async function runSaved(script: SavedScript) {
    await runSource(script.source, 'pine:' + script.id);
  }
  async function runSource(text: string, instanceId: string) {
    instanceId = aliases.get(instanceId) ?? instanceId;
    const existing = chart.indicators().find(h => h.id === instanceId);
    if (existing) {
      const result = await withPineWorkerTimeout(existing.updateCode(text));
      if (!result.ok) throw result.error;
      existing.setVisible(true);
    } else {
      if (chart.indicators().filter(h => h.id.startsWith('pine:')).length >= 8) throw new Error('Remove a Pine indicator before adding another. The limit is eight.');
      await runPineIndicator(chart, text, instanceId);
    }
  }
  function focusError() {
    const match = /\(line (\d+), column (\d+)\)/i.exec(message) ?? /Line (\d+), column (\d+)/.exec(message);
    if (!match || !editor) return;
    const line = editor.state.doc.line(Math.min(Number(match[1]), editor.state.doc.lines));
    editor.dispatch({ selection: { anchor: Math.min(line.to, line.from + Number(match[2]) - 1) }, scrollIntoView: true });
    editor.focus();
  }
  function syncScrollPosition() {
    if (!editor) return;
    const viewport = editor.scrollDOM;
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    scrollRatio = maxScroll ? viewport.scrollTop / maxScroll : 0;
    viewportRatio = viewport.scrollHeight ? Math.min(1, viewport.clientHeight / viewport.scrollHeight) : 1;
  }
  function seekMinimap(event: PointerEvent) {
    if (!editor) return;
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(bounds.height, 1)));
    const viewport = editor.scrollDOM;
    viewport.scrollTop = ratio * Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    syncScrollPosition();
  }
  function moveMinimapByKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'PageUp' && event.key !== 'PageDown' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const step = event.key.startsWith('Page') ? 0.18 : 0.04;
    scrollRatio = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : Math.max(0, Math.min(1, scrollRatio + (event.key === 'ArrowUp' || event.key === 'PageUp' ? -step : step)));
    editor.scrollDOM.scrollTop = scrollRatio * Math.max(0, editor.scrollDOM.scrollHeight - editor.scrollDOM.clientHeight);
  }
  onMount(() => {
    const language = StreamLanguage.define({
      token(stream) {
        if (stream.eatSpace()) return null;
        if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
        if (stream.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/)) return 'string';
        if (stream.match(/#[0-9a-fA-F]+|\b\d+(\.\d+)?\b/)) return 'number';
        if (stream.match(/\b(if|else|var|float|int|bool|string|and|or|not|true|false)\b/)) return 'keyword';
        if (stream.match(/[a-zA-Z_]\w*/)) return 'variableName';
        stream.next();
        return null;
      }
    });
    editor = new EditorView({ parent: host, state: EditorState.create({ doc: source, extensions: [
      basicSetup,
      language,
      EditorView.theme({
        '&': { height: '100%', minHeight: '0', fontSize: '12px', backgroundColor: 'var(--tone-101114, #101114)', color: 'var(--tone-c7c9ce, #c7c9ce)' },
        '.cm-scroller': { overflow: 'auto', fontFamily: '"Roboto Mono", ui-monospace, SFMono-Regular, Consolas, monospace', lineHeight: '1.65' },
        '.cm-content': { padding: '10px 0 18px' },
        '.cm-line': { padding: '0 12px 0 8px' },
        '.cm-gutters': { backgroundColor: 'var(--tone-111215, #111215)', color: 'var(--tone-737680, #737680)', border: '0', borderRight: '1px solid var(--tone-24262c, #24262c)', minWidth: '42px' },
        '.cm-lineNumbers .cm-gutterElement': { minWidth: '34px', padding: '0 9px 0 7px', textAlign: 'right' },
        '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--tone-26282e, #26282e) 34%, transparent)' },
        '.cm-activeLineGutter': { backgroundColor: 'var(--tone-191a1f, #191a1f)', color: 'var(--tone-c7c9ce, #c7c9ce)' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--tone-7e544d, #7e544d) 44%, transparent)' },
        '.cm-cursor': { borderLeftColor: 'var(--tone-d3d4d8, #d3d4d8)' },
        '.cm-tooltip': { backgroundColor: 'var(--tone-15161a, #15161a)', color: 'var(--tone-c7c9ce, #c7c9ce)', border: '1px solid var(--tone-30323a, #30323a)' }
      }),
      EditorState.transactionFilter.of(transaction => {
        if (transaction.docChanged && new TextEncoder().encode(transaction.newDoc.toString()).length > SOURCE_LIMIT) { message = 'Source exceeds 256 KiB.'; return []; }
        return transaction;
      }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) source = update.state.doc.toString();
        if (update.selectionSet || update.docChanged) {
          const position = update.state.selection.main.head;
          const line = update.state.doc.lineAt(position);
          cursorLine = line.number;
          cursorColumn = position - line.from + 1;
        }
      })
    ] }) });
    editor.scrollDOM.addEventListener('scroll', syncScrollPosition, { passive: true });
    syncScrollPosition();
    const resize = new ResizeObserver(syncScrollPosition);
    resize.observe(host);
    return () => { mounted = false; resize.disconnect(); editor.scrollDOM.removeEventListener('scroll', syncScrollPosition); editor.destroy(); };
  });
</script>

<section class="pine-panel" aria-label="Pine Editor">
  <header class="pine-windowbar">
    <div class="pine-window-title"><span class="pine-title-icon"><Activity size={14}/></span><strong>Pine Editor</strong></div>
    <div class="pine-window-actions">
      <button type="button" aria-label="Close Pine Editor" title="Close Pine Editor" onclick={onClose}><Minus size={15}/></button>
      <button type="button" aria-label="Close editor panel" title="Close editor" onclick={onClose}><X size={16}/></button>
    </div>
  </header>
  <div class="pine-toolbar" role="toolbar" aria-label="Pine script actions">
    <div class="script-title"><span class="script-state-dot" class:script-dirty={source !== savedSource || name !== savedName}></span><input aria-label="Indicator name" bind:value={name} maxlength="100" title="Script name"/><ChevronDown size={13}/></div>
    <button class="pine-action run-action" type="button" onclick={() => action(false)} disabled={busy} title="Run script" aria-label={busy ? 'Running script' : 'Run script'}><Play size={15}/><span>{busy ? 'Working…' : 'Run'}</span></button>
    <button class="pine-action" type="button" onclick={() => action(true)} disabled={busy} title="Save script" aria-label="Save script"><Save size={15}/><span>Save</span></button>
    <button class="pine-action new-action" type="button" onclick={newScript} disabled={busy} title="Create a new script" aria-label="New script"><Plus size={15}/><span>New</span></button>
    <span class="toolbar-spacer"></span>
    <button class="pine-action maximize-action" type="button" onclick={onMaximize} title={maximized ? 'Restore editor split' : 'Maximize editor'} aria-label={maximized ? 'Restore editor split' : 'Maximize editor'}>{#if maximized}<Minimize2 size={15}/>{:else}<Maximize2 size={15}/>{/if}</button>
  </div>
  <div class="editor-workspace">
    <div class="editor" id="pine-code-editor" bind:this={host}></div>
    <div class="editor-minimap" role="scrollbar" aria-label="Editor document overview" aria-controls="pine-code-editor" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(scrollRatio * 100)} tabindex="0" onpointerdown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); seekMinimap(event); }} onpointermove={(event) => { if (event.buttons) seekMinimap(event); }} onkeydown={moveMinimapByKey}>
      <pre>{previewLines}</pre>
      <span class="minimap-viewport" style:top={`${scrollRatio * 100}%`} style:height={`${Math.max(5, viewportRatio * 100)}%`}></span>
    </div>
  </div>
  {#if message}<div class="pine-feedback" role="status"><button class="message" type="button" onclick={focusError}>{message}</button></div>{/if}
  <footer class="pine-statusbar"><span class="pine-language">Pine Script · v5/v6</span><span class="status-spacer"></span><span>Line {cursorLine}, Col {cursorColumn}</span><span class="status-divider"></span><span>UTF-8</span><span class="status-divider"></span><span>Spaces: 2</span></footer>
</section>

<style>
  .pine-panel{width:100%;min-width:0;height:100%;min-height:0;display:flex;flex:1 1 0;flex-direction:column;background:var(--tone-101114,#101114);color:var(--tone-c7c9ce,#c7c9ce);overflow:hidden}
  .pine-windowbar{height:34px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 12px;background:var(--tone-111215,#111215);border-bottom:1px solid var(--tone-25272d,#25272d)}
  .pine-window-title{display:flex;align-items:center;gap:9px;color:var(--tone-bfc1c8,#bfc1c8)}.pine-window-title strong{font-size:10px;font-weight:450}.pine-title-icon{width:17px;height:17px;display:grid;place-items:center;color:var(--tone-92949c,#92949c)}
  .pine-window-actions{height:100%;display:flex;align-items:center;gap:2px}.pine-window-actions button{width:27px;height:25px;display:grid;place-items:center;color:var(--tone-858791,#858791);border-radius:3px}.pine-window-actions button:hover{background:var(--tone-26282e,#26282e);color:var(--tone-dadbe0,#dadbe0)}
  .pine-toolbar{height:57px;min-width:0;flex:none;display:flex;align-items:center;gap:8px;padding:0 12px;border-bottom:1px solid var(--tone-25272d,#25272d);background:var(--tone-101114,#101114)}
  .script-title{min-width:92px;max-width:min(260px,38%);height:31px;display:flex;align-items:center;gap:7px;padding:0 7px;border:1px solid transparent;border-radius:4px;color:var(--tone-858791,#858791)}.script-title:focus-within{border-color:var(--tone-3b3d45,#3b3d45);background:var(--tone-15161a,#15161a)}
  .script-title input{width:100%;min-width:0;padding:0;border:0;outline:0;background:transparent;color:var(--tone-d3d4d8,#d3d4d8);font-size:14px;font-weight:550;letter-spacing:.05px}.script-title input::placeholder{color:var(--tone-777a83,#777a83)}
  .script-state-dot{width:8px;height:8px;flex:none;border-radius:50%;background:var(--tone-758f83,#758f83)}.script-state-dot.script-dirty{background:var(--tone-7e544d,#7e544d)}
  .pine-action{height:32px;min-width:32px;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 9px;color:var(--tone-a4a6ad,#a4a6ad);border:1px solid var(--tone-30323a,#30323a);border-radius:4px;background:var(--tone-111215,#111215);font-size:9px;white-space:nowrap;transition:background .12s,color .12s,border-color .12s}.pine-action:hover:not(:disabled){background:var(--tone-26282e,#26282e);color:var(--tone-e0e1e5,#e0e1e5);border-color:var(--tone-454850,#454850)}.pine-action:disabled{opacity:.55;cursor:wait}.pine-action.run-action{color:var(--tone-d3d4d8,#d3d4d8)}.pine-action.run-action :global(svg){fill:currentColor}.new-action{padding:0 8px}.toolbar-spacer,.status-spacer{flex:1;min-width:4px}
  .editor-workspace{position:relative;display:flex;flex:1;min-width:0;min-height:0;overflow:hidden;background:var(--tone-101114,#101114)}.editor{flex:1;min-width:0;min-height:0;overflow:hidden}.editor :global(.cm-editor){height:100%}.editor :global(.cm-comment){color:var(--tone-777a83,#777a83)}.editor :global(.cm-string){color:var(--tone-758f83,#758f83)}.editor :global(.cm-keyword){color:var(--tone-9a9ca5,#9a9ca5)}.editor :global(.cm-number){color:var(--tone-92949c,#92949c)}.editor :global(.cm-variableName){color:var(--tone-c7c9ce,#c7c9ce)}
  .editor-minimap{position:relative;width:58px;flex:none;overflow:hidden;padding:5px 4px;border-left:1px solid var(--tone-25272d,#25272d);background:var(--tone-111215,#111215);cursor:pointer;touch-action:none;user-select:none;outline:none}.editor-minimap:focus-visible{box-shadow:inset 0 0 0 1px var(--tone-7e544d,#7e544d)}.editor-minimap pre{margin:0;color:var(--tone-737680,#737680);font:3px/4px "Roboto Mono",monospace;white-space:pre;overflow-wrap:normal;opacity:.78}.minimap-viewport{position:absolute;left:0;right:0;min-height:5%;border:1px solid color-mix(in srgb,var(--tone-a4a6ad,#a4a6ad) 65%,transparent);background:color-mix(in srgb,var(--tone-a4a6ad,#a4a6ad) 10%,transparent);pointer-events:none}
  .pine-feedback{flex:none;max-height:70px;overflow:auto;padding:6px 12px;border-top:1px solid var(--tone-25272d,#25272d);background:var(--tone-111215,#111215)}.message{width:100%;padding:3px 0;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--tone-9a9ca5,#9a9ca5);font-size:9px}.message:hover{color:var(--tone-d3d4d8,#d3d4d8)}
  .pine-statusbar{height:23px;flex:none;display:flex;align-items:center;gap:9px;padding:0 11px;background:var(--tone-111215,#111215);border-top:1px solid var(--tone-25272d,#25272d);color:var(--tone-83858d,#83858d);font:8px "Roboto Mono",monospace;white-space:nowrap}.pine-language{color:var(--tone-a4a6ad,#a4a6ad)}.status-divider{width:1px;height:11px;background:var(--tone-303239,#303239)}
  @media(max-width:820px){.pine-toolbar{gap:5px;padding:0 7px}.pine-action{padding:0 7px}.pine-action span{display:none}.script-title{max-width:42%}.editor-minimap{width:43px}}
</style>
