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
test('worker timeout terminates execution and returns a recoverable error',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const original=globalThis.Worker;
  let terminated=false;
  globalThis.Worker=class {postMessage(){} terminate(){terminated=true;}};
  try {
    const job=workerJob('source');
    const rejected=assert.rejects(job.promise,/five seconds/);
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
