---
id: auto-channel-detector
title: "Auto Channel Detector (OLS Regression Channels H1 + M15)"
category: channel
tags: ["channel", "regression", "linear regression", "trend channel", "bands", "std dev", "parallel channel", "breakout"]
pine_version: 5
overlay: true
summary: "Dual-timeframe (H1 + M15) ordinary least-squares (OLS) regression price channels with standard-deviation upper/lower bands, midline, linefills, R-squared labels, anchor locks, and touch/breakout alerts."
---

# Auto Channel Detector (OLS Regression Channels H1 + M15)

Dual-timeframe (H1 + M15) ordinary least-squares (OLS) regression price channels with standard-deviation upper/lower bands, midline, linefills, R-squared labels, anchor locks, and touch/breakout alerts.

## Reference Pine Script
```pine
//@version=5
indicator("Auto Channel Detector v6 [H1+M15]", overlay=true, max_lines_count=50, max_labels_count=10)
// ═══════════════════════════════════════════════════════════
// SECTION 1 — INPUTS
// ═══════════════════════════════════════════════════════════
grp1 = "── H1 Channel ──"
show_h1       = input.bool(true,  "Show H1 Channel",        group=grp1)
h1_len        = input.int(100,    "H1 Length (bars)",       group=grp1, minval=10, maxval=500)
h1_dev        = input.float(2.0,  "H1 Std Dev Multiplier",  group=grp1, minval=0.25, maxval=5.0, step=0.25)
h1_ext        = input.bool(true,  "H1 Extend Right",        group=grp1)
h1_lw         = input.int(2,      "H1 Line Width",          group=grp1, minval=1, maxval=4)
grp1b = "── H1 Anchor Lock (0 = auto) ──"
h1_lock_left  = input.float(0.0, "H1 Lock Left Price",      group=grp1b, minval=0.0, step=0.00001, tooltip="Set to the exact price you want the LEFT end of the H1 midline pinned to. Set 0 for auto.")
h1_lock_right = input.float(0.0, "H1 Lock Right Price",     group=grp1b, minval=0.0, step=0.00001, tooltip="Set to the exact price you want the RIGHT end of the H1 midline pinned to. Set 0 for auto.")
grp2 = "── M15 Channel ──"
show_m15      = input.bool(true,  "Show M15 Channel",       group=grp2)
m15_len       = input.int(100,    "M15 Length (bars)",      group=grp2, minval=10, maxval=500)
m15_dev       = input.float(2.0,  "M15 Std Dev Multiplier", group=grp2, minval=0.25, maxval=5.0, step=0.25)
m15_ext       = input.bool(true,  "M15 Extend Right",       group=grp2)
m15_lw        = input.int(1,      "M15 Line Width",         group=grp2, minval=1, maxval=4)
grp2b = "── M15 Anchor Lock (0 = auto) ──"
m15_lock_left  = input.float(0.0, "M15 Lock Left Price",    group=grp2b, minval=0.0, step=0.00001, tooltip="Set to the exact price you want the LEFT end of the M15 midline pinned to. Set 0 for auto.")
m15_lock_right = input.float(0.0, "M15 Lock Right Price",   group=grp2b, minval=0.0, step=0.00001, tooltip="Set to the exact price you want the RIGHT end of the M15 midline pinned to. Set 0 for auto.")
grp3 = "── Visual ──"
show_fill     = input.bool(true,  "Show Fill",              group=grp3)
show_mid      = input.bool(true,  "Show Midline",           group=grp3)
show_lbl      = input.bool(true,  "Show Label",             group=grp3)
fill_tp       = input.int(85,     "Fill Transparency",      group=grp3, minval=50, maxval=95)
// Chart background determines the grayscale palette.
chart_dark = color.r(chart.bg_color) * 0.299 + color.g(chart.bg_color) * 0.587 + color.b(chart.bg_color) * 0.114 < 128
grp4 = "── H1 Colors ──"
h1_asc_col    = input.color(color.new(#D4D4D4, 0), "H1 Ascending",  group=grp4)
h1_desc_col   = input.color(color.new(#A3A3A3, 0), "H1 Descending", group=grp4)
h1_flat_col   = input.color(color.new(#8A8A8A, 0), "H1 Flat",       group=grp4)
grp5 = "── M15 Colors ──"
m15_asc_col   = input.color(color.new(#E5E5E5, 0), "M15 Ascending",  group=grp5)
m15_desc_col  = input.color(color.new(#8A8A8A, 0), "M15 Descending", group=grp5)
m15_flat_col  = input.color(color.new(#A3A3A3, 0), "M15 Flat",       group=grp5)
grp6 = "── Alerts ──"
al_upper      = input.bool(true, "Alert: Touch Upper Band", group=grp6)
al_lower      = input.bool(true, "Alert: Touch Lower Band", group=grp6)
al_break      = input.bool(true, "Alert: Breakout",         group=grp6)
// ═══════════════════════════════════════════════════════════
// SECTION 2 — PERSISTENT LINE OBJECTS
// ═══════════════════════════════════════════════════════════
var line h1_u  = line.new(na, na, na, na, width=2)
var line h1_m  = line.new(na, na, na, na, width=1, style=line.style_dashed)
var line h1_l  = line.new(na, na, na, na, width=2)
var linefill h1_uf = linefill.new(h1_u, h1_m, color.new(#A3A3A3, 85))
var linefill h1_lf = linefill.new(h1_m, h1_l, color.new(#A3A3A3, 85))
var label h1_lb    = label.new(na, na, "", style=label.style_label_lower_left, size=size.small, textcolor=color.white)
// Lock indicator dots — show when anchor is active
var label h1_lock_left_dot  = label.new(na, na, "⬡", style=label.style_none, size=size.small, textcolor=chart_dark ? #D4D4D4 : #404040)
var label h1_lock_right_dot = label.new(na, na, "⬡", style=label.style_none, size=size.small, textcolor=chart_dark ? #D4D4D4 : #404040)
var line m15_u = line.new(na, na, na, na, width=1)
var line m15_m = line.new(na, na, na, na, width=1, style=line.style_dashed)
var line m15_l = line.new(na, na, na, na, width=1)
var linefill m15_uf = linefill.new(m15_u, m15_m, color.new(#A3A3A3, 85))
var linefill m15_lf = linefill.new(m15_m, m15_l, color.new(#A3A3A3, 85))
var label m15_lb    = label.new(na, na, "", style=label.style_label_lower_left, size=size.small, textcolor=color.white)
var label m15_lock_left_dot  = label.new(na, na, "⬡", style=label.style_none, size=size.small, textcolor=chart_dark ? #D4D4D4 : #404040)
var label m15_lock_right_dot = label.new(na, na, "⬡", style=label.style_none, size=size.small, textcolor=chart_dark ? #D4D4D4 : #404040)
// ═══════════════════════════════════════════════════════════
// SECTION 3 — OLS REGRESSION CALCULATION
// Full manual loop — slope, intercept, stddev of residuals
// No ta.linreg inside any loop (offset must be simple int)
// ═══════════════════════════════════════════════════════════
f_calc(src, len) =>
    sumX  = 0.0
    sumY  = 0.0
    sumXY = 0.0
    sumX2 = 0.0
    for i = 0 to len - 1
        x      = float(i)
        y      = src[i]
        sumX  := sumX  + x
        sumY  := sumY  + y
        sumXY := sumXY + x * y
        sumX2 := sumX2 + x * x
    denom     = len * sumX2 - sumX * sumX
    slope     = denom != 0.0 ? (len * sumXY - sumX * sumY) / denom : 0.0
    intercept = (sumY - slope * sumX) / len
    // x=0 → current bar (right), x=len-1 → oldest bar (left)
    y_right = intercept
    y_left  = slope * float(len - 1) + intercept
    // Stddev of residuals
    ss_res = 0.0
    ss_tot = 0.0
    mean_y = sumY / len
    for i = 0 to len - 1
        y_pred  = slope * float(i) + intercept
        ss_res := ss_res + math.pow(src[i] - y_pred, 2)
        ss_tot := ss_tot + math.pow(src[i] - mean_y, 2)
    stddev = math.sqrt(ss_res / len)
    r2     = ss_tot > 0.0 ? 1.0 - ss_res / ss_tot : 0.0
    [y_left, y_right, slope, stddev, r2]
// ═══════════════════════════════════════════════════════════
// SECTION 4 — ANCHOR LOCK RESOLVER
//
// Logic:
//   Both locked  → use both user prices directly
//   Left only    → pin left, keep auto right, recalc slope
//   Right only   → pin right, keep auto left, recalc slope
//   Neither      → pure auto (no change)
//
// Band width (stddev) is ALWAYS from auto regression so the
// channel width remains statistically grounded regardless of
// where you anchor the midline.
// ═══════════════════════════════════════════════════════════
f_resolve_anchors(y_left_auto, y_right_auto, lock_left, lock_right) =>
    left_locked  = lock_left  > 0.0
    right_locked = lock_right > 0.0
    y_left  = left_locked  ? lock_left  : y_left_auto
    y_right = right_locked ? lock_right : y_right_auto
    // Recalculate slope from resolved endpoints for color classification
    resolved_slope = y_right - y_left
    [y_left, y_right, resolved_slope]
// ═══════════════════════════════════════════════════════════
// SECTION 5 — DRAW + UPDATE
// ═══════════════════════════════════════════════════════════
f_draw(u_ln, m_ln, l_ln, uf, lf, lb,
     lock_left_dot, lock_right_dot,
     src, len, dev_mult, lw, ext,
     asc_col, desc_col, flat_col,
     lock_left, lock_right,
     prefix, show, s_fill, s_mid, s_lbl, tp) =>
    if show
        [y_left_auto, y_right_auto, slope_auto, stddev, r2] = f_calc(src, len)
        [y_left, y_right, slope] = f_resolve_anchors(y_left_auto, y_right_auto, lock_left, lock_right)
        band = stddev * dev_mult
        x1   = bar_index - (len - 1)
        x2   = bar_index
        ev   = ext ? extend.right : extend.none
        col  = slope > 0.0 ? asc_col : slope < 0.0 ? desc_col : flat_col
        // ── Upper band ──────────────────────────────────────
        line.set_xy1(u_ln, x1, y_left  + band)
        line.set_xy2(u_ln, x2, y_right + band)
        line.set_color(u_ln, col)
        line.set_width(u_ln, lw)
        line.set_extend(u_ln, ev)
        // ── Midline ─────────────────────────────────────────
        line.set_xy1(m_ln, x1, y_left)
        line.set_xy2(m_ln, x2, y_right)
        line.set_color(m_ln, color.new(col, 40))
        line.set_width(m_ln, s_mid ? 1 : 0)
        line.set_extend(m_ln, ev)
        // ── Lower band ──────────────────────────────────────
        line.set_xy1(l_ln, x1, y_left  - band)
        line.set_xy2(l_ln, x2, y_right - band)
        line.set_color(l_ln, col)
        line.set_width(l_ln, lw)
        line.set_extend(l_ln, ev)
        // ── Fills ───────────────────────────────────────────
        fc = s_fill ? color.new(col, tp) : color.new(col, 100)
        linefill.set_color(uf, fc)
        linefill.set_color(lf, fc)
        // ── Label ───────────────────────────────────────────
        if s_lbl
            dir      = slope > 0.0 ? "▲ ASC" : slope < 0.0 ? "▼ DESC" : "↔ FLAT"
            lock_tag = (lock_left > 0.0 or lock_right > 0.0) ? "  🔒" : ""
            r2_str   = str.tostring(math.round(r2 * 100) / 100)
            label.set_xy(lb, x2, y_right + band)
            label.set_text(lb, prefix + " " + dir + "  R²:" + r2_str + lock_tag)
            label.set_color(lb, color.new(col, 15))
        else
            label.set_text(lb, "")
        // ── Lock anchor dots ────────────────────────────────
        // Yellow diamond markers show exactly where you locked
        if lock_left > 0.0
            label.set_xy(lock_left_dot, x1, lock_left)
            label.set_text(lock_left_dot, "◆")
            label.set_textcolor(lock_left_dot, chart_dark ? #D4D4D4 : #404040)
        else
            label.set_text(lock_left_dot, "")
        if lock_right > 0.0
            label.set_xy(lock_right_dot, x2, lock_right)
            label.set_text(lock_right_dot, "◆")
            label.set_textcolor(lock_right_dot, chart_dark ? #D4D4D4 : #404040)
        else
            label.set_text(lock_right_dot, "")
        [y_right + band, y_right - band]
    else
        line.set_color(u_ln, color.new(color.white, 100))
        line.set_color(m_ln, color.new(color.white, 100))
        line.set_color(l_ln, color.new(color.white, 100))
        linefill.set_color(uf, color.new(color.white, 100))
        linefill.set_color(lf, color.new(color.white, 100))
        label.set_text(lb, "")
        label.set_text(lock_left_dot, "")
        label.set_text(lock_right_dot, "")
        [float(na), float(na)]
// ═══════════════════════════════════════════════════════════
// SECTION 6 — MAIN EXECUTION
// ═══════════════════════════════════════════════════════════
[h1_top, h1_bot] = f_draw(
     h1_u, h1_m, h1_l, h1_uf, h1_lf, h1_lb,
     h1_lock_left_dot, h1_lock_right_dot,
     close, h1_len, h1_dev, h1_lw, h1_ext,
     chart_dark ? h1_asc_col : #404040, chart_dark ? h1_desc_col : #737373, chart_dark ? h1_flat_col : #525252,
     h1_lock_left, h1_lock_right,
     "H1", show_h1, show_fill, show_mid, show_lbl, fill_tp)
[m15_top, m15_bot] = f_draw(
     m15_u, m15_m, m15_l, m15_uf, m15_lf, m15_lb,
     m15_lock_left_dot, m15_lock_right_dot,
     close, m15_len, m15_dev, m15_lw, m15_ext,
     chart_dark ? m15_asc_col : #262626, chart_dark ? m15_desc_col : #525252, chart_dark ? m15_flat_col : #737373,
     m15_lock_left, m15_lock_right,
     "M15", show_m15, show_fill, show_mid, show_lbl, fill_tp)
// ═══════════════════════════════════════════════════════════
// SECTION 7 — ALERTS
// ═══════════════════════════════════════════════════════════
atr = ta.atr(14)
tol = atr * 0.25
if al_upper
    if not na(h1_top) and math.abs(close - h1_top) <= tol
        alert("H1: Touching UPPER band", alert.freq_once_per_bar)
    if not na(m15_top) and math.abs(close - m15_top) <= tol
        alert("M15: Touching UPPER band", alert.freq_once_per_bar)
if al_lower
    if not na(h1_bot) and math.abs(close - h1_bot) <= tol
        alert("H1: Touching LOWER band", alert.freq_once_per_bar)
    if not na(m15_bot) and math.abs(close - m15_bot) <= tol
        alert("M15: Touching LOWER band", alert.freq_once_per_bar)
if al_break
    if not na(h1_top) and close > h1_top + tol
        alert("H1: BREAKOUT above", alert.freq_once_per_bar)
    if not na(h1_bot) and close < h1_bot - tol
        alert("H1: BREAKOUT below", alert.freq_once_per_bar)
    if not na(m15_top) and close > m15_top + tol
        alert("M15: BREAKOUT above", alert.freq_once_per_bar)
    if not na(m15_bot) and close < m15_bot - tol
        alert("M15: BREAKOUT below", alert.freq_once_per_bar)
```
