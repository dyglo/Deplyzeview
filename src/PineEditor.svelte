<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { StreamLanguage } from '@codemirror/language';
  import type { Vela } from '@luxalgo/vela';
  import { NativePineEngine, workerJob } from './pine/engine';
  import { SOURCE_LIMIT } from './pine/lexer';
  import type { SavedScript } from './pine/library';
  export let chart:Vela;
  export let scripts:SavedScript[] = [];
  export let persist:(scripts:SavedScript[])=>void;
  let host:HTMLDivElement;
  let editor:EditorView;
  let id = '';
  const aliases = new Map<string,string>();
  let name = 'My indicator';
  let source = '//@version=5\nindicator("My EMA", overlay=true)\nlength = 20\naverage = ta.ema(close, length)\nplot(average, color=color.orange, linewidth=2)\n';
  let savedSource = '';
  let savedName = '';
  let message = '';
  let busy = false;
  let mounted = true;
  export function open(script:SavedScript) {
    if ((source !== savedSource || name !== savedName) && !confirm('Replace the current unsaved editor draft?')) return;
    id=script.id; name=script.name; source=script.source; savedSource=source; savedName=name;
    editor?.dispatch({changes:{from:0,to:editor.state.doc.length,insert:source}});
    message='';
  }
  export function detach(scriptId:string) {
    if (id===scriptId) {id='';savedSource='';savedName='';}
    aliases.delete('pine:'+scriptId);
  }
  function newScript() {
    if ((source !== savedSource || name !== savedName) && !confirm('Discard this editor draft?')) return;
    id='';name='My indicator';source='//@version=5\nindicator("My indicator", overlay=true)\nplot(close)\n';savedSource='';savedName='';
    editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:source}});
  }
  async function action(save:boolean) {
    busy=true;message='';
    const snapshot=source, scriptId=id, scriptName=name.trim();
    try {
      await workerJob(snapshot).promise;
      if (!mounted) return;
      if (save) {
        if (!scriptName) throw new Error('Enter a name before saving.');
        const record:SavedScript={id:scriptId || crypto.randomUUID(),name:scriptName,source:snapshot,updatedAt:new Date().toISOString()};
        persist([...scripts.filter(s=>s.id!==record.id),record]);
        if (!scriptId && chart.indicators().some(h=>h.id==='pine:draft')) aliases.set('pine:'+record.id,'pine:draft');
        id=record.id;savedSource=snapshot;savedName=scriptName;message='Saved. Run to apply this revision.';
      } else {
        await runSource(snapshot,'pine:'+(scriptId || 'draft'));
        message='Running on the active chart.';
      }
    } catch(error) { message=error instanceof Error ? error.message : String(error); }
    finally {busy=false;}
  }
  export async function runSaved(script:SavedScript) {
    await runSource(script.source,'pine:'+script.id);
  }
  async function runSource(text:string,instanceId:string) {
    instanceId=aliases.get(instanceId) ?? instanceId;
    const existing=chart.indicators().find(h=>h.id===instanceId);
    if (existing) {
      const result=await existing.updateCode(text);
      if (!result.ok) throw result.error;
      existing.setVisible(true);
    } else {
      if (chart.indicators().filter(h=>h.id.startsWith('pine:')).length>=8) throw new Error('Remove a Pine indicator before adding another. The limit is eight.');
      const result=await chart.runIndicator(text,{id:instanceId,language:'deplyze-pine'});
      if (!result.ok) { chart.indicators().find(h=>h.id===instanceId)?.remove(); throw result.error; }
    }
  }
  function focusError() {
    const match=/Line (\d+), column (\d+)/.exec(message);
    if (!match || !editor) return;
    const line=editor.state.doc.line(Math.min(Number(match[1]),editor.state.doc.lines));
    editor.dispatch({selection:{anchor:Math.min(line.to,line.from+Number(match[2])-1)},scrollIntoView:true});editor.focus();
  }
  onMount(()=>{
    chart.registerEngine('deplyze-pine',new NativePineEngine());
    const language=StreamLanguage.define({
      token(stream) {
        if (stream.eatSpace()) return null;
        if (stream.match('//')) {stream.skipToEnd();return 'comment';}
        if (stream.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/)) return 'string';
        if (stream.match(/#[0-9a-fA-F]+|\b\d+(\.\d+)?\b/)) return 'number';
        if (stream.match(/\b(if|else|var|float|int|bool|string|and|or|not|true|false)\b/)) return 'keyword';
        if (stream.match(/[a-zA-Z_]\w*/)) return 'variableName';
        stream.next();return null;
      }
    });
    editor=new EditorView({parent:host,state:EditorState.create({doc:source,extensions:[
      basicSetup,language,EditorView.theme({'&':{height:'100%',background:'#101114',color:'#ddd'},'.cm-scroller':{overflow:'auto'},'.cm-gutters':{background:'#17191d',color:'#888'}},{dark:true}),
      EditorState.transactionFilter.of(transaction=>{
        if (transaction.docChanged && new TextEncoder().encode(transaction.newDoc.toString()).length>SOURCE_LIMIT) {message='Source exceeds 256 KiB.';return [];}
        return transaction;
      }),
      EditorView.updateListener.of(update=>{if(update.docChanged)source=update.state.doc.toString();})
    ]})});
    return ()=>{mounted=false;editor.destroy();};
  });
</script>
<section class="pine-panel" aria-label="Pine Editor">
  <header><strong>Pine Editor</strong><button onclick={newScript} disabled={busy}>New</button></header>
  <input aria-label="Indicator name" bind:value={name} maxlength="100"/>
  <div class="actions"><button onclick={()=>action(false)} disabled={busy}>{busy?'Working…':'Run'}</button><button onclick={()=>action(true)} disabled={busy}>Save</button><span>{source!==savedSource || name!==savedName?'Unsaved changes':''}</span></div>
  <div class="editor" bind:this={host}></div>
  {#if message}<div role="status"><button class="message" onclick={focusError}>{message}</button></div>{/if}
  <small>Pine v5 subset · SMA, EMA, RSI, ATR, crosses · 10,000 bars maximum</small>
</section>
<style>
.pine-panel{width:420px;max-width:60vw;height:100%;display:flex;flex-direction:column;background:#17191d;border-left:1px solid #303238;padding:12px;gap:10px;box-sizing:border-box}
header,.actions{display:flex;align-items:center;gap:10px}header{justify-content:space-between}.editor{flex:1;min-height:0;overflow:hidden}
button,input{background:#25272d;color:#ddd;border:1px solid #393c43;border-radius:4px;padding:7px}small,.actions span{font-size:11px;color:#999}.message{text-align:left;white-space:pre-wrap}
</style>
