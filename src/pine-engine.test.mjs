import test from 'node:test';
import assert from 'node:assert/strict';
import { NativePineEngine, toModel, workerJob } from './pine/engine.ts';
import {compile,evaluate} from './pine/runtime.ts';
test('adapter produces overlay and oscillator models with stable series identifiers',()=>{
  for(const overlay of [true,false]) {
    const output=evaluate(compile('//@version=5\nindicator("Test",overlay='+overlay+')\nplot(close)\nhline(2)'),[{time:1,open:1,high:2,low:0,close:1}]);
    const model=toModel('test',output);
    assert.equal(model.paneHint,overlay?'price':'new');
    assert.equal(model.series[0].id,'test:0');assert.deepEqual(model.series[0].points,[{time:1,value:1}]);
  }
});
test('adapter exposes Pine inputs as editable chart settings',async()=>{
  const source='//@version=5\nindicator("Settings")\nlength=input.int(2,"Length",minval=1,maxval=20,group="Signal")\nplot(ta.sma(close,length))';
  const original=globalThis.Worker;
  globalThis.Worker=class {onmessage;postMessage(){const program=compile(source);queueMicrotask(()=>this.onmessage({data:{ok:true,result:{meta:program.meta,inputs:program.inputs}}}));}terminate(){}};
  try {
    const prepared=await new NativePineEngine().prepare(source,'settings');
    assert.equal(prepared.inputs.length,1);
    assert.deepEqual(prepared.inputs[0],{key:'length',title:'Length',type:'int',defval:2,min:1,max:20,group:'Signal'});
    const output=evaluate(compile(source),[{time:1,open:1,high:2,low:0,close:1}],undefined,undefined,{length:4});
    const model=toModel('settings',output);
    assert.equal(model.inputs[0].key,'length');
    assert.equal(model.inputValues.length,4);
  } finally {globalThis.Worker=original;}
});
test('adapter forwards native Pine tables to the chart model',()=>{
  const source='//@version=5\nindicator("Table",overlay=true)\nvar table panel=table.new(position.top_right,1,1)\nif barstate.islast\n    table.cell(panel,0,0,"RANGE",text_color=color.white,bgcolor=color.new(color.gray,25),text_size=size.tiny)\nplot(close)';
  const output=evaluate(compile(source),[{time:1,open:1,high:2,low:0,close:1}]);
  const model=toModel('table',output);
  assert.equal(model.tables.length,1);
  assert.equal(model.tables[0].position,'top_right');
  assert.equal(model.tables[0].cells[0][0].text,'RANGE');
  assert.equal(model.tables[0].cells[0][0].bgColor,'#787B86bf');
});
test('worker timeout terminates execution and returns a recoverable error',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const original=globalThis.Worker;
  let terminated=false;
  globalThis.Worker=class {postMessage(){} terminate(){terminated=true;}};
  try {
    const job=workerJob('source');
    const rejected=assert.rejects(job.promise,/runtime limit:.*five-second worker cap/);
    t.mock.timers.tick(5000);await rejected;assert.equal(terminated,true);
  } finally {globalThis.Worker=original;}
});
test('engine coalesces updates and ignores responses after removal',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const original=globalThis.Worker, workers=[], models=[];
  globalThis.Worker=class {
    requests=[];terminated=false;
    constructor(){workers.push(this);}
    postMessage(value){this.requests.push(value);}
    terminate(){this.terminated=true;}
  };
  try{
    const engine=new NativePineEngine();
    let bars=[{time:1,open:1,high:2,low:0,close:1}];
    const source='//@version=5\nindicator("Test")\nplot(close)';
    const session=engine.execute({prepared:{token:{source,instanceId:'test'}},bars,getBars:()=>bars,mode:'live'},{onModel:m=>models.push(m)});
    t.mock.timers.tick(50);
    session.notifyBars();session.notifyBars();t.mock.timers.tick(50);
    const worker=workers[0];
    assert.equal(worker.requests[0].isLive,true);
    worker.onmessage({data:{ok:true,revision:1,result:evaluate(compile(source),bars)}});
    assert.equal(models.length,0);
    bars=[{...bars[0],close:2}];t.mock.timers.tick(50);
    assert.equal(worker.requests.length,2);
    worker.onmessage({data:{ok:true,revision:2,result:evaluate(compile(source),bars)}});
    assert.equal(models[0].series[0].points[0].value,2);
    session.stop();
    worker.onmessage({data:{ok:true,revision:2,result:evaluate(compile(source),bars)}});
    assert.equal(models.length,1);assert.equal(worker.terminated,true);
  }finally{globalThis.Worker=original;}
});
test('engine fetches secondary candles and sends data-window-only output through the worker',async()=>{
  const source='//@version=5\nindicator("Secondary", overlay=true)\nplot(request.security(syminfo.tickerid, "60", close[1], lookahead=barmerge.lookahead_on, calc_bars_count=2), display=display.data_window)';
  const program=compile(source);
  const original=globalThis.Worker;
  const hour=3_600_000, base=Date.UTC(2026,0,1);
  const candle=(time,close)=>({time,open:close,high:close,low:close,close});
  const history=[candle(base,10),candle(base+hour,20),candle(base+2*hour,999)];
  const chart=[candle(base+2*hour,1),candle(base+2.25*hour,1)];
  const fetched=[];
  globalThis.Worker=class {
    postMessage({bars,inputs,isLive,market,revision}) {
      const result=bars ? evaluate(program,bars,undefined,undefined,inputs,isLive,market) : {
        meta:program.meta,inputs:program.inputs,requests:[...program.requests.values()],
      };
      queueMicrotask(()=>this.onmessage({data:{ok:true,revision,result}}));
    }
    terminate(){}
  };
  let session;
  try {
    const engine=new NativePineEngine();
    const prepared=await engine.prepare(source,'secondary');
    const model=await new Promise((resolve,reject)=>{
      session=engine.execute({
        prepared,market:{symbol:'TEST:TEST',timeframe:'15'},bars:chart,mode:'static',
        fetchSeries:async(symbol,timeframe,range)=>{
          fetched.push({symbol,timeframe,range});
          return history.filter(bar=>bar.time>=range.from&&bar.time<=range.to);
        },
      },{onModel:resolve,onError:reject});
    });
    assert.equal(fetched[0].timeframe,'60');
    assert.equal(fetched[0].symbol,'TEST:TEST');
    assert.deepEqual(model.series[0].display,{pane:false,priceScale:false,legend:false,dataWindow:true});
    assert.deepEqual(model.series[0].points.map(point=>point.value),[20,20]);
  } finally {session?.stop();globalThis.Worker=original;}
});
test('multi-timeframe runs retry failed history pages and have no worker deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const original=globalThis.Worker;
  const hour=3_600_000, start=Date.UTC(2026,0,1);
  const bar={time:start,open:20,high:20,low:20,close:20};
  const bars=[{...bar,time:start+hour}];
  const source='//@version=5\nindicator("Slow data")\nplot(request.security(syminfo.tickerid, "60", close[1], lookahead=barmerge.lookahead_on, calc_bars_count=1))';
  const program=compile(source);
  const models=[],errors=[];
  let attempts=0,worker,posted;
  globalThis.Worker=class {
    terminated=false;
    constructor(){worker=this;}
    postMessage(data){posted=data;}
    terminate(){this.terminated=true;}
  };
  const engine=new NativePineEngine({
    background:()=>undefined,mintick:async()=>undefined,
    fetchSeries:()=>async()=>{
      if(++attempts<=2)throw new Error(attempts===1?'Market-data gateway connection failed or timed out':'Gateway HTTP 503: upstream unavailable');
      return [bar];
    }
  });
  const session=engine.execute({
    prepared:{token:{source,instanceId:'slow',requests:[{timeframe:'60',limit:1}]}},
    market:{symbol:'TEST:TEST',timeframe:'15'},bars,mode:'static',
  },{onModel:model=>models.push(model),onError:error=>errors.push(error)});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  try {
    t.mock.timers.tick(50);await flush();
    assert.equal(attempts,1);
    t.mock.timers.tick(1000);await flush();
    assert.equal(attempts,2);
    t.mock.timers.tick(2000);await flush();
    assert.equal(attempts,3);
    assert.ok(posted);
    t.mock.timers.tick(120_000);
    assert.equal(worker.terminated,false);
    assert.deepEqual(errors,[]);
    worker.onmessage({data:{ok:true,revision:posted.revision,result:evaluate(program,bars,undefined,undefined,{},false,posted.market)}});
    assert.equal(models[0].series[0].points[0].value,20);
  } finally {session.stop();globalThis.Worker=original;}
});
test('stopping a multi-timeframe run cancels its pending history retry',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const original=globalThis.Worker;
  let attempts=0,workers=0;
  globalThis.Worker=class {constructor(){workers++;}};
  const session=new NativePineEngine().execute({
    prepared:{token:{source:'',instanceId:'cancel',requests:[{timeframe:'60',limit:1}]}},
    market:{symbol:'TEST:TEST',timeframe:'15'},bars:[{time:Date.UTC(2026,0,1)}],mode:'static',
    fetchSeries:async()=>{attempts++;throw new Error('Network error');},
  },{onModel:()=>assert.fail('Run was stopped'),onError:()=>assert.fail('Run was stopped')});
  try {
    t.mock.timers.tick(50);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(attempts,1);
    session.stop();
    t.mock.timers.tick(120_000);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(attempts,1);
    assert.equal(workers,0);
  } finally {session.stop();globalThis.Worker=original;}
});
test('OANDA gold with missing directory precision still draws rounded price zones',async()=>{
  const source=`//@version=5
indicator("Gold zone", overlay=true)
bottom = math.floor(close / syminfo.mintick) * syminfo.mintick
box.new(left=time, top=bottom + 1, right=time_close, bottom=bottom, xloc=xloc.bar_time)
plot(syminfo.mintick)`;
  const program=compile(source);
  const original=globalThis.Worker;
  const bars=[{time:Date.UTC(2026,10,6),open:4067.12,high:4068.55,low:4066.5,close:4067.685}];
  globalThis.Worker=class {
    postMessage(data) {
      const result=evaluate(program,data.bars,undefined,undefined,data.inputs,data.isLive,data.market);
      queueMicrotask(()=>this.onmessage({data:{ok:true,revision:data.revision,result}}));
    }
    terminate(){}
  };
  try {
    const engine=new NativePineEngine({background:()=>undefined,mintick:async()=>undefined});
    const run=async symbolInfo=>{
      let session;
      try {
        return await new Promise((resolve,reject)=>{
          session=engine.execute({
            prepared:{token:{source,instanceId:'gold',needsMintick:true}},
            market:{symbol:'OANDA:XAU_USD',timeframe:'240',symbolInfo},bars,mode:'static',
          },{onModel:resolve,onError:reject});
        });
      } finally {session?.stop();}
    };
    const inferred=await run({ticker:'XAU_USD'});
    assert.equal(inferred.series[0].points[0].value,.001);
    assert.equal(inferred.boxes.length,1);
    assert.ok(Math.abs(inferred.boxes[0].bottom-4067.685)<1e-9);
    assert.equal((await run({ticker:'XAU_USD',mintick:.01})).series[0].points[0].value,.01);
    assert.throws(()=>evaluate(program,bars,undefined,undefined,{},false,{symbol:'OANDA:XAU_USD',timeframe:'240'}),/Minimum price tick is unavailable/);
  } finally {globalThis.Worker=original;}
});
