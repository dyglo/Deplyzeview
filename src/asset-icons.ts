export type AssetIconKind = 'forex' | 'commodity' | 'crypto' | 'index' | 'stock' | 'monogram';

export type ResolvedAssetIcon = {
  kind: AssetIconKind;
  symbol: string;
  base: string;
  quote: string | null;
  label: string;
  svg: string;
  dataUri: string;
};

const CURRENCY_CODES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD',
  'CNY', 'CNH', 'HKD', 'SGD', 'SEK', 'NOK', 'DKK', 'PLN',
  'TRY', 'ZAR', 'MXN', 'BRL', 'INR', 'KRW', 'RUB', 'CZK',
  'HUF', 'ILS', 'THB', 'TWD', 'AED', 'SAR', 'CLP', 'COP',
]);

const COMMODITY_PREFIXES: Record<string, { code: string; name: string; defaultQuote?: string }> = {
  XAU: { code: 'XAU', name: 'Gold' },
  GOLD: { code: 'XAU', name: 'Gold' },
  GC: { code: 'XAU', name: 'Gold' },
  MGC: { code: 'XAU', name: 'Gold' },
  QO: { code: 'XAU', name: 'Gold' },
  XAG: { code: 'XAG', name: 'Silver' },
  SILVER: { code: 'XAG', name: 'Silver' },
  SI: { code: 'XAG', name: 'Silver' },
  SIL: { code: 'XAG', name: 'Silver' },
  XPT: { code: 'XPT', name: 'Platinum' },
  PL: { code: 'XPT', name: 'Platinum' },
  XPD: { code: 'XPD', name: 'Palladium' },
  PA: { code: 'XPD', name: 'Palladium' },
  WTICO: { code: 'OIL', name: 'WTI Crude Oil' },
  WTI: { code: 'OIL', name: 'WTI Crude Oil' },
  USOIL: { code: 'OIL', name: 'US Oil' },
  BCO: { code: 'OIL', name: 'Brent Crude Oil' },
  UKOIL: { code: 'OIL', name: 'Brent Crude Oil' },
  BRENT: { code: 'OIL', name: 'Brent Crude Oil' },
  OIL: { code: 'OIL', name: 'Crude Oil' },
  USO: { code: 'OIL', name: 'Crude Oil' },
  CL: { code: 'OIL', name: 'Crude Oil' },
  MCL: { code: 'OIL', name: 'Micro Crude Oil' },
  BZ: { code: 'OIL', name: 'Brent Crude Oil' },
  QM: { code: 'OIL', name: 'Crude Oil' },
  NATGAS: { code: 'NG', name: 'Natural Gas' },
  NG: { code: 'NG', name: 'Natural Gas' },
  QG: { code: 'NG', name: 'Natural Gas' },
  XCU: { code: 'HG', name: 'Copper' },
  COPPER: { code: 'HG', name: 'Copper' },
  HG: { code: 'HG', name: 'Copper' },
  MHG: { code: 'HG', name: 'Copper' },
  CORN: { code: 'AGRI', name: 'Corn' },
  ZC: { code: 'AGRI', name: 'Corn' },
  WHEAT: { code: 'AGRI', name: 'Wheat' },
  ZW: { code: 'AGRI', name: 'Wheat' },
  SOYBN: { code: 'AGRI', name: 'Soybeans' },
  ZS: { code: 'AGRI', name: 'Soybeans' },
};

const INDEX_MAP: Record<string, { badge: string; bg: string; fg?: string; label: string }> = {
  SPX500: { badge: '500', bg: '#dc2626', label: 'S&P 500' },
  SPX: { badge: '500', bg: '#dc2626', label: 'S&P 500' },
  US500: { badge: '500', bg: '#dc2626', label: 'S&P 500' },
  ES: { badge: '500', bg: '#dc2626', label: 'E-mini S&P 500' },
  MES: { badge: '500', bg: '#dc2626', label: 'Micro E-mini S&P 500' },
  SPY: { badge: '500', bg: '#dc2626', label: 'SPDR S&P 500' },
  NAS100: { badge: '100', bg: '#0284c7', label: 'Nasdaq 100' },
  NDX: { badge: '100', bg: '#0284c7', label: 'Nasdaq 100' },
  US100: { badge: '100', bg: '#0284c7', label: 'Nasdaq 100' },
  USTEC: { badge: '100', bg: '#0284c7', label: 'Nasdaq 100' },
  NQ: { badge: '100', bg: '#0284c7', label: 'E-mini Nasdaq 100' },
  MNQ: { badge: '100', bg: '#0284c7', label: 'Micro E-mini Nasdaq 100' },
  QQQ: { badge: '100', bg: '#0284c7', label: 'Invesco QQQ' },
  US30: { badge: '30', bg: '#1d4ed8', label: 'Dow Jones 30' },
  DJI: { badge: '30', bg: '#1d4ed8', label: 'Dow Jones 30' },
  DJ30: { badge: '30', bg: '#1d4ed8', label: 'Dow Jones 30' },
  YM: { badge: '30', bg: '#1d4ed8', label: 'Mini Dow' },
  MYM: { badge: '30', bg: '#1d4ed8', label: 'Micro Mini Dow' },
  US2000: { badge: '2K', bg: '#4f46e5', label: 'Russell 2000' },
  RUT: { badge: '2K', bg: '#4f46e5', label: 'Russell 2000' },
  RTY: { badge: '2K', bg: '#4f46e5', label: 'E-mini Russell 2000' },
  M2K: { badge: '2K', bg: '#4f46e5', label: 'Micro Russell 2000' },
  UK100: { badge: '100', bg: '#1e3a8a', label: 'FTSE 100' },
  FTSE: { badge: '100', bg: '#1e3a8a', label: 'FTSE 100' },
  DE30: { badge: '40', bg: '#d97706', label: 'DAX' },
  DE40: { badge: '40', bg: '#d97706', label: 'DAX 40' },
  GER40: { badge: '40', bg: '#d97706', label: 'DAX 40' },
  DAX: { badge: '40', bg: '#d97706', label: 'DAX' },
  FR40: { badge: '40', bg: '#2563eb', label: 'CAC 40' },
  EU50: { badge: '50', bg: '#003399', label: 'Euro Stoxx 50' },
  JP225: { badge: '225', bg: '#be123c', label: 'Nikkei 225' },
  NI225: { badge: '225', bg: '#be123c', label: 'Nikkei 225' },
  NKD: { badge: '225', bg: '#be123c', label: 'Nikkei 225' },
  HK33: { badge: '33', bg: '#dc2626', label: 'Hang Seng' },
  HK50: { badge: '50', bg: '#dc2626', label: 'Hang Seng' },
  AU200: { badge: '200', bg: '#0369a1', label: 'ASX 200' },
  DXY: { badge: '$', bg: '#15803d', label: 'US Dollar Index' },
  DX: { badge: '$', bg: '#15803d', label: 'US Dollar Index' },
  VIX: { badge: 'VIX', bg: '#7c3aed', label: 'Volatility Index' },
  VX: { badge: 'VIX', bg: '#7c3aed', label: 'VIX Futures' },
};

const CRYPTO_STYLES: Record<string, { bg: string; fg?: string; glyph?: string }> = {
  BTC: { bg: '#f7931a', glyph: 'btc' },
  XBT: { bg: '#f7931a', glyph: 'btc' },
  ETH: { bg: '#627eea', glyph: 'eth' },
  SOL: { bg: '#181b24', glyph: 'sol' },
  BNB: { bg: '#f3ba2f', glyph: 'bnb' },
  XRP: { bg: '#23292f', glyph: 'xrp' },
  USDT: { bg: '#26a17b', glyph: 'usdt' },
  USDC: { bg: '#2775ca', glyph: 'usdc' },
  ADA: { bg: '#0033ad', glyph: 'ada' },
  DOGE: { bg: '#c2a633', glyph: 'doge' },
  AVAX: { bg: '#e84142', glyph: 'avax' },
  LINK: { bg: '#2a5ada', glyph: 'link' },
  DOT: { bg: '#e6007a', glyph: 'dot' },
  LTC: { bg: '#345d9d', glyph: 'ltc' },
  TRX: { bg: '#ef0027', glyph: 'trx' },
  TON: { bg: '#0098ea', glyph: 'ton' },
  SUI: { bg: '#4da2ff', glyph: 'sui' },
  MATIC: { bg: '#8247e5', glyph: 'poly' },
  POL: { bg: '#8247e5', glyph: 'poly' },
  SHIB: { bg: '#f05a28' },
  PEPE: { bg: '#3b8c2a' },
  UNI: { bg: '#ff007a' },
  AAVE: { bg: '#9b51e0' },
  ATOM: { bg: '#2e3148' },
  NEAR: { bg: '#111827' },
  APT: { bg: '#0f172a' },
  ARB: { bg: '#28a0f0' },
  OP: { bg: '#ff0420' },
  INJ: { bg: '#0082ff' },
  TIA: { bg: '#7b2bf9' },
  SEI: { bg: '#9b1c1c' },
  JUP: { bg: '#16a34a' },
  PYTH: { bg: '#6d28d9' },
  WIF: { bg: '#a16207' },
  BONK: { bg: '#ea580c' },
  RENDER: { bg: '#dc2626' },
  RNDR: { bg: '#dc2626' },
  FET: { bg: '#1e293b' },
  TAO: { bg: '#18181b' },
  WLD: { bg: '#111827' },
  ONDO: { bg: '#1d4ed8' },
  PENDLE: { bg: '#0ea5e9' },
  ENA: { bg: '#312e81' },
  BCH: { bg: '#0ac18e', glyph: 'btc' },
  ETC: { bg: '#328332', glyph: 'eth' },
  XLM: { bg: '#111827' },
  HBAR: { bg: '#18181b' },
  FIL: { bg: '#0090ff' },
  ICP: { bg: '#3b00b9' },
  ALGO: { bg: '#111827' },
  VET: { bg: '#15bdff' },
  MKR: { bg: '#1aab9b' },
  LDO: { bg: '#00a3ff' },
  CRV: { bg: '#3b82f6' },
  ZEC: { bg: '#f4b728' },
  XMR: { bg: '#ff6600' },
  KAS: { bg: '#49eacb', fg: '#0f172a' },
};

const STOCK_STYLES: Record<string, { bg: string; label: string; glyph?: string }> = {
  AAPL: { bg: '#1f2937', label: 'Apple', glyph: 'apple' },
  TSLA: { bg: '#cc0000', label: 'Tesla' },
  NVDA: { bg: '#76b900', label: 'NVIDIA' },
  MSFT: { bg: '#00a4ef', label: 'Microsoft' },
  AMZN: { bg: '#ff9900', label: 'Amazon' },
  GOOGL: { bg: '#4285f4', label: 'Alphabet' },
  GOOG: { bg: '#4285f4', label: 'Alphabet' },
  META: { bg: '#0668e1', label: 'Meta' },
  NFLX: { bg: '#e50914', label: 'Netflix' },
  AMD: { bg: '#0071c5', label: 'AMD' },
  COIN: { bg: '#0052ff', label: 'Coinbase' },
  MSTR: { bg: '#d9232e', label: 'MicroStrategy' },
};

const CRYPTO_QUOTE_SUFFIXES = ['USDT', 'USDC', 'USD1', 'USDS', 'BUSD', 'FDUSD', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'PERP'];

const FALLBACK_PALETTE = ['#3b82f6', '#8b5cf6', '#0891b2', '#0d9488', '#d97706', '#e11d48', '#4f46e5', '#2563eb'];

function hashPaletteColor(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

/** Draw the interior artwork of a circular currency flag inside a 0..24 coordinate space. */
function flagInnerSvg(currency: string): string {
  switch (currency) {
    case 'USD':
      return `<rect width="24" height="24" fill="#f8fafc"/>`
        + `<path d="M0 0h24v3.4H0zm0 6.8h24v3.4H0zm0 6.8h24V17H0zm0 6.8h24V24H0z" fill="#c8102e"/>`
        + `<rect width="12.5" height="13.6" fill="#012169"/>`
        + `<g fill="#ffffff"><circle cx="3.2" cy="3.4" r="1"/><circle cx="6.4" cy="3.4" r="1"/><circle cx="9.6" cy="3.4" r="1"/><circle cx="4.8" cy="6.8" r="1"/><circle cx="8" cy="6.8" r="1"/><circle cx="3.2" cy="10.2" r="1"/><circle cx="6.4" cy="10.2" r="1"/><circle cx="9.6" cy="10.2" r="1"/></g>`;
    case 'EUR':
      return `<rect width="24" height="24" fill="#003399"/>`
        + `<g fill="#ffcc00">`
        + `<circle cx="12" cy="4.5" r="1.15"/><circle cx="15.8" cy="5.5" r="1.15"/><circle cx="18.5" cy="8.2" r="1.15"/>`
        + `<circle cx="19.5" cy="12" r="1.15"/><circle cx="18.5" cy="15.8" r="1.15"/><circle cx="15.8" cy="18.5" r="1.15"/>`
        + `<circle cx="12" cy="19.5" r="1.15"/><circle cx="8.2" cy="18.5" r="1.15"/><circle cx="5.5" cy="15.8" r="1.15"/>`
        + `<circle cx="4.5" cy="12" r="1.15"/><circle cx="5.5" cy="8.2" r="1.15"/><circle cx="8.2" cy="5.5" r="1.15"/>`
        + `</g>`;
    case 'GBP':
      return `<rect width="24" height="24" fill="#012169"/>`
        + `<path d="M0 0L24 24M24 0L0 24" stroke="#ffffff" stroke-width="4.6"/>`
        + `<path d="M0 0L24 24M24 0L0 24" stroke="#c8102e" stroke-width="2.4"/>`
        + `<path d="M12 0v24M0 12h24" stroke="#ffffff" stroke-width="6.8"/>`
        + `<path d="M12 0v24M0 12h24" stroke="#c8102e" stroke-width="4"/>`;
    case 'JPY':
      return `<rect width="24" height="24" fill="#f8fafc"/>`
        + `<circle cx="12" cy="12" r="6.2" fill="#bc002d"/>`;
    case 'CHF':
      return `<rect width="24" height="24" fill="#d52b1e"/>`
        + `<path d="M10 5.5h4v4.5h4.5v4H14v4.5h-4V14H5.5v-4H10z" fill="#ffffff"/>`;
    case 'AUD':
      return `<rect width="24" height="24" fill="#012169"/>`
        + `<path d="M0 0h12v12H0z" fill="#012169"/>`
        + `<path d="M0 0l12 12M12 0L0 12" stroke="#ffffff" stroke-width="2.4"/>`
        + `<path d="M6 0v12M0 6h12" stroke="#ffffff" stroke-width="3.6"/>`
        + `<path d="M6 0v12M0 6h12" stroke="#c8102e" stroke-width="2"/>`
        + `<g fill="#ffffff"><circle cx="6" cy="17.5" r="1.8"/><circle cx="17.5" cy="6" r="1.2"/><circle cx="14.5" cy="11.5" r="1.2"/><circle cx="19.5" cy="11" r="1.2"/><circle cx="17.5" cy="17.5" r="1.3"/></g>`;
    case 'CAD':
      return `<rect width="24" height="24" fill="#f8fafc"/>`
        + `<rect width="6" height="24" fill="#d80621"/><rect x="18" width="6" height="24" fill="#d80621"/>`
        + `<path d="M12 6l1.4 3.2 2.8-.6-1.6 2.8 2.2 1.2-3.6.6v3.3h-2.4v-3.3l-3.6-.6 2.2-1.2-1.6-2.8 2.8.6z" fill="#d80621"/>`;
    case 'NZD':
      return `<rect width="24" height="24" fill="#00247d"/>`
        + `<path d="M0 0l12 12M12 0L0 12" stroke="#ffffff" stroke-width="2.2"/>`
        + `<path d="M6 0v12M0 6h12" stroke="#ffffff" stroke-width="3.4"/>`
        + `<path d="M6 0v12M0 6h12" stroke="#cc142b" stroke-width="2"/>`
        + `<g fill="#cc142b" stroke="#ffffff" stroke-width="0.6"><circle cx="17.5" cy="6.2" r="1.4"/><circle cx="14.8" cy="11.5" r="1.4"/><circle cx="19.5" cy="11.5" r="1.4"/><circle cx="17.5" cy="17.5" r="1.5"/></g>`;
    case 'CNY':
    case 'CNH':
      return `<rect width="24" height="24" fill="#de2910"/>`
        + `<circle cx="7.5" cy="8.5" r="2.6" fill="#ffde00"/>`
        + `<g fill="#ffde00"><circle cx="12.8" cy="4.8" r="0.9"/><circle cx="14.8" cy="7.2" r="0.9"/><circle cx="14.5" cy="10.2" r="0.9"/><circle cx="12.5" cy="12.4" r="0.9"/></g>`;
    case 'HKD':
      return `<rect width="24" height="24" fill="#de2910"/>`
        + `<circle cx="12" cy="12" r="5" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-dasharray="4 2.2"/>`;
    case 'SGD':
      return `<rect width="24" height="12" fill="#ef3340"/><rect y="12" width="24" height="12" fill="#ffffff"/>`
        + `<circle cx="8.2" cy="6.2" r="3.2" fill="#ffffff"/><circle cx="9.4" cy="6.2" r="2.7" fill="#ef3340"/>`;
    case 'SEK':
      return `<rect width="24" height="24" fill="#006aa7"/>`
        + `<path d="M9 0h3.6v24H9zM0 10.2h24v3.6H0z" fill="#fecc02"/>`;
    case 'NOK':
      return `<rect width="24" height="24" fill="#ba0c2f"/>`
        + `<path d="M8.2 0h5.2v24H8.2zM0 9.4h24v5.2H0z" fill="#ffffff"/>`
        + `<path d="M9.4 0h2.8v24H9.4zM0 10.6h24v2.8H0z" fill="#00205b"/>`;
    case 'DKK':
      return `<rect width="24" height="24" fill="#c8102e"/>`
        + `<path d="M9 0h3.4v24H9zM0 10.3h24v3.4H0z" fill="#ffffff"/>`;
    case 'PLN':
      return `<rect width="24" height="12" fill="#ffffff"/><rect y="12" width="24" height="12" fill="#dc143c"/>`;
    case 'TRY':
      return `<rect width="24" height="24" fill="#e30a17"/>`
        + `<circle cx="10.5" cy="12" r="4.8" fill="#ffffff"/><circle cx="12" cy="12" r="3.8" fill="#e30a17"/>`
        + `<circle cx="16.2" cy="12" r="1.6" fill="#ffffff"/>`;
    case 'ZAR':
      return `<rect width="24" height="12" fill="#e03c31"/><rect y="12" width="24" height="12" fill="#001489"/>`
        + `<path d="M0 3l11 9-11 9" fill="#000000" stroke="#ffb81c" stroke-width="2"/>`
        + `<path d="M0 0l12 12L0 24M11 12h13" stroke="#007749" stroke-width="4.4" fill="none"/>`;
    case 'MXN':
      return `<rect width="8" height="24" fill="#006847"/><rect x="8" width="8" height="24" fill="#ffffff"/><rect x="16" width="8" height="24" fill="#ce1126"/>`
        + `<circle cx="12" cy="12" r="2.1" fill="#854d0e"/>`;
    case 'BRL':
      return `<rect width="24" height="24" fill="#009b3a"/>`
        + `<polygon points="12,4 20,12 12,20 4,12" fill="#fedf00"/>`
        + `<circle cx="12" cy="12" r="3.8" fill="#002776"/>`;
    case 'INR':
      return `<rect width="24" height="8" fill="#ff9933"/><rect y="8" width="24" height="8" fill="#ffffff"/><rect y="16" width="24" height="8" fill="#138808"/>`
        + `<circle cx="12" cy="12" r="2.6" fill="none" stroke="#000080" stroke-width="1.3"/>`;
    case 'RUB':
      return `<rect width="24" height="8" fill="#ffffff"/><rect y="8" width="24" height="8" fill="#0039a6"/><rect y="16" width="24" height="8" fill="#d52b1e"/>`;
    default:
      return `<rect width="24" height="24" fill="${hashPaletteColor(currency)}"/>`
        + `<text x="12" y="15.5" text-anchor="middle" fill="#ffffff" font-family="Inter,system-ui,sans-serif" font-size="9.5" font-weight="700">${currency.slice(0, 3)}</text>`;
  }
}

/** Draw the interior artwork of a commodity/metal/energy badge inside a 0..24 space. */
function commodityInnerSvg(code: string): string {
  switch (code) {
    case 'XAU':
      return `<rect width="24" height="24" fill="#d69a00"/>`
        + `<path d="M5.2 16h6.2l-1.1-2.8H6.3L5.2 16zm7.4 0h6.2l-1.1-2.8h-4L12.6 16zM8.8 12h6.4L14 9.2h-4L8.8 12z" fill="#ffffff"/>`;
    case 'XAG':
      return `<rect width="24" height="24" fill="#8f96a3"/>`
        + `<path d="M5.2 16h6.2l-1.1-2.8H6.3L5.2 16zm7.4 0h6.2l-1.1-2.8h-4L12.6 16zM8.8 12h6.4L14 9.2h-4L8.8 12z" fill="#ffffff"/>`;
    case 'XPT':
    case 'XPD':
      return `<rect width="24" height="24" fill="#475569"/>`
        + `<path d="M5.2 16h6.2l-1.1-2.8H6.3L5.2 16zm7.4 0h6.2l-1.1-2.8h-4L12.6 16zM8.8 12h6.4L14 9.2h-4L8.8 12z" fill="#f8fafc"/>`;
    case 'OIL':
      return `<rect width="24" height="24" fill="#242730"/>`
        + `<path d="M12 5C12 5 7.4 10.6 7.4 14A4.6 4.6 0 0 0 16.6 14C16.6 10.6 12 5 12 5z" fill="#ffffff"/>`;
    case 'NG':
      return `<rect width="24" height="24" fill="#0369a1"/>`
        + `<path d="M12.5 4.5c.6 3.1-2.5 4.8-2.5 8a3.8 3.8 0 0 0 7.2 1.6c.7-2.2-.8-4.5-1.7-5.6-.3 1.4-1.3 2.1-1.8 1.5-.6-.8.2-3.1-1.2-5.5z" fill="#38bdf8"/>`
        + `<path d="M12.2 11.8c-.8 1.2-1.2 2.1-.8 3.2a2 2 0 0 0 3.6-.4c.2-.9-.5-1.9-1.2-2.8-.4.6-.9.6-1.6 0z" fill="#e0f2fe"/>`;
    case 'HG':
      return `<rect width="24" height="24" fill="#b45309"/>`
        + `<path d="M5.5 15h13l-2-4.5h-9L5.5 15zm2.5-6h8l-1.2-2.5H9.2L8 9z" fill="#fde68a"/>`;
    default:
      return `<rect width="24" height="24" fill="#ca8a04"/>`
        + `<circle cx="12" cy="12" r="5" fill="#fef08a"/>`;
  }
}

/** Compose two overlapping circular 24x24 badges in a 24x24 viewBox (TradingView style: base bottom-left in front, quote top-right behind). */
function renderDualPairSvg(baseInner: string, quoteInner: string, idPrefix: string): string {
  const baseClip = `${idPrefix}-b`;
  const quoteClip = `${idPrefix}-q`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%">`
    + `<defs>`
    + `<clipPath id="${quoteClip}"><circle cx="15" cy="9" r="7.5"/></clipPath>`
    + `<clipPath id="${baseClip}"><circle cx="9" cy="15" r="7.8"/></clipPath>`
    + `</defs>`
    + `<g clip-path="url(#${quoteClip})"><g transform="translate(7.5 1.5) scale(0.625)">${quoteInner}</g></g>`
    + `<circle cx="9" cy="15" r="8.9" fill="#000000" fill-opacity="0.88"/>`
    + `<g clip-path="url(#${baseClip})"><g transform="translate(1.2 7.2) scale(0.65)">${baseInner}</g></g>`
    + `</svg>`;
}

/** Wrap a 24x24 inner artwork into a single circular badge SVG. */
function renderSingleCircleSvg(inner: string, clipId: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%">`
    + `<defs><clipPath id="${clipId}"><circle cx="12" cy="12" r="11"/></clipPath></defs>`
    + `<g clip-path="url(#${clipId})">${inner}</g>`
    + `<circle cx="12" cy="12" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="0.7"/>`
    + `</svg>`;
}

/** Render a crypto circular icon in a 24x24 viewBox. */
function renderCryptoSvg(ticker: string): string {
  const style = CRYPTO_STYLES[ticker];
  const bg = style?.bg ?? hashPaletteColor(ticker);
  const fg = style?.fg ?? '#ffffff';
  const glyph = style?.glyph;
  let content = '';
  switch (glyph) {
    case 'btc':
      content = `<path d="M15.6 10.6c.2-1.3-.8-2-2.2-2.5l.4-1.8-1.1-.3-.4 1.7-.9-.2.4-1.7-1.1-.3-.4 1.8-1.8-.4-.3 1.2s.8.2.8.2c.4.1.5.4.5.6l-1.2 4.9c-.1.2-.3.4-.6.3l-.8-.2-.5 1.3 1.7.4-.4 1.8 1.1.3.4-1.8.9.2-.4 1.8 1.1.3.4-1.8c1.9.3 3.3.2 3.9-1.5.5-1.4 0-2.2-1-2.7.7-.2 1.2-.7 1.4-1.7zm-2.5 3.5c-.3 1.4-2.6.6-3.4.4l.6-2.4c.8.2 3.1.6 2.8 2zm.3-3.5c-.3 1.2-2.2.6-2.8.4l.5-2.2c.6.2 2.6.5 2.3 1.8z" fill="${fg}"/>`;
      break;
    case 'eth':
      content = `<path d="M12 4.2L7.3 12 12 14.8 16.7 12 12 4.2z" fill="${fg}" fill-opacity="0.92"/>`
        + `<path d="M7.3 13.1L12 19.8l4.7-6.7L12 15.9 7.3 13.1z" fill="${fg}" fill-opacity="0.75"/>`;
      break;
    case 'sol':
      content = `<path d="M7.2 15.4h8.4l1.2-1.8H8.4l-1.2 1.8zm0-6h8.4l1.2-1.8H8.4L7.2 9.4zm9.6 1.9H8.4l-1.2 1.8h8.4l1.2-1.8z" fill="#14f195"/>`;
      break;
    case 'bnb':
      content = `<path d="M12 6l2.3 2.3-1.3 1.3L12 8.6l-1 1-1.3-1.3L12 6zm-3.7 3.7L9.6 11l-1.3 1.3L7 11l1.3-1.3zm7.4 0L17 11l-1.3 1.3-1.3-1.3 1.3-1.3zM12 10.7l1.3 1.3-1.3 1.3-1.3-1.3 1.3-1.3zm-2.3 3.7l1.3-1.3 1 1 1-1 1.3 1.3L12 16.7l-2.3-2.3z" fill="${fg}"/>`;
      break;
    case 'xrp':
      content = `<path d="M7.2 7.2h1.9l2.9 2.9 2.9-2.9h1.9l-3.8 3.9 3.8 3.9h-1.9L12 12.1l-2.9 2.9H7.2L11 11.1 7.2 7.2z" fill="${fg}"/>`;
      break;
    case 'usdt':
      content = `<path d="M13 10.6V9.2h3.2V7.4H7.8v1.8H11v1.4c-2.6.1-4.6.6-4.6 1.3s2 1.2 4.6 1.3v4.2h2v-4.2c2.6-.1 4.6-.6 4.6-1.3s-2-1.2-4.6-1.3z" fill="${fg}"/>`;
      break;
    case 'usdc':
      content = `<text x="12" y="15.8" text-anchor="middle" fill="${fg}" font-family="Inter,system-ui,sans-serif" font-size="11.5" font-weight="700">$</text>`;
      break;
    case 'doge':
      content = `<text x="12" y="15.8" text-anchor="middle" fill="${fg}" font-family="Inter,system-ui,sans-serif" font-size="11.5" font-weight="800">Ð</text>`;
      break;
    case 'ltc':
      content = `<path d="M10.8 7h2.2l-1.1 4.4 1.6-.6-.4 1.5-1.6.6-.5 2.1h4.2l-.5 2H8.5l1.2-4.7-1.4.5.4-1.5 1.4-.5L10.8 7z" fill="${fg}"/>`;
      break;
    case 'link':
      content = `<polygon points="12,6.2 16.8,9 16.8,15 12,17.8 7.2,15 7.2,9" fill="none" stroke="${fg}" stroke-width="2"/>`;
      break;
    case 'avax':
      content = `<path d="M12 6.5L6.8 16h2.8l2.4-4.6 1.1 2.1h2.3L12 6.5zm2.5 6.8l-1.4 2.7h2.8l-1.4-2.7z" fill="${fg}"/>`;
      break;
    default: {
      const label = ticker.length <= 3 ? ticker : ticker.slice(0, 3);
      const fontSize = label.length === 1 ? '11' : label.length === 2 ? '9.5' : '7.8';
      content = `<text x="12" y="15.2" text-anchor="middle" fill="${fg}" font-family="Inter,system-ui,sans-serif" font-size="${fontSize}" font-weight="700">${label}</text>`;
      break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%">`
    + `<circle cx="12" cy="12" r="11" fill="${bg}"/>`
    + content
    + `<circle cx="12" cy="12" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="0.7"/>`
    + `</svg>`;
}

function renderBadgeCircleSvg(badge: string, bg: string, fg = '#ffffff'): string {
  const fontSize = badge.length === 1 ? '12' : badge.length === 2 ? '9.8' : '8';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%">`
    + `<circle cx="12" cy="12" r="11" fill="${bg}"/>`
    + `<text x="12" y="15.3" text-anchor="middle" fill="${fg}" font-family="Inter,system-ui,sans-serif" font-size="${fontSize}" font-weight="700">${badge}</text>`
    + `<circle cx="12" cy="12" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="0.7"/>`
    + `</svg>`;
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Normalize a raw symbol string into clean uppercase tokens and stripped ticker. */
export function parseInstrumentSymbol(rawSymbol: string, provider?: string, assetClass?: string): {
  raw: string;
  clean: string;
  provider: string;
  assetClass: string;
  tokens: string[];
} {
  const trimmed = String(rawSymbol ?? '').trim().toUpperCase();
  const colonIdx = trimmed.indexOf(':');
  const extractedProvider = colonIdx > 0 ? trimmed.slice(0, colonIdx).toLowerCase() : (provider ?? '').toLowerCase();
  const withoutProvider = colonIdx > 0 ? trimmed.slice(colonIdx + 1) : trimmed;
  // Strip dated futures expiry tails like _202612, .P, @, etc. when tokenizing
  const withoutPerp = withoutProvider.replace(/\.P$/, '');
  const tokens = withoutPerp.split(/[_\-\/:@\s]+/).filter(Boolean);
  const clean = withoutPerp.replace(/[^A-Z0-9]/g, '');
  return {
    raw: withoutProvider,
    clean,
    provider: extractedProvider,
    assetClass: (assetClass ?? '').toLowerCase(),
    tokens,
  };
}

/**
 * Resolve any DeplyzeView market symbol (FX pair, Gold/Commodity, Crypto, Index, Futures, Equity)
 * into a TradingView-style SVG icon descriptor and data URI.
 */
export function resolveAssetIcon(
  rawSymbol: string,
  provider?: string,
  assetClass?: string
): ResolvedAssetIcon {
  const parsed = parseInstrumentSymbol(rawSymbol, provider, assetClass);
  const { clean, tokens } = parsed;
  const idSeed = clean.toLowerCase() || 'sym';

  // 1. Explicit two-token pairs (e.g., EUR_USD, GBP_JPY, XAU_USD, WTICO_USD, BTC-USD, SPX500_USD)
  if (tokens.length >= 2) {
    const [first, second] = tokens;
    if (CURRENCY_CODES.has(first) && CURRENCY_CODES.has(second)) {
      const svg = renderDualPairSvg(flagInnerSvg(first), flagInnerSvg(second), `fx-${idSeed}`);
      return { kind: 'forex', symbol: parsed.raw, base: first, quote: second, label: `${first}/${second}`, svg, dataUri: svgToDataUri(svg) };
    }
    if (COMMODITY_PREFIXES[first]) {
      const comm = COMMODITY_PREFIXES[first];
      const quote = CURRENCY_CODES.has(second) ? second : null;
      const svg = renderSingleCircleSvg(commodityInnerSvg(comm.code), `cm-${idSeed}`);
      return { kind: 'commodity', symbol: parsed.raw, base: comm.code, quote, label: comm.name, svg, dataUri: svgToDataUri(svg) };
    }
    if (INDEX_MAP[first]) {
      const idx = INDEX_MAP[first];
      const svg = renderBadgeCircleSvg(idx.badge, idx.bg, idx.fg);
      return { kind: 'index', symbol: parsed.raw, base: first, quote: CURRENCY_CODES.has(second) ? second : null, label: idx.label, svg, dataUri: svgToDataUri(svg) };
    }
    if (CRYPTO_STYLES[first] || ['binance', 'coinbase', 'hyperliquid'].includes(parsed.provider) || parsed.assetClass === 'crypto') {
      const svg = renderCryptoSvg(first);
      return { kind: 'crypto', symbol: parsed.raw, base: first, quote: second, label: first, svg, dataUri: svgToDataUri(svg) };
    }
  }

  // 2. Concatenated 6-letter FX or Commodity pairs (e.g. EURUSD, GBPUSD, USDJPY, XAUUSD, XAGUSD)
  if (clean.length === 6) {
    const base = clean.slice(0, 3);
    const quote = clean.slice(3, 6);
    if (COMMODITY_PREFIXES[base] && CURRENCY_CODES.has(quote)) {
      const comm = COMMODITY_PREFIXES[base];
      const svg = renderSingleCircleSvg(commodityInnerSvg(comm.code), `cm-${idSeed}`);
      return { kind: 'commodity', symbol: parsed.raw, base: comm.code, quote, label: comm.name, svg, dataUri: svgToDataUri(svg) };
    }
    if (CURRENCY_CODES.has(base) && CURRENCY_CODES.has(quote)) {
      const svg = renderDualPairSvg(flagInnerSvg(base), flagInnerSvg(quote), `fx-${idSeed}`);
      return { kind: 'forex', symbol: parsed.raw, base, quote, label: `${base}/${quote}`, svg, dataUri: svgToDataUri(svg) };
    }
  }

  // 3. Standalone or futures commodity tickers (e.g. XAU, GOLD, USOIL, UKOIL, WTI, GC, CL, SI, NG, HG, GCZ26)
  const rootToken = (tokens[0] ?? clean).replace(/[FGHJKMNQUVXZ]\d{1,4}$/, '');
  for (const candidate of [clean, tokens[0], rootToken]) {
    if (!candidate) continue;
    if (COMMODITY_PREFIXES[candidate]) {
      const comm = COMMODITY_PREFIXES[candidate];
      const svg = renderSingleCircleSvg(commodityInnerSvg(comm.code), `cm-${idSeed}`);
      return { kind: 'commodity', symbol: parsed.raw, base: comm.code, quote: null, label: comm.name, svg, dataUri: svgToDataUri(svg) };
    }
    if (INDEX_MAP[candidate]) {
      const idx = INDEX_MAP[candidate];
      const svg = renderBadgeCircleSvg(idx.badge, idx.bg, idx.fg);
      return { kind: 'index', symbol: parsed.raw, base: candidate, quote: null, label: idx.label, svg, dataUri: svgToDataUri(svg) };
    }
  }

  // 4. Commodity prefix with currency suffix (e.g. USOILUSD, WTICOUSD, BCOUSD)
  for (const [prefix, comm] of Object.entries(COMMODITY_PREFIXES)) {
    if (clean.startsWith(prefix) && clean.length === prefix.length + 3) {
      const quote = clean.slice(prefix.length);
      if (CURRENCY_CODES.has(quote)) {
        const svg = renderSingleCircleSvg(commodityInnerSvg(comm.code), `cm-${idSeed}`);
        return { kind: 'commodity', symbol: parsed.raw, base: comm.code, quote, label: comm.name, svg, dataUri: svgToDataUri(svg) };
      }
    }
  }

  // 5. Crypto tickers with or without quote suffixes (e.g. BTCUSDT, ETHUSDC, SOLUSD, BTC, ETH, SOL)
  for (const suffix of CRYPTO_QUOTE_SUFFIXES) {
    if (clean.endsWith(suffix) && clean.length > suffix.length) {
      const base = clean.slice(0, -suffix.length);
      if (CRYPTO_STYLES[base] || ['binance', 'coinbase', 'hyperliquid'].includes(parsed.provider) || parsed.assetClass === 'crypto') {
        const svg = renderCryptoSvg(base);
        return { kind: 'crypto', symbol: parsed.raw, base, quote: suffix, label: base, svg, dataUri: svgToDataUri(svg) };
      }
    }
  }
  if (CRYPTO_STYLES[clean] || ['binance', 'coinbase', 'hyperliquid'].includes(parsed.provider) || parsed.assetClass === 'crypto') {
    const base = tokens[0] || clean || '?';
    const svg = renderCryptoSvg(base);
    return { kind: 'crypto', symbol: parsed.raw, base, quote: null, label: base, svg, dataUri: svgToDataUri(svg) };
  }

  // 6. Stocks / Equities
  if (STOCK_STYLES[clean]) {
    const st = STOCK_STYLES[clean];
    const svg = renderBadgeCircleSvg(clean.slice(0, 2), st.bg);
    return { kind: 'stock', symbol: parsed.raw, base: clean, quote: null, label: st.label, svg, dataUri: svgToDataUri(svg) };
  }

  // 7. Monogram fallback
  const fallbackBase = (tokens[0] || clean || '?').slice(0, 3);
  const svg = renderBadgeCircleSvg(fallbackBase.slice(0, 2), hashPaletteColor(clean || fallbackBase));
  return { kind: 'monogram', symbol: parsed.raw || '?', base: fallbackBase, quote: null, label: parsed.raw || '?', svg, dataUri: svgToDataUri(svg) };
}

export function resolveAssetIconDataUri(rawSymbol: string, provider?: string, assetClass?: string): string {
  return resolveAssetIcon(rawSymbol, provider, assetClass).dataUri;
}

/** Format a symbol in TradingView compact display style (e.g. XAU_USD -> XAUUSD, GBP_USD -> GBPUSD). */
export function formatDisplaySymbol(rawSymbol: string): string {
  const trimmed = String(rawSymbol ?? '').trim();
  const withoutProvider = trimmed.includes(':') ? trimmed.split(':').slice(1).join(':') : trimmed;
  return withoutProvider.replace(/[_-]/g, '');
}

const DESCRIPTIVE_TITLES: Record<string, string> = {
  XAUUSD: 'Gold Spot / U.S. Dollar',
  XAGUSD: 'Silver Spot / U.S. Dollar',
  WTICOUSD: 'WTI Crude Oil / U.S. Dollar',
  BCOUSD: 'Brent Crude Oil / U.S. Dollar',
  USOIL: 'WTI Crude Oil',
  UKOIL: 'Brent Crude Oil',
  EURUSD: 'Euro / U.S. Dollar',
  GBPUSD: 'British Pound / U.S. Dollar',
  USDJPY: 'U.S. Dollar / Japanese Yen',
  USDCHF: 'U.S. Dollar / Swiss Franc',
  AUDUSD: 'Australian Dollar / U.S. Dollar',
  USDCAD: 'U.S. Dollar / Canadian Dollar',
  NZDUSD: 'New Zealand Dollar / U.S. Dollar',
  EURGBP: 'Euro / British Pound',
  EURJPY: 'Euro / Japanese Yen',
  GBPJPY: 'British Pound / Japanese Yen',
  BTCUSDT: 'Bitcoin / TetherUS',
  BTCUSD: 'Bitcoin / U.S. Dollar',
  ETHUSDT: 'Ethereum / TetherUS',
  ETHUSD: 'Ethereum / U.S. Dollar',
  SOLUSDT: 'Solana / TetherUS',
  SOLUSD: 'Solana / U.S. Dollar',
};

export function formatDescriptiveSymbolTitle(rawSymbol: string): string {
  const clean = formatDisplaySymbol(rawSymbol).toUpperCase();
  return DESCRIPTIVE_TITLES[clean] ?? clean;
}

export type OrderQuoteParts = {
  sellMain: string;
  sellPip: string;
  buyMain: string;
  buyPip: string;
  spread: string;
};

/** Compute TradingView-style Bid (SELL) / Ask (BUY) display parts and spread from a live reference price. */
export function formatOrderQuoteParts(price: number | null | undefined, rawSymbol: string): OrderQuoteParts {
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { sellMain: '—', sellPip: '', buyMain: '—', buyPip: '', spread: '0.0' };
  }
  const clean = formatDisplaySymbol(rawSymbol).toUpperCase();
  const isGold = /^XAU|GOLD/.test(clean);
  const isSilver = /^XAG|SILVER/.test(clean);
  const isJpyFx = /^[A-Z]{3}JPY$/.test(clean);
  const isStandardFx = !isGold && !isSilver && !isJpyFx && /^[A-Z]{6}$/.test(clean) && !/(USDT|USDC|BUSD|PERP)$/.test(clean);

  if (isGold) {
    const halfSpread = 0.26;
    const sell = price - halfSpread;
    const buy = price + halfSpread;
    const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return { sellMain: fmt.format(sell), sellPip: '0', buyMain: fmt.format(buy), buyPip: '0', spread: '52.0' };
  }
  if (isSilver) {
    const halfSpread = 0.015;
    const sell = price - halfSpread;
    const buy = price + halfSpread;
    const sFixed = sell.toFixed(4);
    const bFixed = buy.toFixed(4);
    return { sellMain: sFixed.slice(0, -1), sellPip: sFixed.slice(-1), buyMain: bFixed.slice(0, -1), buyPip: bFixed.slice(-1), spread: '3.0' };
  }
  if (isJpyFx) {
    const halfSpread = 0.006;
    const sell = price - halfSpread;
    const buy = price + halfSpread;
    const sFixed = sell.toFixed(3);
    const bFixed = buy.toFixed(3);
    return { sellMain: sFixed.slice(0, -1), sellPip: sFixed.slice(-1), buyMain: bFixed.slice(0, -1), buyPip: bFixed.slice(-1), spread: '1.2' };
  }
  if (isStandardFx) {
    const halfSpread = 0.00006;
    const sell = price - halfSpread;
    const buy = price + halfSpread;
    const sFixed = sell.toFixed(5);
    const bFixed = buy.toFixed(5);
    return { sellMain: sFixed.slice(0, -1), sellPip: sFixed.slice(-1), buyMain: bFixed.slice(0, -1), buyPip: bFixed.slice(-1), spread: '1.2' };
  }
  const decimals = price < 1 ? 5 : 2;
  const tick = 10 ** -decimals;
  const halfSpread = tick * 2;
  const sell = price - halfSpread;
  const buy = price + halfSpread;
  const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return { sellMain: fmt.format(sell), sellPip: '', buyMain: fmt.format(buy), buyPip: '', spread: (halfSpread * 2 / tick).toFixed(1) };
}

