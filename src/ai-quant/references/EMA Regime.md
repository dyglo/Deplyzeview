---
id: ema-regime
title: "EMA Regime & Statistical Momentum Filter"
category: trend
tags: ["ema", "moving average", "regime", "trend", "momentum", "t-statistic", "table", "ribbon", "ma"]
pine_version: 6
overlay: true
summary: "Plots EMA 50 and EMA 100 with statistical log-return t-test momentum regime classification (Bullish, Bearish, Neutral) and a clean on-chart regime status badge."
---

# EMA Regime & Statistical Momentum Filter

Plots EMA 50 and EMA 100 with statistical log-return t-test momentum regime classification (Bullish, Bearish, Neutral) and a clean on-chart regime status badge.

## Reference Pine Script
```pine
//@version=6
indicator("EMA Regime", shorttitle = "EMA Regime", overlay = true)

// ── Inputs ────────────────────────────────────────────────────────────
show50  = input.bool(true, "EMA 50",  group = "EMAs")
show100 = input.bool(true, "EMA 100", group = "EMAs")
zCrit   = input.float(1.96, "Significance z", minval = 0.0, step = 0.01, group = "Regime",
     tooltip = "Momentum requires the t-statistic of mean log-return over n bars to reach this value (1.96 = 5% two-sided). n = length of the fastest active EMA.")

// ── EMAs ──────────────────────────────────────────────────────────────
ema50  = ta.ema(close, 50)
ema100 = ta.ema(close, 100)

plot(show50  ? ema50  : na, "EMA 50",  color = color.new(color.orange, 0), linewidth = 1)
plot(show100 ? ema100 : na, "EMA 100", color = color.new(color.blue,   0), linewidth = 1)

// ── Regime math ───────────────────────────────────────────────────────
int n = show50 ? 50 : 100

float r  = math.log(close / close[1])
float mu = ta.sma(r, n)
float sd = ta.stdev(r, n)
float t  = sd > 0 ? mu * math.sqrt(n) / sd : 0.0

float hi = show50 and show100 ? math.max(ema50, ema100) : show50 ? ema50 : ema100
float lo = show50 and show100 ? math.min(ema50, ema100) : show50 ? ema50 : ema100

bool slopeUp = (not show50 or ema50 > ema50[n]) and (not show100 or ema100 > ema100[n])
bool slopeDn = (not show50 or ema50 < ema50[n]) and (not show100 or ema100 < ema100[n])

bool bull = close > hi and slopeUp and t >= zCrit
bool bear = close < lo and slopeDn and t <= -zCrit

int state = bull ? 1 : bear ? -1 : 0

// Non-repainting: on a forming bar, show the last confirmed bar's state
int shown = barstate.isconfirmed ? state : nz(state[1])

// ── Table ─────────────────────────────────────────────────────────────
var table tbl = table.new(position.top_right, 1, 1)

if barstate.islast
    if show50 or show100
        string txt = shown == 1 ? "MOMENTUM — BULLISH" : shown == -1 ? "MOMENTUM — BEARISH" : "RANGE"
        color  bg  = shown == 1 ? color.new(color.green, 15) : shown == -1 ? color.new(color.red, 15) : color.new(color.gray, 25)
        table.cell(tbl, 0, 0, txt, text_color = color.white, bgcolor = bg, text_size = size.tiny)
    else
        table.cell(tbl, 0, 0, "", bgcolor = na)
```
