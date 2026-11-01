export function configuration(env = process.env) {
  const enabled = (env.MARKET_DATA_PROVIDERS ?? 'oanda,narwhal').split(',').map(s => s.trim()).filter(Boolean);
  if (!enabled.length || enabled.some(p => !['oanda', 'narwhal', 'finzdata'].includes(p))) throw new Error('MARKET_DATA_PROVIDERS must contain oanda, narwhal and/or finzdata.');
  const requireValue = name => {
    if (!env[name]?.trim()) throw new Error(`Missing ${name}; configure the gateway environment.`);
    return env[name].trim();
  };
  const tokens = requireValue('MARKET_DATA_APP_TOKENS').split(',').map(s => s.trim());
  if (tokens.some(t => t.length < 32)) throw new Error('MARKET_DATA_APP_TOKENS must contain independent random application tokens of at least 32 characters.');
  if (enabled.includes('oanda')) { requireValue('OANDA_API_TOKEN'); requireValue('OANDA_ACCOUNT_ID'); }
  if (enabled.includes('narwhal')) requireValue('NARWHAL_API_KEY');
  if (enabled.includes('finzdata')) requireValue('FINZDATA_API_KEY');
  const environment = env.OANDA_ENVIRONMENT || 'practice';
  if (!['practice', 'live'].includes(environment)) throw new Error('OANDA_ENVIRONMENT must be practice or live.');
  const plan = env.NARWHAL_PLAN || 'free';
  if (!['free', 'basic', 'pro'].includes(plan)) throw new Error('NARWHAL_PLAN must be free, basic or pro.');
  const port = Number(env.MARKET_DATA_PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid MARKET_DATA_PORT');
  return { enabled, tokens, port, host: env.MARKET_DATA_HOST || '127.0.0.1', environment, plan,
    oandaToken: env.OANDA_API_TOKEN, accountId: env.OANDA_ACCOUNT_ID, narwhalKey: env.NARWHAL_API_KEY, finzdataKey: env.FINZDATA_API_KEY };
}
