import { setTimeout as sleep } from 'node:timers/promises';

export class DataError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new DataError(status, code, message); };
export function numeric(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') fail(502, 'invalid_data', 'Provider returned a missing numeric field');
  const n = Number(value);
  if (!Number.isFinite(n)) fail(502, 'invalid_data', 'Provider returned a non-finite number');
  return n;
}
export function candle(row, metadata) {
  if (typeof row.timestamp !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row.timestamp)) fail(502, 'invalid_data', 'Provider timestamp must include an explicit timezone');
  const time = Date.parse(row.timestamp);
  const [open, high, low, close] = ['open', 'high', 'low', 'close'].map(k => numeric(row[k]));
  if (!Number.isFinite(time) || high < Math.max(open, close, low) || low > Math.min(open, close)) fail(502, 'invalid_data', 'Provider returned invalid OHLC or time');
  return { ...metadata, time, open, high, low, close, volume: null };
}
export function uniqueBars(rows, from, to, limit) {
  return [...new Map(rows.filter(b => b.time >= from && b.time <= to).map(b => [b.time, b])).values()].sort((a,b) => a.time-b.time).slice(-limit);
}
export const oandaGranularities = { '1':'M1', '2':'M2', '3':'M3', '4':'M4', '5':'M5', '10':'M10', '15':'M15', '30':'M30', '60':'H1', '120':'H2', '180':'H3', '240':'H4', '360':'H6', '480':'H8', '720':'H12', '1D':'D', '1W':'W', '1M':'M' };
export function canonical(provider, symbol) {
  const value = symbol.trim().toUpperCase();
  let normalized = provider === 'oanda' ? value.replace(/[/-]/g, '_') : value;
  if (provider === 'oanda' && /^[A-Z]{6}$/.test(normalized)) normalized = `${normalized.slice(0,3)}_${normalized.slice(3)}`;
  if (!(provider === 'finzdata' ? /^[A-Z0-9]{1,10}(\.[A-Z0-9]{1,20})?$/ : /^[A-Z0-9_]{1,40}$/).test(normalized)) fail(400, 'invalid_symbol', 'Invalid provider instrument identifier');
  return normalized;
}

// Bounded, coalescing TTL cache. Errors are never cached as successful data.
export class Cache {
  values = new Map(); pending = new Map();
  async get(key, ttl, load) {
    const entry = this.values.get(key);
    if (entry?.until > Date.now()) return entry.value;
    if (this.pending.has(key)) return this.pending.get(key);
    const request = Promise.resolve().then(load).then(value => {
      this.values.delete(key);
      this.values.set(key, { value, until: Date.now() + ttl });
      while (this.values.size > 256) this.values.delete(this.values.keys().next().value);
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}

export class Providers {
  cache = new Cache(); health = {}; nextRequest = {}; cooldown = {};
  constructor(config, fetcher = fetch) { this.config = config; this.fetcher = fetcher; }
  check(provider) { if (!this.config.enabled.includes(provider)) fail(503, 'provider_disabled', `${provider} is not configured on this gateway`); }
  base(provider, stream = false) {
    if (provider === 'finzdata') return 'https://api.finzdata.com';
    if (provider === 'narwhal') return 'https://api.narwhalapi.com';
    const live = this.config.environment === 'live' ? 'fxtrade' : 'fxpractice';
    return `https://${stream ? 'stream' : 'api'}-${live}.oanda.com`;
  }
  headers(provider) {
    if (provider === 'finzdata') return { 'X-API-Key': this.config.finzdataKey };
    return { Authorization: `Bearer ${provider === 'oanda' ? this.config.oandaToken : this.config.narwhalKey}`, 'Accept-Datetime-Format': 'RFC3339' };
  }
  async pace(provider) {
    const slot = Math.max(Date.now(), this.nextRequest[provider] || 0);
    if (slot - Date.now() > 10_000) fail(429, 'gateway_busy', 'Provider request queue is full');
    // Reserve OANDA REST and stream starts in the same queue, below 2 new connections/sec.
    this.nextRequest[provider] = slot + (provider === 'oanda' ? 600 : 2100);
    await sleep(Math.max(0, slot - Date.now()));
  }
  async request(provider, path) {
    this.check(provider);
    for (let attempt = 0; attempt < 3; attempt++) {
      if ((this.cooldown[provider] || 0) > Date.now()) fail(429, 'provider_rate_limit', `${provider} is cooling down after an upstream rate limit`);
      await this.pace(provider);
      try {
        const response = await this.fetcher(this.base(provider) + path, { headers: this.headers(provider), signal: AbortSignal.timeout(15_000), redirect: 'error' });
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429) {
            const retry = response.headers.get('retry-after');
            const seconds = Number(retry);
            const wait = retry && Number.isFinite(seconds) ? seconds * 1000 : retry ? Date.parse(retry) - Date.now() : 60_000;
            this.cooldown[provider] = Date.now() + Math.max(1000, Number.isFinite(wait) ? wait : 60_000);
          }
          const status = [400,401,403,404,429].includes(response.status) ? response.status : 502;
          throw new DataError(status, `upstream_${response.status}`, `${provider} returned HTTP ${response.status}; check credentials, symbol, plan and availability`);
        }
        const data = await response.json();
        this.health[provider] = { status: 'ok', checkedAt: Date.now() };
        return data;
      } catch (error) {
        this.health[provider] = { status: 'error', checkedAt: Date.now(), code: error.code || 'upstream_unavailable' };
        if (error instanceof DataError && error.status !== 502) throw error;
        if (attempt === 2) throw new DataError(502, 'upstream_unavailable', `${provider} unavailable after bounded retries`);
        await sleep(500 * 2 ** attempt + Math.random() * 250);
      }
    }
  }
  async instruments(provider) {
    this.check(provider);
    return this.cache.get(`${provider}:instruments`, 300_000, async () => {
      if (provider === 'finzdata') {
        const data = await this.request(provider, '/v1/futures/roots');
        if (!Array.isArray(data.data)) fail(502, 'invalid_data', 'Missing FinzData roots');
        return data.data.map(i => ({ provider, symbol: i.root, instrumentId: i.root, name: i.name ?? i.root,
          assetClass: 'futures', instrumentType: 'futures_root', exchange: i.exchange ?? null,
          contractExpiry: null, individualContracts: true, priceSource: 'exchange_reported_daily',
          volumeType: 'contracts', quoteCurrency: i.currency ?? null }));
      }
      if (provider === 'oanda') {
        const data = await this.request(provider, `/v3/accounts/${encodeURIComponent(this.config.accountId)}/instruments`);
        if (!Array.isArray(data.instruments)) fail(502, 'invalid_data', 'Missing OANDA instrument directory');
        const instruments = data.instruments.map(i => ({ provider, symbol: i.name, instrumentId: i.name, name: i.displayName,
          assetClass: i.type === 'CURRENCY' ? 'forex' : i.type === 'METAL' ? 'metals' : 'commodity_or_index',
          instrumentType: i.type === 'CURRENCY' ? 'spot_forex' : 'cfd', providerInstrumentType: i.type,
          exchange: null, contractExpiry: null, priceSource: 'midpoint', volumeType: 'unavailable',
          quoteCurrency: i.name.split('_').at(-1), tickSize: 10 ** -i.displayPrecision, tags: i.tags ?? [], delayMs:0 }));
        // The account's directory can omit XAU_USD even while its authorized
        // candle/pricing endpoints serve it. Verify real data before listing it.
        if (!instruments.some(i => i.symbol === 'XAU_USD')) {
          try {
            const gold = await this.request(provider, `/v3/accounts/${encodeURIComponent(this.config.accountId)}/instruments/XAU_USD/candles?granularity=H1&price=M&count=1`);
            const latest = gold.candles?.at(-1);
            if (gold.instrument === 'XAU_USD' && latest) {
              candle({timestamp:latest.time,open:latest.mid?.o,high:latest.mid?.h,low:latest.mid?.l,close:latest.mid?.c}, {});
              // Preserve the precision of OANDA's raw midpoint strings, including trailing zeroes.
              const precision = Math.max(...Object.values(latest.mid).map(value =>
                typeof value === 'string' ? (/^\d+\.(\d+)$/.exec(value)?.[1].length ?? 0) : 0));
              instruments.push({ provider, symbol:'XAU_USD', instrumentId:'XAU_USD', name:'Gold / US Dollar',
                assetClass:'metals', instrumentType:'cfd', providerInstrumentType:'METAL', exchange:null,
                contractExpiry:null, priceSource:'midpoint', volumeType:'unavailable', quoteCurrency:'USD',
                ...(precision > 0 ? { tickSize:10 ** -precision } : {}),
                tags:[], delayMs:0, listedInAccountDirectory:false, marketDataAccess:'verified_candles' });
            }
          } catch { /* Optional gold failure must not remove healthy forex instruments. */ }
        }
        return instruments;
      }
      const data = await this.request(provider, '/v1/futures');
      if (!Array.isArray(data.futures)) fail(502, 'invalid_data', 'Missing Narwhal futures directory');
      return data.futures.map(i => ({ provider, symbol: i.id, instrumentId: i.id, name: i.name, assetClass: i.category,
        instrumentType: 'continuous_futures', exchange: i.exchange_mic || i.exchange, contractExpiry: null,
        rollPolicy: 'front_month_unadjusted', individualContracts: false, quoteCurrency: i.currency, unit: i.unit,
        priceSource: 'provider_front_month', volumeType: 'unavailable', delayMs: this.config.plan === 'free' ? 900_000 : 0 }));
    });
  }
  async instrument(provider, symbol) {
    if (provider === 'finzdata') {
      const [root, contract] = canonical(provider, symbol).split('.');
      if (!contract) fail(400, 'contract_required', 'FinzData requires an individual contract: ROOT.CONTRACT, for example ES.ESZ26. Query contracts to discover expiry.');
      const match = (await this.contracts(root)).find(i => i.contractId === contract);
      if (!match) fail(404, 'instrument_unavailable', 'FinzData does not list this individual contract');
      return match;
    }
    const match = (await this.instruments(provider)).find(i => i.symbol === canonical(provider, symbol));
    if (!match) fail(404, 'instrument_unavailable', `${provider} does not list this instrument for the configured account; no price substitution is performed`);
    return match;
  }
  async contracts(root) {
    this.check('finzdata'); root = canonical('finzdata', root);
    if (root.includes('.')) fail(400, 'invalid_root', 'Expected a futures root');
    const instrument = (await this.instruments('finzdata')).find(i => i.symbol === root);
    if (!instrument) fail(404, 'instrument_unavailable', 'FinzData does not list this futures root');
    return this.cache.get(`finzdata:contracts:${root}`, 3_600_000, async () => {
      const data = await this.request('finzdata', `/v1/futures/contracts?root=${root}&format=json`);
      if (!Array.isArray(data.data)) fail(502, 'invalid_data', 'Missing FinzData contracts');
      const rolls = await this.rolls(root);
      return data.data.map(i => {
        if (typeof i.contract !== 'string') fail(502, 'invalid_data', 'Missing FinzData contract identifier');
        const roll = rolls.find(row => row.contract === i.contract);
        const expiry = i.expiry ?? roll?.expiry ?? null;
        return { ...instrument, symbol:`${root}.${i.contract}`, instrumentId:i.contract, root, contractId:i.contract,
          instrumentType:'exchange_futures', contractExpiry: expiry, expirySource: expiry ? 'provider' : 'unavailable',
          rollStatus:roll?.status ?? null, rollDate:roll?.roll_date ?? null, nextContract:roll?.next_contract ?? null };
      });
    });
  }
  async rolls(root) {
    this.check('finzdata'); root = canonical('finzdata', root);
    if (root.includes('.')) fail(400, 'invalid_root', 'Expected a futures root');
    return this.cache.get(`finzdata:rolls:${root}`, 3_600_000, async () => {
      const data = await this.request('finzdata', `/v1/futures/rolls?root=${root}&format=json`);
      if (!Array.isArray(data.data)) fail(502, 'invalid_data', 'Missing FinzData roll calendar');
      return data.data;
    });
  }
  async bars(provider, symbol, timeframe, from, to, limit) {
    const instrument = await this.instrument(provider, symbol);
    const meta = { ...instrument, frequency: timeframe, freshness: 'historical', retrievedAt: Date.now() };
    const rows = [];
    if (provider === 'finzdata') {
      // Daily dates are trading-day labels at UTC midnight. Intraday Eastern-time
      // conversion is deliberately unsupported until DST semantics are verified.
      if (timeframe !== '1D') fail(400, 'unsupported_timeframe', 'FinzData supports daily individual-contract research here; no live or intraday substitution');
      const query = new URLSearchParams({ root:instrument.root, contract:instrument.contractId, continuous:'false', adjust:'none', start:new Date(from).toISOString().slice(0,10), end:new Date(to).toISOString().slice(0,10), format:'json', limit:'10000' });
      const data = await this.request(provider, `/v1/futures/daily?${query}`);
      if (!Array.isArray(data.data)) fail(502, 'invalid_data', 'Missing FinzData daily bars');
      if (data.data.length >= 10000) fail(422, 'range_too_large', 'FinzData history may be truncated; narrow the date range');
      for (const row of data.data) {
        if (row.contract && row.contract !== instrument.contractId) fail(502, 'contract_mismatch', 'FinzData returned another contract; refusing to mix futures prices');
        // FinzData's live JSON uses a naive midnight datetime for a daily
        // trading-date label. Accept that exact shape, never arbitrary local times.
        const dailyDate = typeof row.date === 'string' && /^(\d{4}-\d{2}-\d{2})(?:T00:00:00)?$/.exec(row.date)?.[1];
        if (!dailyDate || !Number.isFinite(Date.parse(dailyDate)) || new Date(dailyDate).toISOString().slice(0,10) !== dailyDate) fail(502, 'invalid_data', 'FinzData daily bar must have a valid explicit trading date');
        const volume = row.volume == null ? null : numeric(row.volume);
        const openInterest = row.open_interest == null ? null : numeric(row.open_interest);
        if ((volume !== null && volume < 0) || (openInterest !== null && openInterest < 0)) fail(502, 'invalid_data', 'Invalid futures volume or open interest');
        rows.push({ ...candle({ ...row, timestamp: `${dailyDate}T00:00:00Z` }, meta), volume, openInterest, complete:true, historyNote: data.history_note ?? null });
      }
    } else if (provider === 'oanda') {
      const granularity = oandaGranularities[timeframe];
      if (!granularity) fail(400, 'unsupported_timeframe', 'Unsupported OANDA timeframe');
      let cursor = from;
      for (let page = 0; page < 12 && cursor <= to; page++) {
        // Count + from is legal. Count + from + to is not. Bound pages and filter locally.
        const query = new URLSearchParams({ granularity, price: 'M', from: new Date(cursor).toISOString(), includeFirst: page === 0 ? 'true' : 'false', count: '5000', smooth: 'false', dailyAlignment: '0', alignmentTimezone: 'UTC', weeklyAlignment: 'Monday' });
        const data = await this.request(provider, `/v3/accounts/${encodeURIComponent(this.config.accountId)}/instruments/${instrument.symbol}/candles?${query}`);
        if (!Array.isArray(data.candles)) fail(502, 'invalid_data', 'Missing OANDA candles');
        for (const c of data.candles) {
          const tickCount = numeric(c.volume);
          if (!Number.isSafeInteger(tickCount) || tickCount < 0 || typeof c.complete !== 'boolean') fail(502, 'invalid_data', 'OANDA candle has invalid tick count or completion state');
          rows.push({ ...candle({ timestamp: c.time, open: c.mid?.o, high: c.mid?.h, low: c.mid?.l, close: c.mid?.c }, meta), tickCount, complete: c.complete, freshness: c.complete ? 'historical' : 'forming' });
        }
        const last = data.candles.at(-1);
        if (!last || Date.parse(last.time) >= to || !last.complete || data.candles.length < 5000) break;
        const next = Date.parse(last.time);
        if (next <= cursor) fail(502, 'pagination_stalled', 'OANDA pagination did not advance');
        cursor = next;
        if (page === 11) fail(422, 'range_too_large', 'Narrow the requested history range');
      }
    } else {
      if (timeframe !== '1D') fail(400, 'unsupported_timeframe', 'Narwhal gateway supports daily bars only; intraday requires a paid plan and is not silently substituted');
      const query = new URLSearchParams({ interval: '1d', start: new Date(from).toISOString().slice(0,10), end: new Date(to).toISOString().slice(0,10) });
      let cursor; const seen = new Set();
      for (let page = 0; page < 12; page++) {
        if (cursor) query.set('cursor', cursor);
        const data = await this.request(provider, `/v1/futures/${instrument.symbol}/bars?${query}`);
        if (!Array.isArray(data.bars)) fail(502, 'invalid_data', 'Missing Narwhal bars');
        for (const row of data.bars) rows.push(candle(row, { ...meta, complete: true, delayMs: instrument.delayMs, availableStart: data.start ?? null, availableEnd: data.end ?? null }));
        cursor = data.next_cursor;
        if (!cursor) break;
        if (seen.has(cursor)) fail(502, 'pagination_stalled', 'Narwhal cursor repeated');
        seen.add(cursor);
        if (page === 11) fail(422, 'range_too_large', 'Narrow the requested history range');
      }
    }
    return { instrument, bars: uniqueBars(rows, from, to, limit), retrievedAt: Date.now(), delivery: provider === 'oanda' ? 'authoritative_candle_polling' : 'historical_only' };
  }
  async quote(provider, symbol) {
    const instrument = await this.instrument(provider, symbol);
    if (provider !== 'narwhal') fail(400, 'quote_unavailable', 'Use OANDA pricing stream; FinzData is historical only');
    const data = await this.cache.get(`quote:${symbol}`, 60_000, () => this.request(provider, `/v1/futures/${instrument.symbol}/price`));
    const time = Date.parse(data.timestamp);
    if (!Number.isFinite(time)) fail(502, 'invalid_data', 'Missing quote timestamp');
    return { ...instrument, time, price: numeric(data.price), delayMs: data.delayed ? 900_000 : instrument.delayMs,
      freshness: data.stale ? 'stale' : data.delayed || instrument.delayMs ? 'delayed' : data.market_session === 'closed' ? 'market_closed' : 'live', marketSession: data.market_session };
  }
}
