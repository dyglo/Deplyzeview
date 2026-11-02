// Read-only acceptance check after credentials, backend URL and app authorization are configured.
import { loadEnvFile } from 'node:process';
try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const base = process.env.DEPLYZEVIEW_GATEWAY_URL;
const token = process.env.DEPLYZEVIEW_APP_TOKEN;
if (!base || !token) throw new Error('Configure DEPLYZEVIEW_GATEWAY_URL and DEPLYZEVIEW_APP_TOKEN first.');
const url = new URL(base);
if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash) throw new Error('Invalid gateway URL; HTTPS required outside loopback.');
async function get(path) {
  const response = await fetch(base.replace(/\/$/,'') + path, { headers: { Authorization:`Bearer ${token}` }, signal:AbortSignal.timeout(60_000), redirect:'error' });
  if (!response.ok) throw new Error(`Gateway acceptance check returned HTTP ${response.status}`);
  return response.json();
}
const health = await get('/v1/health');
for (const {provider} of health.providers) {
  try {
    const directory = await get(`/v1/${provider}/instruments`);
    if (!directory.length) throw new Error('Empty instrument directory');
    let symbol;
    if (provider === 'finzdata') {
      const root = directory.find(i=>i.symbol === 'ES') ?? directory[0];
      const contracts = await get(`/v1/finzdata/contracts?symbol=${encodeURIComponent(root.symbol)}`);
      if (!contracts.length) throw new Error('Empty contract directory');
      // Prefer a contract not expired today, using only provider-supplied expiry.
      symbol = contracts.find(i => i.rollStatus?.startsWith('current'))?.symbol ?? contracts.filter(i => i.contractExpiry && Date.parse(i.contractExpiry) >= Date.now()).sort((a,b)=>Date.parse(a.contractExpiry)-Date.parse(b.contractExpiry))[0]?.symbol;
      if (!symbol) throw new Error('No provider-identified current contract or unexpired contract; inspect directory manually');
    } else {
      symbol = directory.find(i=>i.symbol === (provider === 'oanda' ? 'EUR_USD' : 'GC'))?.symbol ?? directory[0].symbol;
    }
    const timeframe = provider === 'oanda' ? '60' : '1D';
    const result = await get(`/v1/${provider}/bars?${new URLSearchParams({symbol,timeframe,limit:'10',from:String(Date.now()-10*86_400_000)})}`);
    if (!result.bars.length) throw new Error('No candles in requested period; check entitlement/session/contract');
    for (const bar of result.bars) if (bar.provider !== provider || !Number.isFinite(bar.close)) throw new Error('Invalid normalized candle');
    let freshness='historical';
    if (provider === 'narwhal') freshness=(await get(`/v1/narwhal/quote?symbol=${encodeURIComponent(symbol)}`)).freshness;
    console.log(JSON.stringify({provider,symbol,candles:result.bars.length,freshness,status:'passed'}));
  } catch (error) {
    console.error(JSON.stringify({provider,status:'failed',message:error.message}));
    process.exitCode=1;
  }
}
