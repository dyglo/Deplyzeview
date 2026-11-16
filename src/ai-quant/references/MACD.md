---
id: macd
title: "Tafar MACD Monochrome Oscillator"
category: oscillator
tags: ["macd", "oscillator", "momentum", "histogram", "signal", "crossover", "divergence", "subpane"]
pine_version: 6
overlay: false
summary: "Clean sub-pane MACD oscillator (overlay=false) with 4-state rising/falling histogram columns, signal line, dotted zero line, and monochrome/custom color palette."
---

# Tafar MACD Monochrome Oscillator

Clean sub-pane MACD oscillator (overlay=false) with 4-state rising/falling histogram columns, signal line, dotted zero line, and monochrome/custom color palette.

## Reference Pine Script
```pine
//@version=6
indicator("Tafar MACD", shorttitle="Tafar MACD", overlay=false)

// MACD Settings
src = input.source(close, "Source", group="Calculation")
fastLen = input.int(12, "Fast EMA", minval=1, group="Calculation")
slowLen = input.int(26, "Slow EMA", minval=1, group="Calculation")
signalLen = input.int(9, "Signal EMA", minval=1, group="Calculation")

// Display Settings
showMACD = input.bool(true, "Show MACD", group="Display")
showSignal = input.bool(true, "Show Signal", group="Display")
showHist = input.bool(true, "Show Histogram", group="Display")

// Monochrome Palette
macdColor = input.color(#F0F0F0, "MACD Line", group="Colors")
signalColor = input.color(#969696, "Signal Line", group="Colors")
posStrong = input.color(#E0E0E0, "Positive Rising", group="Colors")
posWeak = input.color(#A0A0A0, "Positive Falling", group="Colors")
negStrong = input.color(#626262, "Negative Falling", group="Colors")
negWeak = input.color(#909090, "Negative Rising", group="Colors")
zeroColor = input.color(#666666, "Zero Line", group="Colors")

// Standard TradingView MACD
[macdLine, signalLine, histLine] = ta.macd(src, fastLen, slowLen, signalLen)

// Histogram State
bool rising = histLine > histLine[1]
color histColor = histLine >= 0 ? (rising ? posStrong : posWeak) : (rising ? negWeak : negStrong)

// Plots
hline(0, "Zero", color=color.new(zeroColor, 40), linestyle=hline.style_dotted)

plot(showHist ? histLine : na, "Histogram", color=histColor, style=plot.style_columns)

plot(showMACD ? macdLine : na, "MACD", color=macdColor, linewidth=2)

plot(showSignal ? signalLine : na, "Signal", color=signalColor, linewidth=2)

// Confirmed-bar alerts
bullCross = ta.crossover(macdLine, signalLine) and barstate.isconfirmed
bearCross = ta.crossunder(macdLine, signalLine) and barstate.isconfirmed

alertcondition(bullCross, "Bullish MACD Cross", "MACD crossed above Signal")
alertcondition(bearCross, "Bearish MACD Cross", "MACD crossed below Signal")
```
