# Pine Editor

Open the Mountain icon on the right rail. Paste a supported Pine v5 indicator and select **Run**. Use **Save** to store the source locally under a name. In **Indicators → Custom Indicators**, use **Add** to run the saved source or **Edit** to open it. The chart legend controls visibility and removal.

```pine
//@version=5
indicator("EMA 20", overlay=true)
plot(ta.ema(close, 20), color=color.orange, linewidth=2)
```

The interpreter supports OHLCV, scalar variables, reassignment, var, if/else, ternaries, constant history offsets, na/nz, SMA, EMA, RSI, ATR, crossover and crossunder. It supports line plots, horizontal levels, and overlay triangle markers. TA lengths must be constant. Stateful calls must run on every bar. Local declarations inside branches, inputs, external data requests, custom functions, loops, arrays, strategies, and other Pine versions are outside this subset.

SMA waits for a full nonmissing window. EMA starts at the first available sample. ATR and RSI use Wilder smoothing with a mean seed. RSI returns a gap if both average gain and loss are zero. Missing values produce gaps or are skipped by the smoothing functions. Crosses require valid samples on both adjacent bars.

The app-owned interpreter runs in Web Workers with a five-second timeout. Limits include 256 KiB source, 10,000 bars, 16 outputs, and eight chart instances. The library uses local storage. CodeMirror is MIT-licensed and Vela retains its existing Apache-2.0 license.
