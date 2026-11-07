import type { ScriptingEngine, ExecutionRequest, ExecutionHandlers, PreparedScript, IndicatorModel } from '@luxalgo/vela';
import { timeframeSeconds, type Bar, type Output, type PineMarket, type Program } from './runtime.ts';

type SecondaryRequest = {timeframe:string;limit:number};
type PineToken = {source:string;instanceId:string;requests?:SecondaryRequest[];needsMintick?:boolean};
type FeedCache = {to:number;bars:Bar[]};
type MarketMetadata = {
  background:(market:ExecutionRequest['market'])=>string|undefined;
  mintick:(symbol:string)=>Promise<number|undefined>;
  fetchSeries?:(symbol:string)=>ExecutionRequest['fetchSeries'];
};

function isTransientMarketError(error:unknown):boolean {
  const message=error instanceof Error ? error.message : String(error);
  if(/not configured|provider.disabled/i.test(message))return false;
  return /\b(?:HTTP\s+(?:408|425|429|5\d\d)|timed?\s*out|timeout|network|failed to fetch|fetch failed|load failed|connection|error sending request|ECONN\w*|ETIMEDOUT|EAI_AGAIN)\b/i.test(message);
}

async function retryMarketRequest<T>(request:()=>Promise<T>,signal:AbortSignal):Promise<T> {
  let delay=1000;
  for(;;) {
    signal.throwIfAborted();
    try {
      const result=await request();
      signal.throwIfAborted();
      return result;
    } catch(error) {
      if(signal.aborted||!isTransientMarketError(error))throw error;
    }
    await new Promise<void>((resolve,reject)=>{
      const cancel=()=>{
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer=setTimeout(()=>{
        signal.removeEventListener('abort',cancel);
        resolve();
      },delay);
      signal.addEventListener('abort',cancel,{once:true});
    });
    delay=Math.min(delay*2,30000);
  }
}

async function secondaryBars(fetchSeries:NonNullable<ExecutionRequest['fetchSeries']>, symbol:string, timeframe:string, limit:number, to:number, cached?:FeedCache):Promise<Bar[]> {
  const interval=timeframeSeconds(timeframe)*1000;
  const latest=cached?.bars[cached.bars.length-1];
  if(cached&&to===cached.to)return cached.bars;
  if(latest&&to>cached!.to&&to-latest.time<1000*interval) {
    const tail=await fetchSeries(symbol,timeframe,{from:latest.time,to,limit:Math.ceil((to-latest.time)/interval)+1});
    return mergeBars(cached!.bars,tail,to,limit);
  }
  let cursor=to;
  const found:Bar[]=[];
  let emptyPages=0;
  for(let page=0;found.length<limit&&cursor>=0&&page<Math.ceil(limit/500)+8;page++) {
    const count=Math.min(1000,limit-found.length);
    const from=Math.max(0,cursor-count*interval+1);
    const data=await fetchSeries(symbol,timeframe,{from,to:cursor,limit:count});
    const chunk=data.filter(bar=>bar.time>=from&&bar.time<=cursor).sort((a,b)=>a.time-b.time);
    if(chunk.length) {
      found.push(...chunk);
      cursor=chunk[0].time-1;
      emptyPages=0;
    } else {
      cursor=from-1;
      if(++emptyPages===2)break;
    }
  }
  return mergeBars(found,[],to,limit);
}
function mergeBars(older:Bar[],newer:Bar[],to:number,limit:number):Bar[] {
  const bars=new Map<number,Bar>();
  for(const bar of [...older,...newer])if(bar.time<=to)bars.set(bar.time,bar);
  return [...bars.values()].sort((a,b)=>a.time-b.time).slice(-limit);
}

function oandaGoldQuoteTick(symbol:string,bars:Bar[]):number|undefined {
  if(symbol.toUpperCase()!=='OANDA:XAU_USD')return;
  // Older gateways can serve this instrument's midpoint candles without its directory metadata.
  let precision=0;
  for(const {open,high,low,close} of bars) {
    for(const price of [open,high,low,close]) {
      if(!Number.isFinite(price))continue;
      const decimals=/^\d+\.(\d+)$/.exec(String(price))?.[1].length??0;
      precision=Math.max(precision,decimals);
    }
  }
  if(precision>0)return 10 ** -precision;
}
function positiveTick(value:unknown):number|undefined {
  return typeof value==='number'&&Number.isFinite(value)&&value>0 ? value : undefined;
}

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
      const display=plot.dataWindowOnly ? {display:{pane:false,priceScale:false,legend:false,dataWindow:true}} : {};
      return {...base,...display,kind:'line' as const,points:plot.points.map(p=>({time:p.time,value:typeof p.value === 'number' ? p.value : null})),style:{color:plot.color,width:plot.width,lineStyle:'solid' as const}};
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
  private readonly marketMetadata?: MarketMetadata;
  constructor(marketMetadata?: MarketMetadata) { this.marketMetadata=marketMetadata; }
  async prepare(source:string,instanceId:string):Promise<PreparedScript> {
    const parsed = await workerJob<{meta:Program['meta'];inputs:Program['inputs'];requests?:SecondaryRequest[];needsMintick?:boolean}>(source).promise;
    const inputs=parsed.inputs.map(input=>({key:input.key,title:input.title,type:input.type,defval:input.defval,...(input.min!==undefined?{min:input.min}:{}),...(input.max!==undefined?{max:input.max}:{}),...(input.step!==undefined?{step:input.step}:{}),...(input.options?{options:input.options}:{}),...(input.group?{group:input.group}:{}),...(input.inline?{inline:input.inline}:{}),...(input.tooltip?{tooltip:input.tooltip}:{})}));
    return {language:this.language,inputs,meta:parsed.meta,reactsToViewport:false,token:{source,instanceId,requests:parsed.requests,needsMintick:parsed.needsMintick} satisfies PineToken};
  }
  execute(request:ExecutionRequest,handlers:ExecutionHandlers) {
    const {source,instanceId,requests=[],needsMintick} = request.prepared.token as PineToken;
    const limits=new Map<string,number>();
    for(const {timeframe,limit} of requests)limits.set(timeframe,Math.max(limit,limits.get(timeframe)??0));
    const secondary=new Map<string,FeedCache>();
    const controller=new AbortController();
    const {signal}=controller;
    const fetchSeries=request.market
      ? this.marketMetadata?.fetchSeries?.(request.market.symbol)??request.fetchSeries
      : request.fetchSeries;
    const emittedAlerts=new Map<string,number>();
    let previousAlertTime:number|undefined;
    let mintick=positiveTick(request.market?.symbolInfo?.mintick);
    let metadataError:string|undefined;
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
      const bars=request.getBars?.()??request.bars;
      const isLive=request.mode==='live';
      const duration=request.market ? timeframeSeconds(request.market.timeframe)*1000 : 0;
      const last=bars[bars.length-1]?.time;
      const post=(market?:PineMarket)=>{
        if(stopped||current!==revision)return;
      if (!worker) worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
        worker.onmessage=event=>{
          if (stopped || event.data.revision!==revision) return;
          clearTimeout(timer);inflight=false;
          if (!pending||limits.size) {
            if(event.data.ok) {
              const result=event.data.result as Output;
              handlers.onModel(toModel(instanceId,result));
              const alertTime=isLive&&last!==undefined ? last : undefined;
              if(previousAlertTime!==undefined&&alertTime!==undefined) {
                for(const alert of result.alerts??[]) {
                  const currentBar=alert.barIndex===bars.length-1&&alert.freq!=='once_per_bar_close';
                  if((alert.time>previousAlertTime||currentBar||alert.freq==='once_per_bar_close'&&alert.time===alertTime)&&!emittedAlerts.has(alert.id)) {
                    emittedAlerts.set(alert.id,alert.time);
                    handlers.onAlert?.({...alert,id:instanceId+':'+alert.id});
                  }
                }
              } else {
                for(const alert of result.alerts??[])if(alertTime!==undefined&&alert.time>=alertTime-duration)emittedAlerts.set(alert.id,alert.time);
              }
              if(alertTime!==undefined)for(const [id,time] of emittedAlerts)if(time<alertTime-duration)emittedAlerts.delete(id);
              previousAlertTime=alertTime;
              if(request.mode==='static')handlers.onDone?.();
            }
            else handlers.onError?.(new Error(event.data.error));
          }
          if(pending) schedule();
        };
        worker.onerror=event=>{
          if(stopped||current!==revision)return;
          clearTimeout(timer);inflight=false;worker?.terminate();worker=undefined;handlers.onError?.(new Error(event.message));
        };
      if(!limits.size) {
        timer=setTimeout(()=>{
          if(stopped || current!==revision)return;
          worker?.terminate();worker=undefined;inflight=false;
          handlers.onError?.(new Error('DeplyzeView runtime limit: Pine execution exceeded the five-second worker cap.'));
        },5000);
      }
      worker.postMessage({source,bars,inputs:inputValues,isLive,revision:current,market});
      };
      const market=request.market;
      if(!market){post();return;}
      const context:PineMarket={
        symbol:market.symbol,timeframe:market.timeframe,
        mintick:mintick??(needsMintick&&!this.marketMetadata ? oandaGoldQuoteTick(market.symbol,bars) : undefined),
        background:this.marketMetadata?.background(market),
        standard:!market.chartStyle||!['heikinashi','renko','kagi','linebreak','pnf','range'].includes(market.chartStyle),
      };
      if((!limits.size||last===undefined)&&(!needsMintick||mintick||!this.marketMetadata)){post(context);return;}
      void (async()=>{
        const quoteTick=needsMintick&&!mintick ? oandaGoldQuoteTick(market.symbol,bars) : undefined;
        const loadMintick=async()=>{
          if(!needsMintick||mintick||!this.marketMetadata)return;
          const read=()=>this.marketMetadata!.mintick(market.symbol);
          try {
            const value=limits.size&&!quoteTick ? await retryMarketRequest(read,signal) : await read();
            mintick=positiveTick(value);metadataError=undefined;
          }
          catch(error){metadataError=error instanceof Error?error.message:String(error);}
        };
        const series:Record<string,Bar[]>={}, seriesErrors:Record<string,string>={};
        await Promise.all([loadMintick(),...Array.from(limits,async([timeframe,limit])=>{
          if(last===undefined||!fetchSeries||!context.standard)return;
          const interval=timeframeSeconds(timeframe)*1000;
          const horizon=last+(isLive?0:duration);
          // Fetch only candles whose full interval is behind the chart's cutoff.
          // A one-second margin accommodates providers with exclusive end times.
          const to=horizon-interval+999;
          try {
            const candles=await secondaryBars(
              (symbol,tf,range)=>retryMarketRequest(()=>fetchSeries(symbol,tf,range),signal),
              market.symbol,timeframe,limit,to,secondary.get(timeframe)
            );
            if(candles.length){secondary.set(timeframe,{to,bars:candles});series[timeframe]=candles;}
          } catch(error){seriesErrors[timeframe]=error instanceof Error?error.message:String(error);}
        })]);
        if(needsMintick&&!mintick&&!quoteTick&&metadataError)throw new Error('Could not load the minimum price tick for '+market.symbol+'. '+metadataError);
        post({...context,mintick:mintick??quoteTick,series,seriesErrors});
      })().catch(error=>{
        if(stopped||current!==revision)return;
        inflight=false;handlers.onError?.(error instanceof Error?error:new Error(String(error)));
        if(pending)schedule();
      });
    };
    const schedule = () => { if (!stopped && scheduled === undefined) scheduled = setTimeout(execute,50); };
    schedule();
    return {
      stop() { stopped = true; revision++; controller.abort();clearTimeout(scheduled);clearTimeout(timer);worker?.terminate(); },
      update(values:Record<string,string|number|boolean>) { inputValues={...inputValues,...values};schedule(); },notifyBars:schedule,setVisibleRange() {}
    };
  }
}
