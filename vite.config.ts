import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function transformVelaCandleRendering(code: string): string {
  if (!code.includes('function candleGeometry(xCss, spacing, dpr')) return code;
  let next = code;

  // 1. Crisp 1px wicks and device-pixel-snapped candle geometry with guaranteed inter-candle gap
  next = next.replace(
    `var CANDLE_WICK_W = 1.5;
var CANDLE_AGG_MAX_SPACING = 1;
function wickWidth(spacing) {
  const halfBody = Math.max(0.5, Math.floor(spacing * 0.7) / 2);
  return Math.max(1, Math.min(CANDLE_WICK_W, halfBody));
}
function candleTier(spacing) {
  if (spacing < CANDLE_AGG_MAX_SPACING) return "aggregate";
  if (spacing < CANDLE_BODY_MIN_SPACING) return "wick";
  return "full";
}
function snapY(yCss, dpr) {
  return Math.round(yCss * dpr) / dpr;
}
function candleGeometry(xCss, spacing, dpr, bodyScale = 1) {
  const wickDev = Math.max(1, Math.round(wickWidth(spacing) * dpr));
  const wickLeftDev = Math.round(xCss * dpr - wickDev / 2);
  let bodyDev = Math.max(wickDev, Math.round(Math.floor(spacing * 0.7 * bodyScale) * dpr));
  if ((bodyDev - wickDev) % 2 !== 0) bodyDev += 1;
  const sideDev = (bodyDev - wickDev) / 2;
  return {
    wickX: wickLeftDev / dpr,
    wickW: wickDev / dpr,
    bodyX: (wickLeftDev - sideDev) / dpr,
    bodyW: bodyDev / dpr,
    center: (wickLeftDev + wickDev / 2) / dpr
  };
}`,
    `var CANDLE_WICK_W = 1;
var CANDLE_AGG_MAX_SPACING = 1;
function wickWidth(spacing) {
  const halfBody = Math.max(0.5, Math.floor(spacing * 0.74) / 2);
  return Math.max(1, Math.min(CANDLE_WICK_W, halfBody));
}
function candleTier(spacing) {
  if (spacing < CANDLE_AGG_MAX_SPACING) return "aggregate";
  if (spacing < CANDLE_BODY_MIN_SPACING) return "wick";
  return "full";
}
function snapY(yCss, dpr) {
  return Math.round(yCss * dpr) / dpr;
}
function candleGeometry(xCss, spacing, dpr, bodyScale = 1) {
  const pitchDev = spacing * dpr;
  const wickDev = Math.max(1, Math.round(wickWidth(spacing) * dpr));
  const wickLeftDev = Math.round(xCss * dpr - wickDev / 2);
  const minGapDev = pitchDev >= 6 ? Math.max(2, Math.round(dpr * 1.5)) : 1;
  const maxBodyDev = Math.max(wickDev, Math.floor(pitchDev) - minGapDev);
  let bodyDev = Math.max(wickDev, Math.min(maxBodyDev, Math.round(pitchDev * 0.74 * bodyScale)));
  if ((bodyDev - wickDev) % 2 !== 0) {
    bodyDev = bodyDev + 1 <= maxBodyDev ? bodyDev + 1 : Math.max(wickDev, bodyDev - 1);
  }
  const sideDev = (bodyDev - wickDev) / 2;
  return {
    wickX: wickLeftDev / dpr,
    wickW: wickDev / dpr,
    bodyX: (wickLeftDev - sideDev) / dpr,
    bodyW: bodyDev / dpr,
    center: (wickLeftDev + wickDev / 2) / dpr
  };
}`,
  );

  // 2. Render flat/newly-opened candles (high === low) in aggregated and OHLC bar modes
  next = next.replace(
    `  for (let i = i0; i <= i1; i += 1) {
    const b = bars[i];
    if (!b || b.high <= b.low) continue;`,
    `  for (let i = i0; i <= i1; i += 1) {
    const b = bars[i];
    if (!b || b.high < b.low) continue;`,
  );
  next = next.replace(
    `    for (let i = i0; i <= i1; i += 1) {
      const bar = bars[i];
      if (!bar || bar.high <= bar.low) continue;`,
    `    for (let i = i0; i <= i1; i += 1) {
      const bar = bars[i];
      if (!bar || bar.high < bar.low) continue;`,
  );

  // 3. WebGL2 emitCandles & emitCandlesAggregated: crisp device-pixel bodies/borders, visible wicks on small candles, flat bar support
  next = next.replace(
    `    for (let i = i0; i <= i1; i += 1) {
      const bar = bars[i];
      if (!bar || bar.high <= bar.low) continue;
      const g = candleGeometry(coords.logicalToX(i), spacing, coords.dpr, this.candleBodyScale);
      const isUp = bar.close >= bar.open;
      const dir = isUp ? up : down;
      const bc = barColors.get(bar.time);
      const bodyColorStr = bc ?? dir;
      const c = parseColor(bodyColorStr);
      let bodyTop = 0;
      let bodyH = 0;
      if (drawBody) {
        const oY = coords.priceToY(bar.open, pane.scale, pane.bounds);
        const cY = coords.priceToY(bar.close, pane.scale, pane.bounds);
        bodyTop = snapY(Math.min(oY, cY), coords.dpr);
        bodyH = Math.max(1 / coords.dpr, snapY(Math.max(oY, cY), coords.dpr) - bodyTop);
      }
      if (cs.wickVisible) {
        const hY = snapY(coords.priceToY(bar.high, pane.scale, pane.bounds), coords.dpr);
        const lY = snapY(coords.priceToY(bar.low, pane.scale, pane.bounds), coords.dpr);
        b.alpha = this.candleStructureAlpha;
        const wCol = parseColor((isUp ? cs.wickUpColor : cs.wickDownColor) ?? (drawBody ? dir : bodyColorStr));
        if (drawBody) {
          b.rect(g.wickX, hY, g.wickW, Math.max(0, bodyTop - hY), wCol);
          b.rect(g.wickX, bodyTop + bodyH, g.wickW, Math.max(0, lY - (bodyTop + bodyH)), wCol);
        } else {
          b.rect(g.wickX, hY, g.wickW, lY - hY, wCol);
        }
      }
      if (drawBody) {
        if (cs.bodyVisible) {
          b.alpha = this.candleBodyAlpha;
          b.rect(g.bodyX, bodyTop, g.bodyW, bodyH, c);
        }
        if (cs.borderVisible || fading && cs.bodyVisible) {
          b.alpha = this.candleStructureAlpha;
          const bord = cs.borderVisible ? parseColor((isUp ? cs.borderUpColor : cs.borderDownColor) ?? bodyColorStr) : c;
          const bw = Math.max(0, g.bodyW - 1);
          const bh = Math.max(0, bodyH - 1);
          b.rectStroke(g.bodyX + 0.5, bodyTop + 0.5, bw, bh, 1, bord);
        }
      }
    }`,
    `    const px = 1 / coords.dpr;
    for (let i = i0; i <= i1; i += 1) {
      const bar = bars[i];
      if (!bar || bar.high < bar.low) continue;
      const g = candleGeometry(coords.logicalToX(i), spacing, coords.dpr, this.candleBodyScale);
      const isUp = bar.close >= bar.open;
      const dir = isUp ? up : down;
      const bc = barColors.get(bar.time);
      const bodyColorStr = bc ?? dir;
      const c = parseColor(bodyColorStr);
      let bodyTop = 0;
      let bodyH = 0;
      if (drawBody) {
        const oY = coords.priceToY(bar.open, pane.scale, pane.bounds);
        const cY = coords.priceToY(bar.close, pane.scale, pane.bounds);
        bodyTop = snapY(Math.min(oY, cY), coords.dpr);
        bodyH = Math.max(px, snapY(Math.max(oY, cY), coords.dpr) - bodyTop);
      }
      if (cs.wickVisible) {
        const hY = snapY(coords.priceToY(bar.high, pane.scale, pane.bounds), coords.dpr);
        const lY = snapY(coords.priceToY(bar.low, pane.scale, pane.bounds), coords.dpr);
        b.alpha = this.candleStructureAlpha;
        const wCol = parseColor((isUp ? cs.wickUpColor : cs.wickDownColor) ?? (drawBody ? dir : bodyColorStr));
        if (drawBody) {
          const bodyHi = Math.max(bar.open, bar.close);
          const bodyLo = Math.min(bar.open, bar.close);
          const topWickH = bar.high > bodyHi ? Math.max(px, bodyTop - hY) : 0;
          const botWickH = bar.low < bodyLo ? Math.max(px, lY - (bodyTop + bodyH)) : 0;
          if (topWickH > 0) b.rect(g.wickX, bodyTop - topWickH, g.wickW, topWickH, wCol);
          if (botWickH > 0) b.rect(g.wickX, bodyTop + bodyH, g.wickW, botWickH, wCol);
        } else {
          b.rect(g.wickX, hY, g.wickW, Math.max(px, lY - hY), wCol);
        }
      }
      if (drawBody) {
        if (cs.bodyVisible) {
          b.alpha = this.candleBodyAlpha;
          b.rect(g.bodyX, bodyTop, g.bodyW, bodyH, c);
        }
        if (cs.borderVisible || fading && cs.bodyVisible) {
          const bord = cs.borderVisible ? parseColor((isUp ? cs.borderUpColor : cs.borderDownColor) ?? bodyColorStr) : c;
          const sameAsBody = cs.bodyVisible && !fading && bord[0] === c[0] && bord[1] === c[1] && bord[2] === c[2] && bord[3] === c[3];
          if (!sameAsBody) {
            b.alpha = this.candleStructureAlpha;
            if (bodyH <= 2 * px || g.bodyW <= 2 * px) {
              b.rect(g.bodyX, bodyTop, g.bodyW, bodyH, bord);
            } else {
              b.rect(g.bodyX, bodyTop, g.bodyW, px, bord);
              b.rect(g.bodyX, bodyTop + bodyH - px, g.bodyW, px, bord);
              b.rect(g.bodyX, bodyTop + px, px, bodyH - 2 * px, bord);
              b.rect(g.bodyX + g.bodyW - px, bodyTop + px, px, bodyH - 2 * px, bord);
            }
          }
        }
      }
    }`,
  );
  next = next.replace(
    `  emitCandlesAggregated(b, bars, i0, i1, coords, pane, colorOf2) {
    const yOf = (price) => coords.priceToY(price, pane.scale, pane.bounds);
    for (const s of aggregateCandleColumns(bars, i0, i1, (i) => coords.logicalToX(i), yOf, colorOf2)) {
      const c = parseColor(s.color);
      const hY = yOf(s.hi);
      b.rect(s.x - 0.5, hY, 1, yOf(s.lo) - hY, c);
    }
  }`,
    `  emitCandlesAggregated(b, bars, i0, i1, coords, pane, colorOf2) {
    const yOf = (price) => coords.priceToY(price, pane.scale, pane.bounds);
    const px = 1 / coords.dpr;
    for (const s of aggregateCandleColumns(bars, i0, i1, (i) => coords.logicalToX(i), yOf, colorOf2)) {
      const c = parseColor(s.color);
      const hY = snapY(yOf(s.hi), coords.dpr);
      const lY = snapY(yOf(s.lo), coords.dpr);
      b.rect(s.x - 0.5, hY, 1, Math.max(px, lY - hY), c);
    }
  }`,
  );

  // 4. Canvas2D drawCandles & drawCandlesAggregated parity
  next = next.replace(
    `    for (let i = i0; i <= i1; i += 1) {
      const b = bars[i];
      if (!b || b.high <= b.low) continue;
      const g = candleGeometry(coords.logicalToX(i), spacing, coords.dpr, this.candleBodyScale);
      const x = g.center;
      const up = b.close >= b.open;
      const dir = up ? paint.up : paint.down;
      const bc = barColors.get(b.time);
      const color = bc ?? dir;
      let top = 0;
      let bodyH = 0;
      if (drawBody) {
        const oY = coords.priceToY(b.open, pane.scale, pane.bounds);
        const cY = coords.priceToY(b.close, pane.scale, pane.bounds);
        top = snapY(Math.min(oY, cY), coords.dpr);
        bodyH = Math.max(1 / coords.dpr, snapY(Math.max(oY, cY), coords.dpr) - top);
      }
      if (cs.wickVisible) {
        const wick = (up ? cs.wickUpColor : cs.wickDownColor) ?? (drawBody ? dir : color);
        const hY = snapY(coords.priceToY(b.high, pane.scale, pane.bounds), coords.dpr);
        const lY = snapY(coords.priceToY(b.low, pane.scale, pane.bounds), coords.dpr);
        ctx.globalAlpha = this.candleStructureAlpha;
        ctx.strokeStyle = wick;
        ctx.lineWidth = g.wickW;
        ctx.beginPath();
        if (drawBody) {
          ctx.moveTo(x, hY);
          ctx.lineTo(x, top);
          ctx.moveTo(x, top + bodyH);
          ctx.lineTo(x, lY);
        } else {
          ctx.moveTo(x, hY);
          ctx.lineTo(x, lY);
        }
        ctx.stroke();
      }
      if (drawBody) {
        if (cs.bodyVisible) {
          ctx.globalAlpha = this.candleBodyAlpha;
          ctx.fillStyle = color;
          ctx.fillRect(g.bodyX, top, g.bodyW, bodyH);
        }
        if (cs.borderVisible || fading && cs.bodyVisible) {
          ctx.globalAlpha = this.candleStructureAlpha;
          ctx.strokeStyle = cs.borderVisible ? (up ? cs.borderUpColor : cs.borderDownColor) ?? color : color;
          ctx.lineWidth = 1;
          const bw = Math.max(0, g.bodyW - 1);
          const bh = Math.max(0, bodyH - 1);
          ctx.strokeRect(g.bodyX + 0.5, top + 0.5, bw, bh);
        }
      }
    }`,
    `    const px = 1 / coords.dpr;
    for (let i = i0; i <= i1; i += 1) {
      const b = bars[i];
      if (!b || b.high < b.low) continue;
      const g = candleGeometry(coords.logicalToX(i), spacing, coords.dpr, this.candleBodyScale);
      const up = b.close >= b.open;
      const dir = up ? paint.up : paint.down;
      const bc = barColors.get(b.time);
      const color = bc ?? dir;
      let top = 0;
      let bodyH = 0;
      if (drawBody) {
        const oY = coords.priceToY(b.open, pane.scale, pane.bounds);
        const cY = coords.priceToY(b.close, pane.scale, pane.bounds);
        top = snapY(Math.min(oY, cY), coords.dpr);
        bodyH = Math.max(px, snapY(Math.max(oY, cY), coords.dpr) - top);
      }
      if (cs.wickVisible) {
        const wick = (up ? cs.wickUpColor : cs.wickDownColor) ?? (drawBody ? dir : color);
        const hY = snapY(coords.priceToY(b.high, pane.scale, pane.bounds), coords.dpr);
        const lY = snapY(coords.priceToY(b.low, pane.scale, pane.bounds), coords.dpr);
        ctx.globalAlpha = this.candleStructureAlpha;
        ctx.fillStyle = wick;
        if (drawBody) {
          const bodyHi = Math.max(b.open, b.close);
          const bodyLo = Math.min(b.open, b.close);
          const topWickH = b.high > bodyHi ? Math.max(px, top - hY) : 0;
          const botWickH = b.low < bodyLo ? Math.max(px, lY - (top + bodyH)) : 0;
          if (topWickH > 0) ctx.fillRect(g.wickX, top - topWickH, g.wickW, topWickH);
          if (botWickH > 0) ctx.fillRect(g.wickX, top + bodyH, g.wickW, botWickH);
        } else {
          ctx.fillRect(g.wickX, hY, g.wickW, Math.max(px, lY - hY));
        }
      }
      if (drawBody) {
        if (cs.bodyVisible) {
          ctx.globalAlpha = this.candleBodyAlpha;
          ctx.fillStyle = color;
          ctx.fillRect(g.bodyX, top, g.bodyW, bodyH);
        }
        if (cs.borderVisible || fading && cs.bodyVisible) {
          const bordColor = cs.borderVisible ? (up ? cs.borderUpColor : cs.borderDownColor) ?? color : color;
          const sameAsBody = cs.bodyVisible && !fading && bordColor === color;
          if (!sameAsBody) {
            ctx.globalAlpha = this.candleStructureAlpha;
            ctx.fillStyle = bordColor;
            if (bodyH <= 2 * px || g.bodyW <= 2 * px) {
              ctx.fillRect(g.bodyX, top, g.bodyW, bodyH);
            } else {
              ctx.fillRect(g.bodyX, top, g.bodyW, px);
              ctx.fillRect(g.bodyX, top + bodyH - px, g.bodyW, px);
              ctx.fillRect(g.bodyX, top + px, px, bodyH - 2 * px);
              ctx.fillRect(g.bodyX + g.bodyW - px, top + px, px, bodyH - 2 * px);
            }
          }
        }
      }
    }`,
  );

  // 5. Viewport clamping & framing: prevent low-bar-count candle blow-up and preserve clean candle density
  next = next.replace(
    `    const minBs = Math.max(MIN_BAR_SPACING, Math.min(maxBs, W / ((n + ZOOM_OUT_MARGIN_BARS) * scale)));`,
    `    const minBs = Math.max(MIN_BAR_SPACING, Math.min(maxBs, Math.min(12, W / ((n + ZOOM_OUT_MARGIN_BARS) * scale))));`,
  );
  next = next.replace(
    `  fitContent() {
    const n = this.coords.barCount;
    const w = this.coords.width;
    if (n <= 0 || w <= 0) return;
    this.animator?.stop();
    this.panVelocity = 0;
    for (const pane of this.scene.panes.values()) pane.manualScale = null;
    for (const sl of this.scene.indicatorScales.values()) sl.manualScale = null;
    const visibleBars = Math.min(n, 200);
    const rightOffset = this.scene.style.margins.right;
    const v = this.clampViewport(w / ((visibleBars + rightOffset) * this.coords.spacingScale), rightOffset);
    this.coords.setViewport(v);
    this.targetBarSpacing = v.barSpacing;
  }`,
    `  fitContent() {
    const n = this.coords.barCount;
    const w = this.coords.width;
    if (n <= 0 || w <= 0) return;
    this.animator?.stop();
    this.panVelocity = 0;
    for (const pane of this.scene.panes.values()) pane.manualScale = null;
    for (const sl of this.scene.indicatorScales.values()) sl.manualScale = null;
    const visibleBars = Math.max(90, Math.min(n, 130));
    const rightOffset = this.scene.style.margins.right;
    const rawBs = w / ((visibleBars + rightOffset) * this.coords.spacingScale);
    const v = this.clampViewport(Math.max(6, Math.min(12, rawBs)), rightOffset);
    this.coords.setViewport(v);
    this.targetBarSpacing = v.barSpacing;
  }`,
  );
  next = next.replace(
    `  reframeKeepZoom() {
    this.animator?.stop();
    this.panVelocity = 0;
    for (const pane of this.scene.panes.values()) pane.manualScale = null;
    for (const sl of this.scene.indicatorScales.values()) sl.manualScale = null;
    const v = { barSpacing: clampBarSpacing(this.coords.getViewport().barSpacing), rightOffset: this.scene.style.margins.right };
    this.coords.setViewport(v);
    this.targetBarSpacing = v.barSpacing;
  }`,
    `  reframeKeepZoom() {
    this.animator?.stop();
    this.panVelocity = 0;
    for (const pane of this.scene.panes.values()) pane.manualScale = null;
    for (const sl of this.scene.indicatorScales.values()) sl.manualScale = null;
    const curBs = this.coords.getViewport().barSpacing;
    const safeBs = Number.isFinite(curBs) && curBs >= 2 && curBs <= 60 ? curBs : 8;
    const v = { barSpacing: clampBarSpacing(safeBs), rightOffset: this.scene.style.margins.right };
    this.coords.setViewport(v);
    this.targetBarSpacing = v.barSpacing;
  }`,
  );

  return next;
}

export default defineConfig({
  plugins: [
    {
      name: 'deplyzeview-vela-candle-rendering',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('@luxalgo/vela') && !id.includes('chunk-BDVUH2Y7')) return null;
        const transformed = transformVelaCandleRendering(code);
        return transformed !== code ? { code: transformed, map: null } : null;
      },
    },
    svelte(),
    {
      name: 'deplyzeview-dev-server-identity',
      configureServer(server) {
        server.middlewares.use('/__deplyzeview_dev_server', (_request, response) => {
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify({ app: 'deplyzeview', root: realpathSync(fileURLToPath(new URL('.', import.meta.url))) }));
        });
      },
    },
  ],
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: 'deplyzeview-vela-candle-rendering-esbuild',
          setup(build) {
            build.onLoad({ filter: /chunk-BDVUH2Y7\.js$/ }, (args) => {
              const source = readFileSync(args.path, 'utf8');
              return { contents: transformVelaCandleRendering(source), loader: 'js' };
            });
          },
        },
      ],
    },
  },
  clearScreen: false,
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: { target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13' },
});
