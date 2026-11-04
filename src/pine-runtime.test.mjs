import test from 'node:test';
import assert from 'node:assert/strict';
import { compile,evaluate,RuntimeSession } from './pine/runtime.ts';
import { readLibrary,writeLibrary } from './pine/library.ts';
const bars = values => values.map((close,i)=>({time:i+1,open:close,high:close+1,low:close-1,close,volume:100}));
const run = (body,values=[1,2,3,4,5]) => evaluate(compile('//@version=5\nindicator("Test", overlay=true)\n'+body),bars(values)).plots[0].points.map(p=>p.value);
test('TA reference values and warm-up',()=>{
  assert.deepEqual(run('plot(ta.sma(close, 3))'),[null,null,2,3,4]);
  assert.deepEqual(run('plot(ta.ema(close, 3))'),[1,1.5,2.25,3.125,4.0625]);
  assert.deepEqual(run('plot(ta.atr(3))'),[null,null,2,2,2]);
  assert.deepEqual(run('plot(ta.rsi(close, 3))'),[null,null,null,100,100]);
  assert.deepEqual(run('plot(ta.rsi(close, 2))',[5,4,3,2]),[null,null,0,0]);
});
test('history, persistence, reassignment and if blocks',()=>{
  assert.deepEqual(run('var float total = 0\nif close > 2\n    total := total + close\nplot(total)'),[0,0,3,7,12]);
  assert.deepEqual(run('previous = close[1]\nplot(previous)'),[null,1,2,3,4]);
});
test('crosses use inclusive prior comparison',()=>{
  assert.deepEqual(run('cross = ta.crossover(close, 2)\nplotshape(cross)',[1,2,3,2,3]),[false,false,true,false,true]);
});
test('unsupported functions, arguments, types and conditional TA fail compilation',()=>{
  for(const body of ['plot(request.security("X","D",close))','plot(close, offset=1)','plot("bad")','if close > 1\n    x = ta.ema(close, 2)\nplot(close)','length=close\nplot(ta.sma(close,length))','plot(close[-1])']){
    assert.throws(()=>compile('//@version=5\nindicator("Test")\n'+body));
  }
});
test('saved library survives round trip and surfaces corruption/write failures',()=>{
  let raw=null;const storage={getItem:()=>raw,setItem:(_,v)=>{raw=v;}};
  const scripts=[{id:'one',name:'Test',source:'code',updatedAt:'2026-11-03'}];
  writeLibrary(storage,scripts);assert.deepEqual(readLibrary(storage),scripts);
  raw='bad';assert.throws(()=>readLibrary(storage));
  assert.throws(()=>writeLibrary({setItem(){throw new Error('quota');}},scripts),/quota/);
});

test('incremental updates match fresh replay after ticks, append, correction and backfill',()=>{
  const program=compile('//@version=5\nindicator("Incremental")\nvar float total=0\ntotal := total + close\nplot(ta.ema(total,3))\nplot(ta.rsi(close,2))');
  const session=new RuntimeSession(program);
  for(const values of [[1,2,3],[1,2,4],[1,2,4,5],[1,3,4,5],[0,1,3,4,5],[9,8]]) {
    const data=bars(values);
    assert.deepEqual(session.run(data),evaluate(program,data));
  }
});
test('plots capture values at the plot statement',()=>{
  assert.deepEqual(run('value=close\nplot(value)\nvalue := 0'),[1,2,3,4,5]);
});
test('record constructors use bar defaults and aliases preserve mutations',()=>{
  assert.deepEqual(run('type pivot\n    float level = close\n    bool crossed = false\nvar pivot swing = pivot.new()\nalias = swing\nalias.level := alias.level + close\nplot(swing.level)'),[2,4,7,11,16]);
});

test('typed arrays retain mutable state and support common Pine array operations',()=>{
  const program=compile('//@version=5\nindicator("Arrays")\nvar array<float> values = array.new<float>()\nvalues.push(close)\nlast = values.get(values.size()-1)\nplot(last)');
  assert.deepEqual(evaluate(program,bars([2,4,8])).plots[0].points.map(p=>p.value),[2,4,8]);
  assert.throws(()=>compile('//@version=5\nindicator("Bad array")\nvalues.push(1)\nplot(close)'),/array/);
});

test('for loops execute inclusive ranges and destructured array iteration with scoped indices',()=>{
  assert.deepEqual(run('sum = 0\nfor i = 1 to 5 by 2\n    sum := sum + i\nplot(sum)'),[9,9,9,9,9]);
  assert.deepEqual(run('var array<float> values = array.new<float>()\nvalues.push(2)\nvalues.push(3)\nsum = 0\nfor [i, value] in values\n    sum := sum + value\nplot(sum)'),[5,10,15,20,25]);
  assert.deepEqual(run('i = 99\nfor i = 1 to 2\n    i := i + 10\nplot(i)'),[99,99,99,99,99]);
});

test('user-defined typed functions evaluate results and restore parameter bindings',()=>{
  assert.deepEqual(run('bump(int amount) => amount + 1\nclassify(float value) => value > 2\nplot(bump(close))'),[2,3,4,5,6]);
  const source='//@version=5\nindicator("Functions", overlay=true)\npositive(float value) => value > 0\nplotshape(positive(close))';
  assert.deepEqual(evaluate(compile(source),bars([1,-1,3])).plots[0].points.map(p=>p.value),[true,false,true]);
});

test('dynamic series-history offsets evaluate a user-function parameter',()=>{
  assert.deepEqual(run('prior(int length) => close[length]\nplot(prior(2))'),[null,null,1,2,3]);
});

test('Pine input declarations produce editable schemas and runtime overrides',()=>{
  const source='//@version=5\nindicator("Settings")\nlength=input.int(2,"Length",minval=1,maxval=10,group="Signal")\nfactor=input.float(1.5,"Factor",minval=0.0,maxval=10.0,step=0.1)\nshow=input.bool(true,"Show")\nmode=input.string("Close","Mode",options=["Close","Open"])\nplot(ta.sma(close,length)*factor)';
  const program=compile(source);
  assert.deepEqual(program.inputs.map(({key,title,type,defval,group,options})=>({key,title,type,defval,group,options})),[
    {key:'length',title:'Length',type:'int',defval:2,group:'Signal',options:undefined},
    {key:'factor',title:'Factor',type:'float',defval:1.5,group:undefined,options:undefined},
    {key:'show',title:'Show',type:'bool',defval:true,group:undefined,options:undefined},
    {key:'mode',title:'Mode',type:'string',defval:'Close',group:undefined,options:['Close','Open']}
  ]);
  const output=new RuntimeSession(program).run(bars([1,2,3,4]),{length:3,factor:2,show:false,mode:'Open'});
  assert.deepEqual(output.plots[0].points.map(point=>point.value),[null,null,4,6]);
  assert.deepEqual(output.inputValues,{length:3,factor:2,show:false,mode:'Open'});
});

test('drawing handles create, update, render, and delete Pine labels',()=>{
  const source='//@version=5\nindicator("Drawings", overlay=true)\nvar label marker = label.new(na,na,"mark",xloc=xloc.bar_time)\nmarker.set_point(chart.point.new(time,na,close))\nplot(close)';
  const output=evaluate(compile(source),bars([4,6]));
  assert.equal(output.labels.length,1);
  assert.equal(output.labels[0].x,2);
  assert.equal(output.labels[0].y,6);
  assert.equal(output.labels[0].text,'mark');
  const removed=compile('//@version=5\nindicator("Remove", overlay=true)\nvar label marker = label.new(na,na)\nmarker.delete()\nplot(close)');
  assert.equal(evaluate(removed,bars([1])).labels.length,0);
});
test('drawing registry retains overwritten function labels and renders named time-based boxes',()=>{
  const labelSource='//@version=5\nindicator("Persistent drawings",overlay=true)\nemit() => label.new(bar_index,close,"mark")\nemit()\nplot(close)';
  const labels=evaluate(compile(labelSource),bars([4,6,8])).labels;
  assert.equal(labels.length,3);
  assert.deepEqual(labels.map(label=>label.x),[0,1,2]);
  const boxSource='//@version=5\nindicator("Named box",overlay=true)\nvar box region=box.new(na,na,na,na,xloc=xloc.bar_time,extend=extend.right)\nregion.set_top_left_point(chart.point.new(time,na,high))\nregion.set_bottom_right_point(chart.point.new(last_bar_time,na,low))\nplot(close)';
  const boxes=evaluate(compile(boxSource),bars([4,6])).boxes;
  assert.equal(boxes.length,1);
  assert.equal(boxes[0].xloc,'bar_time');
  assert.equal(boxes[0].extend,'right');
  assert.equal(boxes[0].left,2);
  assert.equal(boxes[0].right,2);
});
