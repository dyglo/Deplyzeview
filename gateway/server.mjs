import http from 'node:http';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { configuration } from './config.mjs';
import { Providers, DataError, fail, canonical } from './providers.mjs';

const digest = value => createHash('sha256').update(value).digest();
export function authenticated(header, tokens) {
  if (!header?.startsWith('Bearer ')) return false;
  const candidate = digest(header.slice(7));
  return tokens.some(token => timingSafeEqual(candidate, digest(token)));
}

// One shared upstream stream per instrument; quotes are never converted into OHLC/trades.
class PricingStreams {
  feeds = new Map();
  constructor(providers) { this.providers = providers; }
  async attach(symbol, response) {
    const instrument = await this.providers.instrument('oanda', symbol);
    if (response.destroyed) return;
    let feed = this.feeds.get(instrument.symbol);
    if (!feed) {
      if (this.feeds.size >= 10) fail(429, 'stream_limit', 'Gateway stream limit reached');
      feed = { clients: new Set(), controller: new AbortController(), instrument };
      this.feeds.set(instrument.symbol, feed);
      void this.run(feed).finally(() => { if (this.feeds.get(instrument.symbol) === feed) this.feeds.delete(instrument.symbol); });
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    response.write(': connected\n\n');
    feed.clients.add(response);
    response.on('close', () => { feed.clients.delete(response); if (!feed.clients.size) { feed.controller.abort(); this.feeds.delete(instrument.symbol); } });
  }
  send(feed, event, data) {
    for (const client of feed.clients) {
      if (client.writableLength > 64 * 1024) { client.destroy(); continue; }
      client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }
  async run(feed) {
    const p = this.providers, signal = feed.controller.signal;
    let attempt = 0;
    while (!signal.aborted) {
      let reader;
      const cancelRead = () => { void reader?.cancel().catch(() => {}); };
      signal.addEventListener('abort', cancelRead, { once: true });
      try {
        await p.pace('oanda');
        if (signal.aborted) break;
        const query = new URLSearchParams({ instruments: feed.instrument.symbol });
        const headerController = new AbortController();
        const headerTimer = setTimeout(() => headerController.abort(), 20_000);
        const response = await p.fetcher(`${p.base('oanda', true)}/v3/accounts/${encodeURIComponent(p.config.accountId)}/pricing/stream?${query}`, { headers: p.headers('oanda'), signal: AbortSignal.any([signal, headerController.signal]), redirect: 'error' }).finally(() => clearTimeout(headerTimer));
        if (!response.ok) {
          await response.body?.cancel();
          if ([401,403,404].includes(response.status)) {
            p.health.oanda = { status: 'error', checkedAt: Date.now(), code: `upstream_${response.status}` };
            this.send(feed, 'health', { status: 'error', code: `upstream_${response.status}` });
            break;
          }
          if (response.status === 429) {
            const retry = response.headers.get('retry-after');
            const seconds = Number(retry);
            const wait = retry && Number.isFinite(seconds) ? seconds*1000 : retry ? Date.parse(retry)-Date.now() : 60_000;
            this.send(feed, 'health', { status: 'rate_limited' });
            await sleep(Math.max(1000, Number.isFinite(wait) ? wait : 60_000), undefined, { signal });
          }
          throw new Error('stream unavailable');
        }
        reader = response.body.getReader();
        const decoder = new TextDecoder(); let buffer = '';
        while (!signal.aborted) {
          // OANDA heartbeats every five seconds; reconnect silent or half-open streams.
          let timer;
          const part = await Promise.race([reader.read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('heartbeat timeout')), 20_000); })]).finally(() => clearTimeout(timer));
          if (part.done) throw new Error('stream ended');
          buffer += decoder.decode(part.value, { stream: true });
          if (buffer.length > 1_048_576) throw new Error('oversized stream frame');
          let newline;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0,newline); buffer = buffer.slice(newline+1);
            if (!line.trim()) continue;
            const row = JSON.parse(line);
            attempt = 0;
            p.health.oanda = { status: 'ok', checkedAt: Date.now() };
            if (row.type === 'HEARTBEAT') { this.send(feed, 'heartbeat', { time: row.time }); continue; }
            if (row.type !== 'PRICE') continue;
            const bid = Number(row.bids?.[0]?.price), ask = Number(row.asks?.[0]?.price), time = Date.parse(row.time);
            if (![bid, ask, time].every(Number.isFinite) || ask < bid) continue;
            this.send(feed, 'quote', { ...feed.instrument, time, bid, ask, midpoint: (bid+ask)/2,
              freshness: row.status === 'tradeable' ? 'live' : 'market_closed', delayMs: 0,
              sampling: 'at_most_4_prices_per_second', priceSource: 'broker_bid_ask' });
          }
        }
      } catch {
        if (!signal.aborted) {
          p.health.oanda = { status: 'reconnecting', checkedAt: Date.now() };
          this.send(feed, 'health', { status: 'reconnecting', gap: true });
        }
      } finally { signal.removeEventListener('abort', cancelRead); await reader?.cancel().catch(() => {}); }
      if (!signal.aborted) await sleep(Math.min(60_000, 1000 * 2 ** Math.min(attempt++, 6)) + Math.random()*500, undefined, { signal }).catch(() => {});
    }
    for (const client of feed.clients) client.end();
  }
  close() { for (const feed of this.feeds.values()) feed.controller.abort(); }
}

export function createGateway(config, providers = new Providers(config), log = console.log) {
  const streams = new PricingStreams(providers), clients = new Map();
  const server = http.createServer(async (request, response) => {
    const requestId = randomUUID(); const start = Date.now();
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const json = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
    try {
      if (!authenticated(request.headers.authorization, config.tokens)) fail(401, 'unauthorized', 'A valid application access token is required');
      const key = digest(request.headers.authorization).toString('hex'), minute = Math.floor(Date.now()/60_000);
      const usage = clients.get(key);
      const count = usage?.minute === minute ? usage.count + 1 : 1;
      clients.set(key, { minute, count });
      if (count > 120) fail(429, 'client_rate_limit', 'Application request limit exceeded');
      if (request.method !== 'GET') fail(405, 'method_not_allowed', 'Only market-data GET requests are available');
      const url = new URL(request.url, 'http://gateway');
      if (url.pathname === '/v1/health') return json(200, { providers: config.enabled.map(provider => ({ provider, ...(providers.health[provider] || { status: 'not_checked' }) })) });
      const match = /^\/v1\/(oanda|narwhal|finzdata)\/(instruments|instrument|contracts|bars|quote|stream)$/.exec(url.pathname);
      if (!match) fail(404, 'not_found', 'Unknown market-data endpoint');
      const [, provider, action] = match;
      providers.check(provider);
      if (action === 'instruments') return json(200, await providers.instruments(provider));
      const symbol = canonical(provider, url.searchParams.get('symbol') || '');
      if (action === 'instrument') return json(200, await providers.instrument(provider, symbol));
      if (action === 'contracts') {
        if (provider !== 'finzdata') fail(400, 'contracts_unavailable', 'Individual contracts are available only through FinzData');
        return json(200, await providers.contracts(symbol));
      }
      if (action === 'quote') return json(200, await providers.quote(provider, symbol));
      if (action === 'stream') {
        if (provider !== 'oanda') fail(400, 'stream_unavailable', 'Narwhal futures streaming is not provided by this gateway');
        return await streams.attach(symbol, response);
      }
      const timeframe = url.searchParams.get('timeframe') || '60';
      const duration = /^\d+$/.test(timeframe) ? Number(timeframe)*60_000 : ({ '1D':86_400_000, '1W':604_800_000, '1M':2_678_400_000 }[timeframe]);
      if (!duration || !Number.isFinite(duration)) fail(400, 'unsupported_timeframe', 'Invalid timeframe');
      const limit = Number(url.searchParams.get('limit') || 500);
      const bucket = provider === 'oanda' ? 5000 : 3_600_000;
      const to = Number(url.searchParams.get('to') || Math.floor(Date.now()/bucket)*bucket);
      const from = Number(url.searchParams.get('from') || to - duration*limit*2);
      if (![from,to,limit].every(Number.isSafeInteger) || from < 0 || to < from || limit < 1 || limit > 1500 || to-from > 10*366*86_400_000) fail(400, 'invalid_range', 'Invalid or excessive historical range');
      // Cache exact ranges; distinct boundaries must never reuse truncated results.
      const cacheKey = JSON.stringify([provider,symbol,timeframe,from,to,limit]);
      const result = await providers.cache.get(cacheKey, bucket, () => providers.bars(provider, symbol, timeframe, from, to, limit));
      return json(200, { ...result, bars: result.bars.filter(bar => bar.time >= from && bar.time <= to) });
    } catch (error) {
      const status = error instanceof DataError ? error.status : 500;
      const code = error instanceof DataError ? error.code : 'internal_error';
      json(status, { error: { code, message: error instanceof DataError ? error.message : 'Gateway request failed', requestId } });
    } finally {
      // Never log URLs, headers, provider bodies, account IDs or credentials.
      log(JSON.stringify({ requestId, status: response.statusCode, durationMs: Date.now()-start }));
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.on('close', () => streams.close());
  server.shutdown = () => { streams.close(); server.close(); };
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = configuration();
    const providers = new Providers(config);
    const server = createGateway(config, providers);
    server.listen(config.port, config.host, () => console.log(JSON.stringify({ event:'gateway_started', port:config.port, providers:config.enabled })));
    // Independent read-only authentication/entitlement probes: one failed source
    // must not stop healthy providers or existing desktop crypto feeds.
    void Promise.allSettled(config.enabled.map(provider => providers.instruments(provider)));
    for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.shutdown());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
