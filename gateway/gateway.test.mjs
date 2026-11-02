import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { configuration } from './config.mjs';
import { Providers, Cache, candle, canonical, uniqueBars } from './providers.mjs';
import { createGateway, authenticated } from './server.mjs';

const token = 'test-application-token-with-32-characters';
const config = () => configuration({ MARKET_DATA_APP_TOKENS: token, OANDA_API_TOKEN:'provider-secret', OANDA_ACCOUNT_ID:'account', NARWHAL_API_KEY:'narwhal-secret' });
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type':'application/json' } });
const from = Date.parse('2026-10-01T00:00:00Z'), to = from + 86_400_000;
const row = { timestamp:'2026-10-01T00:00:00Z', open:'100', high:'103', low:'99', close:'101' };

test('startup fails closed on missing, partial or invalid configuration', () => {
  assert.throws(() => configuration({}), /MARKET_DATA_APP_TOKENS/);
  assert.throws(() => configuration({ MARKET_DATA_APP_TOKENS:token }), /OANDA_API_TOKEN/);
  assert.throws(() => configuration({ MARKET_DATA_APP_TOKENS:'short' }), /32/);
  assert.throws(() => configuration({ MARKET_DATA_APP_TOKENS:token, MARKET_DATA_PROVIDERS:'finzdata' }), /FINZDATA_API_KEY/);
  assert.equal(configuration({ MARKET_DATA_APP_TOKENS:token, MARKET_DATA_PROVIDERS:'narwhal', NARWHAL_API_KEY:'key' }).plan, 'free');
});
test('application authentication is separate from provider credentials', () => {
  assert.equal(authenticated(`Bearer ${token}`, [token]), true);
  for (const candidate of [undefined, '', 'Bearer provider-secret', `Basic ${token}`]) assert.equal(authenticated(candidate, [token]), false);
});
test('normalization rejects invalid data and preserves absent volume and negative futures prices', () => {
  assert.equal(candle(row, {}).volume, null);
  assert.equal(candle({ ...row, open:-10, high:-5, low:-12, close:-9 }, {}).close, -9);
  for (const bad of [{ ...row, high:90 }, { ...row, open:null }, { ...row, close:'NaN' }, { ...row, timestamp:'invalid' }, { ...row, timestamp:'2026-10-01T00:00:00' }]) assert.throws(() => candle(bad, {}));
  assert.equal(canonical('oanda', 'eur/usd'), 'EUR_USD');
  assert.throws(() => canonical('narwhal', '../GC'));
  assert.deepEqual(uniqueBars([{time:2},{time:1,close:1},{time:1,close:2},{time:3}], 1,2,10), [{time:1,close:2},{time:2}]);
});
test('cache coalesces simultaneous requests, retries failed loads and bounds entries', async () => {
  const cache = new Cache(); let calls = 0;
  const loader = async () => { calls++; return 42; };
  assert.deepEqual(await Promise.all([cache.get('a',1000,loader), cache.get('a',1000,loader)]), [42,42]);
  assert.equal(calls,1);
  await assert.rejects(cache.get('bad',1000,() => { throw new Error('outage'); }));
  assert.equal(await cache.get('bad',1000,loader),42);
  for (let i=0;i<300;i++) await cache.get(`key${i}`,1000,loader);
  assert.equal(cache.values.size,256);
});
test('OANDA account discovery, authorization, UTC midpoint candles and weekend completion', async () => {
  const urls = [];
  const p = new Providers(config(), async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization,'Bearer provider-secret');
    if (url.endsWith('/instruments')) return response({ instruments:[{ name:'EUR_USD', type:'CURRENCY', displayPrecision:5 }, { name:'XAU_USD',type:'METAL',displayPrecision:3 }, { name:'SPX500_USD',type:'CFD',displayPrecision:1 }] });
    const query = new URL(url).searchParams;
    assert.equal(query.get('price'),'M'); assert.equal(query.get('alignmentTimezone'),'UTC');
    assert.equal(query.has('to'),false);
    return response({ candles:[{time:row.timestamp, mid:{o:'100',h:'103',l:'99',c:'101'},volume:17,complete:true}] });
  });
  const directory = await p.instruments('oanda');
  assert.equal(directory[0].instrumentType,'spot_forex');
  assert.equal(directory[1].instrumentType,'cfd');
  const data = await p.bars('oanda','EUR/USD','15',from,to,500);
  assert.equal(data.bars.length,1); assert.equal(data.bars[0].tickCount,17); assert.equal(data.bars[0].volume,null);
  assert.equal(urls.length,2); // A short final page must not loop on weekends.
  await assert.rejects(p.bars('oanda','EUR_JPY','15',from,to,500), /does not list/);
  await assert.rejects(p.bars('oanda','EUR_USD','7',from,to,500), /timeframe/);
});
test('Narwhal cursors preserve raw front-month series and delayed freshness', async () => {
  const paths = [];
  const p = new Providers(config(), async url => {
    const u = new URL(url); paths.push(u.pathname);
    if (u.pathname === '/v1/futures') return response({futures:[{id:'GC',exchange:'COMEX',category:'metals',currency:'USD'}]});
    if (u.pathname.endsWith('/price')) return response({ price:'101',timestamp:row.timestamp,delayed:true,stale:false,market_session:'open' });
    return response({ bars:[row], next_cursor:u.searchParams.has('cursor') ? null : 'page2' });
  });
  // Remove scheduler waits in this protocol test; production rate pacing remains active.
  const original = p.request.bind(p); p.request = (...args) => { p.nextRequest = {}; return original(...args); };
  const data = await p.bars('narwhal','GC','1D',from,to,500);
  assert.equal(data.bars.length,1); assert.equal(data.instrument.instrumentType,'continuous_futures');
  assert.equal(data.instrument.contractExpiry,null); assert.equal(data.bars[0].volume,null);
  assert.equal(paths.filter(path => path.endsWith('/bars')).length,2);
  const quote = await p.quote('narwhal','GC');
  assert.equal(quote.delayMs,900000); assert.equal(quote.freshness,'delayed');
  await assert.rejects(p.bars('narwhal','GC','15',from,to,500), /paid plan/);
  await assert.rejects(p.bars('narwhal','GCZ26','1D',from,to,500), /does not list/);
});
test('OANDA gold discovery verifies candle access when the account directory omits it', async () => {
  const p = new Providers(config(), async url => url.endsWith('/instruments')
    ? response({instruments:[{name:'EUR_USD',type:'CURRENCY',displayPrecision:5}]})
    : response({instrument:'XAU_USD',candles:[{time:row.timestamp,mid:{o:'2500',h:'2510',l:'2490',c:'2505'},volume:17,complete:true}]}));
  p.pace=async()=>{};
  const gold=(await p.instruments('oanda')).find(i=>i.symbol==='XAU_USD');
  assert.equal(gold?.assetClass,'metals');
  assert.equal(gold?.instrumentType,'cfd');
  assert.equal(gold?.marketDataAccess,'verified_candles');
  assert.equal(canonical('oanda','XAUUSD'),'XAU_USD');
  assert.equal((await p.instrument('oanda','XAU/USD')).symbol,'XAU_USD');
  const bars=await p.bars('oanda','XAUUSD','15',from,to,500);
  assert.equal(bars.bars[0].provider,'oanda');
  assert.equal(bars.bars[0].symbol,'XAU_USD');
  assert.equal(bars.bars[0].volume,null);
});
test('denied OANDA gold access does not add a fake instrument or break forex', async () => {
  const p=new Providers(config(),async url=>url.endsWith('/instruments')
    ? response({instruments:[{name:'EUR_USD',type:'CURRENCY',displayPrecision:5}]})
    : new Response('',{status:403}));
  p.pace=async()=>{};
  assert.deepEqual((await p.instruments('oanda')).map(i=>i.symbol),['EUR_USD']);
  await assert.rejects(p.instrument('oanda','XAUUSD'),/does not list/);
});
test('OANDA pagination excludes the exact boundary without skipping a candle', async () => {
  const p = new Providers(config(), async url => {
    if (url.endsWith('/instruments')) return response({instruments:[{name:'EUR_USD',type:'CURRENCY',displayPrecision:5}]});
    const query=new URL(url).searchParams;
    const offset=query.get('includeFirst') === 'true' ? 0 : 5000;
    if (offset) assert.equal(Date.parse(query.get('from')),from+4999*60_000);
    const count=offset ? 1 : 5000;
    return response({candles:Array.from({length:count},(_,i)=>({time:new Date(from+(offset+i)*60_000).toISOString(),mid:{o:'1',h:'2',l:'0.5',c:'1.5'},volume:1,complete:true}))});
  });
  p.pace=async()=>{};
  const data=await p.bars('oanda','EUR_USD','1',from,from+5001*60_000,1500);
  assert.equal(data.bars.length,1500);
  assert.equal(data.bars.at(-1).time,from+5000*60_000);
});
test('Narwhal repeated cursors cannot loop or return silently truncated history', async () => {
  const p = new Providers(config(),async url => url.endsWith('/futures') ? response({futures:[{id:'GC',exchange:'COMEX'}]}) : response({bars:[row],next_cursor:'same'}));
  p.pace=async()=>{};
  await assert.rejects(p.bars('narwhal','GC','1D',from,to,500),/cursor repeated/);
});
test('upstream authentication and rate limits fail explicitly without retry storms or leaked bodies', async () => {
  for (const status of [401,403,404,429]) {
    let calls=0;
    const p = new Providers(config(), async () => { calls++; return new Response('sensitive upstream detail',{status,headers:{'retry-after':'60'}}); });
    await assert.rejects(p.request('oanda','/test'), error => error.status === status && !error.message.includes('sensitive'));
    assert.equal(calls,1);
    if (status === 429) {
      await assert.rejects(p.request('oanda','/test'), error => error.status === 429);
      assert.equal(calls,1);
    }
  }
});
test('FinzData keeps individual expiry, raw prices, volume and open interest without continuous substitution', async () => {
  const c = { ...config(), enabled:['finzdata'], finzdataKey:'finz-secret' };
  let mismatch=false;
  const p = new Providers(c, async (url, options) => {
    assert.equal(options.headers['X-API-Key'],'finz-secret'); assert.equal(options.headers.Authorization,undefined);
    if (url.includes('/roots')) return response({data:[{root:'ES',exchange:'CME'}]});
    if (url.includes('/contracts')) return response({data:[{contract:'ESZ26',expiry:'2026-12-18'}]});
    if (url.includes('/rolls')) return response({data:[{contract:'ESZ26',expiry:'2026-12-18',status:'current, next roll estimated',roll_date:'2026-12-15',next_contract:'ESH27'}]});
    const query=new URL(url).searchParams;
    assert.equal(query.get('contract'),'ESZ26'); assert.equal(query.get('continuous'),'false'); assert.equal(query.get('adjust'),'none');
    return response({data:[{...row,date:'2026-10-01T00:00:00',contract:mismatch?'ESH27':'ESZ26',volume:100,open_interest:200}]});
  });
  const original=p.request.bind(p); p.request=(...args)=>{p.nextRequest={}; return original(...args);};
  const data=await p.bars('finzdata','ES.ESZ26','1D',from,to,500);
  assert.equal(data.instrument.instrumentType,'exchange_futures'); assert.equal(data.instrument.contractExpiry,'2026-12-18');
  assert.equal(data.bars[0].volume,100); assert.equal(data.bars[0].openInterest,200);
  assert.equal(data.delivery,'historical_only');
  await assert.rejects(p.bars('finzdata','ES','1D',from,to,500),/individual contract/);
  await assert.rejects(p.bars('finzdata','ES.ESZ26','60',from,to,500),/daily/);
  mismatch=true;
  await assert.rejects(p.bars('finzdata','ES.ESZ26','1D',from,to,500),/another contract/);
});
test('bounded upstream retry recovers a temporary provider failure', async () => {
  let calls=0;
  const p = new Providers(config(), async () => ++calls === 1 ? new Response('',{status:503}) : response({ok:true}));
  assert.deepEqual(await p.request('oanda','/test'),{ok:true});
  assert.equal(calls,2); assert.equal(p.health.oanda.status,'ok');
});
test('HTTP gateway rejects unauthorized requests and writes only safe structured logs', async t => {
  const logs=[];
  const p = new Providers(config(), async () => response({futures:[{id:'GC',exchange:'COMEX',category:'metals',currency:'USD'}]}));
  const server=createGateway(config(),p,line => logs.push(line)); server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => { server.shutdown(); server.closeAllConnections(); });
  const base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base+'/v1/narwhal/instruments')).status,401);
  const headers={Authorization:`Bearer ${token}`};
  const instruments=await fetch(base+'/v1/narwhal/instruments',{headers});
  assert.equal(instruments.status,200); assert.equal((await instruments.json())[0].symbol,'GC');
  assert.equal((await fetch(base+'/v1/narwhal/instrument?symbol=GC',{headers})).status,200);
  assert.equal((await fetch(base+'/v1/narwhal/bars?symbol=GC&from=-1',{headers})).status,400);
  assert.equal((await fetch(base+'/v1/narwhal/instruments',{headers,method:'POST'})).status,405);
  assert.equal((await fetch(base+'/v1/health',{headers})).status,200);
  assert.ok(logs.every(line => !line.includes(token) && !line.includes('secret') && !line.includes('Authorization')));
});
test('OANDA SSE uses provider timestamps and bid/ask quotes, never synthetic trades or candles', async t => {
  const encoder=new TextEncoder(); let cancelled=false;
  const p=new Providers(config(), async url => {
    if (url.includes('/pricing/stream')) return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({type:'PRICE',time:row.timestamp,status:'tradeable',bids:[{price:'100'}],asks:[{price:'102'}]})+'\n'));
    }, cancel() { cancelled=true; } }));
    return response({instruments:[{name:'EUR_USD',type:'CURRENCY',displayPrecision:5}]});
  });
  const server=createGateway(config(),p,()=>{}); server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => { server.shutdown(); server.closeAllConnections(); });
  const controller=new AbortController();
  const r=await fetch(`http://127.0.0.1:${server.address().port}/v1/oanda/stream?symbol=EUR_USD`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
  const reader=r.body.getReader(); let text='';
  while (!text.includes('event: quote')) text+=new TextDecoder().decode((await reader.read()).value);
  assert.match(text, /"midpoint":101/); assert.match(text, /"sampling":"at_most_4_prices_per_second"/);
  assert.doesNotMatch(text, /"volume"|"aggressorSide"|"open"/);
  controller.abort(); server.shutdown();
  // shutdown aborts the upstream and releases its reader.
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(cancelled,true);
});
