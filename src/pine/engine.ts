import type { ScriptingEngine, ExecutionRequest, ExecutionHandlers, PreparedScript, IndicatorModel } from '@luxalgo/vela';
import type { Bar, Output, Program } from './runtime';

export function workerJob<T>(source:string, bars?:Bar[]): {promise:Promise<T>;cancel:()=>void} {
  const worker = new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
  let rejectJob: (error:Error)=>void = () => {};
  let timer:ReturnType<typeof setTimeout>;
  const cleanup = () => { clearTimeout(timer); worker.terminate(); };
  const promise = new Promise<T>((resolve,reject) => {
    rejectJob = reject;
    timer = setTimeout(() => { cleanup(); reject(new Error('DeplyzeView runtime limit: Pine execution exceeded the five-second worker cap. The script may be valid Pine; reduce history or computation to fit this editor limit.')); },5000);
    worker.onmessage = event => { cleanup(); event.data.ok ? resolve(event.data.result) : reject(new Error(event.data.error)); };
    worker.onerror = event => { cleanup(); reject(new Error(event.message || 'Pine worker failed.')); };
    worker.postMessage({source,bars});
  });
  return {promise,cancel:()=>{cleanup();rejectJob(new Error('Execution cancelled.'));}};
}
export function toModel(id:string, output:Output):IndicatorModel {
  return {
    id,...output.meta,paneHint:output.meta.overlay ? 'price' : 'new',
    series:output.plots.map((plot,index) => {
      const base = {id:id+':'+index,title:plot.title,paneId:''};
      if (plot.kind === 'plotcandle') return {...base,kind:'candle' as const,bars:plot.candleBars ?? [],barColors:plot.barColors};
      if (plot.kind === 'plotshape') return {...base,kind:'markers' as const,markers:plot.points.filter(p=>p.value === true).map(p=>({time:p.time,color:plot.color,shape:plot.shape,position:plot.location as 'aboveBar'|'belowBar'}))};
      return {...base,kind:'line' as const,points:plot.points.map(p=>({time:p.time,value:typeof p.value === 'number' ? p.value : null})),style:{color:plot.color,width:plot.width,lineStyle:'solid' as const}};
    }),
    inputs:output.inputs as unknown as IndicatorModel['inputs'],inputValues:output.inputValues,fills:[],backgrounds:[],priceLines:[],
    lines:output.lines as unknown as NonNullable<IndicatorModel['lines']>,
    boxes:output.boxes as unknown as NonNullable<IndicatorModel['boxes']>,
    labels:output.labels as unknown as NonNullable<IndicatorModel['labels']>,
    tables:output.tables as unknown as NonNullable<IndicatorModel['tables']>
  };
}
export class NativePineEngine implements ScriptingEngine {
  readonly language = 'deplyze-pine';
  readonly capabilities = {streaming:true,visibleRange:false,inputs:true};
  async prepare(source:string,instanceId:string):Promise<PreparedScript> {
    const parsed = await workerJob<{meta:Program['meta'];inputs:Program['inputs']}>(source).promise;
    const inputs=parsed.inputs.map(input=>({key:input.key,title:input.title,type:input.type,defval:input.defval,...(input.min!==undefined?{min:input.min}:{}),...(input.max!==undefined?{max:input.max}:{}),...(input.step!==undefined?{step:input.step}:{}),...(input.options?{options:input.options}:{}),...(input.group?{group:input.group}:{}),...(input.inline?{inline:input.inline}:{}),...(input.tooltip?{tooltip:input.tooltip}:{})}));
    return {language:this.language,inputs,meta:parsed.meta,reactsToViewport:false,token:{source,instanceId}};
  }
  execute(request:ExecutionRequest,handlers:ExecutionHandlers) {
    const {source,instanceId} = request.prepared.token as {source:string;instanceId:string};
    let stopped = false, revision = 0, pending = false;
    let worker:Worker | undefined;
    let timer:ReturnType<typeof setTimeout> | undefined;
    let scheduled:ReturnType<typeof setTimeout> | undefined;
    let inflight = false;
    let inputValues=request.inputs ?? {};
    const execute = () => {
      scheduled = undefined;
      if (stopped) return;
      if (inflight) {pending=true;return;}
      inflight=true;pending=false;
      const current=++revision;
      if (!worker) {
        worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
        worker.onmessage=event=>{
          if (stopped || event.data.revision!==revision) return;
          clearTimeout(timer);inflight=false;
          if (!pending) {
            if(event.data.ok) {handlers.onModel(toModel(instanceId,event.data.result));if(request.mode==='static')handlers.onDone?.();}
            else handlers.onError?.(new Error(event.data.error));
          }
          if(pending) schedule();
        };
        worker.onerror=event=>{clearTimeout(timer);inflight=false;worker?.terminate();worker=undefined;handlers.onError?.(new Error(event.message));};
      }
      timer=setTimeout(()=>{
        if(stopped || current!==revision)return;
        worker?.terminate();worker=undefined;inflight=false;
        handlers.onError?.(new Error('DeplyzeView runtime limit: Pine execution exceeded the five-second worker cap. The script may be valid Pine; reduce script complexity or history to fit this editor limit.'));
      },5000);
      worker.postMessage({source,bars:request.getBars?.() ?? request.bars,inputs:inputValues,isLive:request.mode==='live',revision:current});
    };
    const schedule = () => { if (!stopped && scheduled === undefined) scheduled = setTimeout(execute,50); };
    schedule();
    return {
      stop() { stopped = true; revision++; clearTimeout(scheduled);clearTimeout(timer);worker?.terminate(); },
      update(values:Record<string,string|number|boolean>) { inputValues={...inputValues,...values};schedule(); },notifyBars:schedule,setVisibleRange() {}
    };
  }
}
