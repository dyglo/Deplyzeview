---
id: market-structure
title: "Institutional Market Structure (Major & Internal BOS / CHoCH + MTF Bias)"
category: market-structure
tags: ["market structure", "bos", "choch", "break of structure", "change of character", "hh", "hl", "lh", "ll", "swing", "internal", "zigzag", "mtf", "bias"]
pine_version: 6
overlay: true
summary: "Complete Pine v6 Market Structure engine tracking Major and Internal swings (HH, HL, LH, LL), confirmed BOS and CHoCH breaks, structural levels, optional ZigZag and auto-trendline, plus a Multi-Timeframe (MTF) Structure Bias Score table."
---

# Institutional Market Structure (Major & Internal BOS / CHoCH + MTF Bias)

Complete Pine v6 Market Structure engine tracking Major and Internal swings (HH, HL, LH, LL), confirmed BOS and CHoCH breaks, structural levels, optional ZigZag and auto-trendline, plus a Multi-Timeframe (MTF) Structure Bias Score table.

## Reference Pine Script
```pine
//@version=6
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
indicator("Market Structure", overlay = true, max_lines_count = 500, max_labels_count = 500)

// ───────────────────────────────── INPUTS ─────────────────────────────────
var string GS = "Structure Engine"
structMode = input.string("Major", "Structure Mode", options = ["Internal", "Major", "Both"], group = GS,
     tooltip = "Which layer is labelled on the chart. Internal pivots are hidden by default.")
pivotLen   = input.int(5, "Pivot Strength (raw)", minval = 2, group = GS,
     tooltip = "Raw pivot detector. Kept deliberately sensitive — the major layer filters it.")
sensStr    = input.string("Balanced", "Structure Sensitivity", options = ["High", "Balanced", "Low"], group = GS,
     tooltip = "HIGH = fewest, most significant major swings. LOW = more major swings. Expressed as a minimum ATR displacement from the opposing major swing.")
minGap     = input.int(5, "Min Bars Between Major Swings", minval = 0, group = GS,
     tooltip = "Second major-layer gate. Rejects pivots that are structurally too close in time to the opposing major swing.")
atrLen     = input.int(14, "Filter ATR Length", minval = 2, group = GS)
eqTolPct   = input.float(3.0, "Equal High/Low Tolerance (% of ATR)", minval = 0.0, maxval = 50.0, step = 0.5, group = GS)

var string GB = "Break of Structure"
bosType    = input.string("Major", "BOS Type", options = ["Major", "Internal", "Both"], group = GB)
bosMode    = input.string("Close", "BOS Confirmation", options = ["Close", "Wick"], group = GB,
     tooltip = "CLOSE (default): candle must close beyond the level. WICK: any breach counts — materially more breaks, not recommended for bias.")
showBOS    = input.bool(true, "Show BOS",   group = GB)
showCHoCH  = input.bool(true, "Show CHoCH", group = GB)
waitClose  = input.bool(true, "Evaluate on bar close only", group = GB)

var string GM = "Multi-Timeframe Bias"
showPanel  = input.bool(true,  "Show Bias Panel", group = GM)
tfHigh     = input.timeframe("240", "Higher Timeframe", group = GM)
tfLow      = input.timeframe("60",  "Lower Timeframe",  group = GM)
wHigh      = input.float(60, "HTF Weight %", minval = 0, maxval = 100, step = 5, group = GM)
wLow       = input.float(40, "LTF Weight %", minval = 0, maxval = 100, step = 5, group = GM)
panelPos   = input.string("Top Center", "Panel Position", options = ["Top Center", "Top Right", "Top Left"], group = GM)

var string GV = "Visuals"
showSwings = input.bool(true,  "Show HH / HL / LH / LL", group = GV)
showZig    = input.bool(true,  "Show Structure ZigZag",  group = GV)
showLevels = input.bool(true,  "Show Major Structural Levels", group = GV)
showBroken = input.bool(true,  "Show Broken Levels",     group = GV)
nBroken    = input.int(3, "Broken Levels Kept", minval = 0, maxval = 10, group = GV)
showTrend  = input.bool(false, "Show Auto Trendline",    group = GV,
     tooltip = "Off by default. Diagonal trendlines are a separate interpretive layer, not part of the structure engine.")
colBOS     = input.color(#00BCD4, "BOS Color",      group = GV)
colCHoCH   = input.color(#E040FB, "CHoCH Color",    group = GV)
colBull    = input.color(#26A69A, "Bullish Swing",  group = GV)
colBear    = input.color(#EF5350, "Bearish Swing",  group = GV)
colZig     = input.color(#9598A1, "ZigZag Color",   group = GV)
colInt     = input.color(#5D606B, "Internal Layer", group = GV)
maxObjects = input.int(160, "Max Chart Objects", minval = 20, maxval = 460, group = GV)

var string GA = "Alerts"
alSwings = input.bool(true, "Major HH / HL / LH / LL", group = GA)
alBos    = input.bool(true, "Major BOS",   group = GA)
alChoch  = input.bool(true, "Major CHoCH", group = GA)

// ───────────────────────────────── TYPES ──────────────────────────────────
type Swing
    float price    = na
    int   bar      = na
    bool  consumed = false

type Structure
    Swing hi
    Swing lo
    float prevHi   = na
    float prevLo   = na
    int   lastType = 0
    int   state    = 0     // 2 BULL, 1 TRANS-BULL, 0 NEUTRAL, -1 TRANS-BEAR, -2 BEAR
    int   hiClass  = 0     //  1 HH, -1 LH
    int   loClass  = 0     //  1 HL, -1 LL
    float brokenHi = na
    float brokenLo = na
    bool  accepted = false
    bool  replaced = false

// ──────────────────────── ENGINE METHODS (v1 core) ────────────────────────
method pushHigh(Structure s, float p, int b, float tol, float minMove, int gap) =>
    int code   = 0
    s.accepted := false
    s.replaced := false
    if na(s.hi.price)
        s.hi       := Swing.new(p, b, false)
        s.lastType := 1
        s.accepted := true
    else if s.hi.consumed
        s.prevHi   := s.hi.price
        s.hi       := Swing.new(p, b, false)
        s.lastType := 1
        s.accepted := true
        code       := p > s.prevHi + tol ? 1 : -1
    else if s.lastType == 1
        if p > s.hi.price
            s.hi.price := p
            s.hi.bar   := b
            s.accepted := true
            s.replaced := true
            code       := na(s.prevHi) ? 0 : (p > s.prevHi + tol ? 1 : -1)
    else
        bool sig = na(s.lo.price) or (math.abs(p - s.lo.price) >= minMove and b - s.lo.bar >= gap)
        if sig
            s.prevHi   := s.hi.price
            s.hi       := Swing.new(p, b, false)
            s.lastType := 1
            s.accepted := true
            code       := p > s.prevHi + tol ? 1 : -1
    s.hiClass := code != 0 ? code : s.hiClass
    code

method pushLow(Structure s, float p, int b, float tol, float minMove, int gap) =>
    int code   = 0
    s.accepted := false
    s.replaced := false
    if na(s.lo.price)
        s.lo       := Swing.new(p, b, false)
        s.lastType := -1
        s.accepted := true
    else if s.lo.consumed
        s.prevLo   := s.lo.price
        s.lo       := Swing.new(p, b, false)
        s.lastType := -1
        s.accepted := true
        code       := p < s.prevLo - tol ? -1 : 1
    else if s.lastType == -1
        if p < s.lo.price
            s.lo.price := p
            s.lo.bar   := b
            s.accepted := true
            s.replaced := true
            code       := na(s.prevLo) ? 0 : (p < s.prevLo - tol ? -1 : 1)
    else
        bool sig = na(s.hi.price) or (math.abs(s.hi.price - p) >= minMove and b - s.hi.bar >= gap)
        if sig
            s.prevLo   := s.lo.price
            s.lo       := Swing.new(p, b, false)
            s.lastType := -1
            s.accepted := true
            code       := p < s.prevLo - tol ? -1 : 1
    s.loClass := code != 0 ? code : s.loClass
    code

// ───────────────────── SELF-CONTAINED ENGINE INSTANCE ─────────────────────
// One call site = one independent engine (its own `var` state). Called once
// for the chart-TF major layer, once for the chart-TF internal layer, and
// once inside each request.security() for the MTF bias engines. HTF and LTF
// pivots are therefore never mixed.
//
// Returns:
//  0 state     2/1/0/-1/-2
//  1 score     -100..+100 structure bias score
//  2 pivCode   1 HH, -1 LH, 2 HL, -2 LL, 0 none
//  3 pivPrice  4 pivBar   5 pivReplaced
//  6 evt       1 BOS↑, 2 CHoCH↑, -1 BOS↓, -2 CHoCH↓, 0 none
//  7 evtLevel  8 evtSrcBar
//  9 majHi    10 majLo   11 majHiBar  12 majLoBar
msEngine(int pvLen, float sMult, int gap, int aLen, float tolPct, bool useWick, bool wait) =>
    var Structure s   = Structure.new(Swing.new(), Swing.new())
    var float mom     = 0.0
    var int   lastEvt = 0
    var bool  hhSince = false
    var bool  hlSince = false
    var bool  lhSince = false
    var bool  llSince = false

    float atrV    = ta.atr(aLen)
    float minMove = nz(atrV) * sMult
    float tol     = nz(atrV) * tolPct / 100.0

    float ph = ta.pivothigh(high, pvLen, pvLen)
    float pl = ta.pivotlow(low,  pvLen, pvLen)
    int   pb = bar_index - pvLen

    int   pivCode  = 0
    float pivPrice = na
    int   pivBar   = na
    bool  pivRep   = false

    // ── swing intake ──────────────────────────────────────────────────────
    if not na(ph)
        int c = s.pushHigh(ph, pb, tol, minMove, gap)
        if s.accepted
            pivPrice := ph
            pivBar   := pb
            pivRep   := s.replaced
            pivCode  := c
            if c == 1
                hhSince := true
            if c == -1
                lhSince := true
    if not na(pl)
        int c = s.pushLow(pl, pb, tol, minMove, gap)
        if s.accepted
            pivPrice := pl
            pivBar   := pb
            pivRep   := s.replaced
            pivCode  := c == 1 ? 2 : c == -1 ? -2 : 0
            if c == 1
                hlSince := true
            if c == -1
                llSince := true

    // ── break detection ───────────────────────────────────────────────────
    bool  barOk = wait ? barstate.isconfirmed : true
    float upLvl = s.hi.consumed ? na : s.hi.price
    float dnLvl = s.lo.consumed ? na : s.lo.price
    bool  bullBrk = barOk and not na(upLvl) and bar_index > s.hi.bar and (useWick ? high > upLvl + tol : close > upLvl + tol)
    bool  bearBrk = barOk and not na(dnLvl) and bar_index > s.lo.bar and (useWick ? low  < dnLvl - tol : close < dnLvl - tol)
    if bullBrk and bearBrk
        if close >= open
            bearBrk := false
        else
            bullBrk := false

    int   evt    = 0
    float evtLvl = na
    int   evtSrc = na

    if bullBrk
        evtLvl := upLvl
        evtSrc := s.hi.bar
        s.brokenHi     := upLvl
        s.hi.consumed  := true
        if s.state <= -1                       // BEARISH or TRANSITION-BEAR
            evt     := 2                       // CHoCH ↑ → enter transition
            s.state := 1
            hhSince := false
            hlSince := false
        else
            evt := 1                           // BOS ↑ (continuation)
            if s.state == 0
                s.state := 1
        mom := math.max(-1.5, math.min(1.5, mom * 0.65 + 1.0))

    if bearBrk
        evtLvl := dnLvl
        evtSrc := s.lo.bar
        s.brokenLo     := dnLvl
        s.lo.consumed  := true
        if s.state >= 1                        // BULLISH or TRANSITION-BULL
            evt     := -2                      // CHoCH ↓ → enter transition
            s.state := -1
            lhSince := false
            llSince := false
        else
            evt := -1
            if s.state == 0
                s.state := -1
        mom := math.max(-1.5, math.min(1.5, mom * 0.65 - 1.0))

    // ── transition promotion: a CHoCH alone never flips the full bias ─────
    if s.state == 1 and hhSince and hlSince
        s.state := 2
    if s.state == -1 and lhSince and llSince
        s.state := -2

    if evt != 0
        lastEvt := evt

    // ── STRUCTURE BIAS SCORE (deterministic, structural evidence only) ────
    float sc = 0.0
    sc += s.state == 2 ? 40 : s.state == 1 ? 15 : s.state == -1 ? -15 : s.state == -2 ? -40 : 0
    sc += s.hiClass ==  1 ? 15 : s.hiClass == -1 ? -15 : 0
    sc += s.loClass ==  1 ? 15 : s.loClass == -1 ? -15 : 0
    sc += lastEvt ==  1 ? 20 : lastEvt ==  2 ? 10 : lastEvt == -1 ? -20 : lastEvt == -2 ? -10 : 0
    sc += math.max(-1.0, math.min(1.0, mom)) * 10.0
    sc := math.max(-100.0, math.min(100.0, sc))

    [s.state, sc, pivCode, pivPrice, pivBar, pivRep, evt, evtLvl, evtSrc, s.hi.price, s.lo.price, s.hi.bar, s.lo.bar]

// ───────────────────────── SENSITIVITY MAPPING ────────────────────────────
// HIGH = fewest / most significant swings, per spec.
float sMajor = sensStr == "High" ? 2.6 : sensStr == "Balanced" ? 1.6 : 0.7
bool  useWick = bosMode == "Wick"

// ───────────────────────── ENGINE INSTANTIATION ───────────────────────────
// Chart-timeframe MAJOR layer — drives all chart drawing.
[mState, mScore, mPiv, mPivP, mPivB, mPivRep, mEvt, mEvtL, mEvtS, mHi, mLo, mHiB, mLoB] =
     msEngine(pivotLen, sMajor, minGap, atrLen, eqTolPct, useWick, waitClose)

// Chart-timeframe INTERNAL layer — no significance gate, hidden by default.
[iState, iScore, iPiv, iPivP, iPivB, iPivRep, iEvt, iEvtL, iEvtS, iHi, iLo, iHiB, iLoB] =
     msEngine(pivotLen, 0.0, 0, atrLen, eqTolPct, useWick, waitClose)

// Independent MTF bias engines.
[hState, hScore, hA, hB, hC, hD, hE, hF, hG, hH, hI, hJ, hK] =
     request.security(syminfo.tickerid, tfHigh,
        msEngine(pivotLen, sMajor, minGap, atrLen, eqTolPct, useWick, waitClose),
        lookahead = barmerge.lookahead_off)

[lState, lScore, lA, lB, lC, lD, lE, lF, lG, lH, lI, lJ, lK] =
     request.security(syminfo.tickerid, tfLow,
        msEngine(pivotLen, sMajor, minGap, atrLen, eqTolPct, useWick, waitClose),
        lookahead = barmerge.lookahead_off)

// ─────────────────────── OBJECT LIFECYCLE (FIFO) ──────────────────────────
var array<line>  lineStore  = array.new<line>()
var array<label> labelStore = array.new<label>()

keepLine(line l) =>
    array.push(lineStore, l)
    if array.size(lineStore) > maxObjects
        line.delete(array.shift(lineStore))
    l

keepLabel(label lb) =>
    array.push(labelStore, lb)
    if array.size(labelStore) > maxObjects
        label.delete(array.shift(labelStore))
    lb

bool drawMajor = structMode == "Major" or structMode == "Both"
bool drawInt   = structMode == "Internal" or structMode == "Both"
bool bosMajor  = bosType == "Major" or bosType == "Both"
bool bosInt    = bosType == "Internal" or bosType == "Both"

// ──────────────── ZIGZAG — built ONLY from major pivots ───────────────────
var int   anchorBar   = na
var float anchorPrice = na
var int   curBar      = na
var float curPrice    = na
var line  curZig      = na
var label curLbl      = na

if not na(mPivB)
    if mPivRep
        line.delete(curZig)
        label.delete(curLbl)
    else
        anchorBar   := curBar
        anchorPrice := curPrice
    curBar   := mPivB
    curPrice := mPivP
    if showZig and not na(anchorBar)
        curZig := keepLine(line.new(anchorBar, anchorPrice, curBar, curPrice, xloc.bar_index, extend.none, colZig, line.style_solid, 1))
    if showSwings and drawMajor and mPiv != 0
        bool   isHigh = mPiv == 1 or mPiv == -1
        string txt    = mPiv == 1 ? "HH" : mPiv == -1 ? "LH" : mPiv == 2 ? "HL" : "LL"
        color  c      = (mPiv == 1 or mPiv == 2) ? colBull : colBear
        curLbl := keepLabel(label.new(mPivB, mPivP, txt, xloc.bar_index, yloc.price, color.new(color.black, 100),
             isHigh ? label.style_label_down : label.style_label_up, c, size.tiny))

// Internal layer — muted lowercase, off by default.
if drawInt and showSwings and not na(iPivB) and iPiv != 0 and not iPivRep
    bool isHighI = iPiv == 1 or iPiv == -1
    keepLabel(label.new(iPivB, iPivP, iPiv == 1 ? "hh" : iPiv == -1 ? "lh" : iPiv == 2 ? "hl" : "ll",
         xloc.bar_index, yloc.price, color.new(color.black, 100),
         isHighI ? label.style_label_down : label.style_label_up, colInt, size.tiny))

// ─────────────────────────── BREAK DRAWING ────────────────────────────────
drawBreak(int evt, float lvl, int src, bool major) =>
    bool isCH = math.abs(evt) == 2
    bool up   = evt > 0
    if (isCH and showCHoCH) or (not isCH and showBOS)
        color  c = major ? (isCH ? colCHoCH : colBOS) : colInt
        string t = (isCH ? "CHoCH " : "BOS ") + (up ? "↑" : "↓")
        keepLine(line.new(src, lvl, bar_index, lvl, xloc.bar_index, extend.none, c, line.style_dashed, 1))
        keepLabel(label.new(bar_index, lvl, major ? t : str.lower(t), xloc.bar_index, yloc.price,
             color.new(color.black, 100), up ? label.style_label_up : label.style_label_down, c, size.tiny))

if bosMajor and mEvt != 0
    drawBreak(mEvt, mEvtL, mEvtS, true)
if bosInt and iEvt != 0
    drawBreak(iEvt, iEvtL, iEvtS, false)

// ─────────────────── STRUCTURAL LEVELS (major only) ───────────────────────
var line lvlHi = na
var line lvlLo = na
if showLevels and barstate.islast
    line.delete(lvlHi)
    line.delete(lvlLo)
    if not na(mHi)
        lvlHi := line.new(mHiB, mHi, bar_index + 10, mHi, xloc.bar_index, extend.none, color.new(colBear, 40), line.style_dotted, 1)
    if not na(mLo)
        lvlLo := line.new(mLoB, mLo, bar_index + 10, mLo, xloc.bar_index, extend.none, color.new(colBull, 40), line.style_dotted, 1)

var array<line> brokenStore = array.new<line>()
if showBroken and nBroken > 0 and mEvt != 0
    line bl = line.new(mEvtS, mEvtL, bar_index + 5, mEvtL, xloc.bar_index, extend.none, color.new(colZig, 65), line.style_dotted, 1)
    array.push(brokenStore, bl)
    if array.size(brokenStore) > nBroken
        line.delete(array.shift(brokenStore))

// ─────────────── OPTIONAL AUTO TRENDLINE (off by default) ─────────────────
var line  trendLn  = na
var float prevMHi  = na
var int   prevMHiB = na
var float prevMLo  = na
var int   prevMLoB = na
if not na(mPivB) and not mPivRep
    if mPiv == 1 or mPiv == -1
        prevMHi  := mHi
        prevMHiB := mHiB
    else
        prevMLo  := mLo
        prevMLoB := mLoB
if showTrend and barstate.islast
    line.delete(trendLn)
    bool bearBias = mState < 0
    if bearBias and not na(prevMHi) and not na(mHi) and mHiB != prevMHiB
        trendLn := line.new(prevMHiB, prevMHi, mHiB, mHi, xloc.bar_index, extend.right, color.new(colBear, 50), line.style_solid, 1)
    else if not bearBias and not na(prevMLo) and not na(mLo) and mLoB != prevMLoB
        trendLn := line.new(prevMLoB, prevMLo, mLoB, mLo, xloc.bar_index, extend.right, color.new(colBull, 50), line.style_solid, 1)

// ──────────────────────── BIAS PANEL / SCORING ────────────────────────────
stateTxt(int st) =>
    st == 2 ? "BULLISH" : st == 1 ? "TRANSITION ↑" : st == -1 ? "TRANSITION ↓" : st == -2 ? "BEARISH" : "NEUTRAL"

stateCol(int st) =>
    st >= 1 ? colBull : st <= -1 ? colBear : color.gray

float  wSum    = math.max(1.0, wHigh + wLow)
float  overall = (nz(hScore) * wHigh + nz(lScore) * wLow) / wSum
string overTxt = overall >= 60 ? "STRONG BULLISH STRUCTURE" : overall >= 20 ? "BULLISH STRUCTURE" :
                 overall > -20 ? "NEUTRAL / TRANSITION"     : overall > -60 ? "BEARISH STRUCTURE" : "STRONG BEARISH STRUCTURE"
color  overCol = overall >= 20 ? colBull : overall <= -20 ? colBear : color.gray

// Conflict is surfaced explicitly, never averaged away.
bool   conflict = (hState >= 1 and lState <= -1) or (hState <= -1 and lState >= 1)
string confTxt  = not conflict ? "" : (hState <= -1 ? "HTF BEARISH / LTF RECOVERY" : "HTF BULLISH / LTF PULLBACK")

var table pnl = na
if showPanel and barstate.islast
    table.delete(pnl)
    pnl := table.new(panelPos == "Top Right" ? position.top_right : panelPos == "Top Left" ? position.top_left : position.top_center,
         3, 5, bgcolor = color.new(color.black, 20), border_color = color.new(color.gray, 60), border_width = 1, frame_width = 1)
    table.cell(pnl, 0, 0, "STRUCTURE BIAS SCORE", text_color = color.silver, text_size = size.tiny, text_halign = text.align_left)
    table.cell(pnl, 1, 0, "", text_size = size.tiny)
    table.cell(pnl, 2, 0, "", text_size = size.tiny)

    table.cell(pnl, 0, 1, tfHigh, text_color = color.silver, text_size = size.tiny, text_halign = text.align_left)
    table.cell(pnl, 1, 1, stateTxt(hState), text_color = stateCol(hState), text_size = size.tiny)
    table.cell(pnl, 2, 1, (hScore >= 0 ? "+" : "") + str.tostring(hScore, "#"), text_color = stateCol(hState), text_size = size.tiny)

    table.cell(pnl, 0, 2, tfLow, text_color = color.silver, text_size = size.tiny, text_halign = text.align_left)
    table.cell(pnl, 1, 2, stateTxt(lState), text_color = stateCol(lState), text_size = size.tiny)
    table.cell(pnl, 2, 2, (lScore >= 0 ? "+" : "") + str.tostring(lScore, "#"), text_color = stateCol(lState), text_size = size.tiny)

    table.cell(pnl, 0, 3, "OVERALL", text_color = color.white, text_size = size.tiny, text_halign = text.align_left)
    table.cell(pnl, 1, 3, overTxt, text_color = overCol, text_size = size.tiny)
    table.cell(pnl, 2, 3, (overall >= 0 ? "+" : "") + str.tostring(overall, "#"), text_color = overCol, text_size = size.tiny)

    table.cell(pnl, 0, 4, conflict ? "CONFLICT" : "", text_color = color.orange, text_size = size.tiny, text_halign = text.align_left)
    table.cell(pnl, 1, 4, confTxt, text_color = color.orange, text_size = size.tiny)
    table.cell(pnl, 2, 4, "", text_size = size.tiny)

// ───────────────────────────── ALERTS ─────────────────────────────────────
alertcondition(alSwings and mPiv ==  1, "Major HH", "Market Structure: major Higher High")
alertcondition(alSwings and mPiv == -1, "Major LH", "Market Structure: major Lower High")
alertcondition(alSwings and mPiv ==  2, "Major HL", "Market Structure: major Higher Low")
alertcondition(alSwings and mPiv == -2, "Major LL", "Market Structure: major Lower Low")
alertcondition(alBos    and mEvt ==  1, "Major Bullish BOS",   "Market Structure: major bullish BOS")
alertcondition(alBos    and mEvt == -1, "Major Bearish BOS",   "Market Structure: major bearish BOS")
alertcondition(alChoch  and mEvt ==  2, "Major Bullish CHoCH", "Market Structure: major bullish CHoCH")
alertcondition(alChoch  and mEvt == -2, "Major Bearish CHoCH", "Market Structure: major bearish CHoCH")
```
