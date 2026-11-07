# Pine Editor

Open the Mountain icon on the right rail. Paste a Pine v5 or v6 indicator and select **Run**. Use **Save** to store the source locally under a name. In **Indicators → Custom Indicators**, use **Add** to run the saved source or **Edit** to open it. The chart legend controls visibility and removal.

```pine
//@version=5
indicator("EMA 20", overlay=true)
plot(ta.ema(close, 20), color=color.orange, linewidth=2)
```

Execution uses Pine Painter’s `@luxalgo/vela-pinets` adapter and the PineTS runtime in a Web Worker. It supports native Pine v5/v6 syntax, including typed constants, `switch`, arrays, custom functions, loops, drawings, inputs, alerts, and the runtime’s supported technical-analysis and `request.security()` functions. PineTS preserves Pine’s series/history semantics and the Vela adapter maps plots, shapes, lines, boxes, labels, tables, and strategy output into the existing chart model. Unsupported PineTS features still produce a compiler diagnostic rather than changing the indicator source.

SMA waits for a full nonmissing window. EMA starts at the first available sample. ATR and RSI use Wilder smoothing with a mean seed. RSI returns a gap if both average gain and loss are zero. Missing values produce gaps or are skipped by the smoothing functions. Crosses require valid samples on both adjacent bars.

Compilation and execution run through PineTS’s worker-backed Vela engine. The library uses local storage. CodeMirror is MIT-licensed, Vela retains its existing Apache-2.0 license, and the PineTS/Vela Pine adapter is AGPL-3.0; see the package notices for the dependency terms.
