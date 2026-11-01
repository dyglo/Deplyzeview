import { registerChartType, registerRendererLayer } from '@luxalgo/vela/plugin';
import type { ChartConfig } from '@luxalgo/vela';

export { chartStyles, isChartStyle, type ChartStyleId } from './chart-style-catalog.ts';

let candleAppearance: ChartConfig['candles'] | undefined;
export function setPriceAppearance(value: ChartConfig['candles']) { candleAppearance = value; }

// These styles preserve raw OHLC and time coordinates. No synthetic market data.
for (const id of ['hollow', 'columns']) registerChartType({ id, label: id === 'hollow' ? 'Hollow Candles' : 'Columns', basePainting: 'none' });
registerRendererLayer({
  id: 'vela-price-styles',
  create() {
    let canvas: HTMLCanvasElement;
    return {
      mount(element) { canvas = element; },
      render({ priceStyle, bars, coords, scale, bounds }) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = coords.dpr || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        if (priceStyle !== 'hollow' && priceStyle !== 'columns') return;
        const c = candleAppearance;
        if (!c) return;
        const { from, to } = coords.visibleLogicalRange();
        const width = Math.max(1, coords.bodySpacing() * .7);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, bounds.top, coords.width, bounds.height); ctx.clip();
        for (let i = Math.max(0, Math.floor(from)); i <= Math.min(bars.length - 1, Math.ceil(to)); i++) {
          const b = bars[i];
          const x = coords.logicalToX(i);
          const y = (price: number) => coords.priceToY(price, scale, bounds);
          const up = priceStyle === 'hollow' ? b.close >= (bars[i - 1]?.close ?? b.open) : b.close >= b.open;
          const color = (up ? c.upColor : c.downColor) || (up ? '#8a746e' : '#c16f61');
          ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1;
          if (priceStyle === 'columns') {
            // Price columns start at zero; the pane clips zero when it lies off-scale.
            const bottom = scale.log ? bounds.top + bounds.height : y(0);
            ctx.fillRect(x - width / 2, Math.min(y(b.close), bottom), width, Math.max(1, Math.abs(bottom - y(b.close))));
            continue;
          }
          if (c.wickVisible !== false) {
            ctx.strokeStyle = (up ? c.wickUpColor : c.wickDownColor) || color;
            ctx.beginPath(); ctx.moveTo(x, y(b.high)); ctx.lineTo(x, y(Math.max(b.open, b.close))); ctx.moveTo(x, y(Math.min(b.open, b.close))); ctx.lineTo(x, y(b.low)); ctx.stroke();
          }
          const top = Math.min(y(b.open), y(b.close));
          const height = Math.max(1, Math.abs(y(b.open) - y(b.close)));
          // Hollow = close >= open; color = close vs previous close, independently.
          if (b.close < b.open && c.bodyVisible !== false) ctx.fillRect(x - width / 2, top, width, height);
          if (c.borderVisible !== false) {
            ctx.strokeStyle = (up ? c.borderUpColor : c.borderDownColor) || color;
            ctx.strokeRect(x - width / 2, top, width, height);
          }
        }
        ctx.restore();
      },
    };
  },
});
