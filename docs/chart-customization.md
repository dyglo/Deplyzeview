# Chart styles, appearance, and saved state

Deplyzeview embeds a single-chart `VelaWorkspace` around the existing Vela renderer and Rust market-data providers. The workspace remains a one-chart surface (`layout: false`); the app supplies its own narrow desktop chrome and settings dialog, while Vela continues to own OHLCV rendering, order-flow plugin rendering, indicator panes, drawing objects, axis geometry, and chart interaction.

## Available chart styles

The style selector switches the active Vela price style in place: Candles, Hollow Candles, OHLC Bars, Line, Area, Baseline, Heikin Ashi, and the custom Volume Footprint renderer. Hollow Candles is a native candle-body visibility configuration, not a separate fabricated price series. Footprint uses the existing live normalized trade service and tick-row aggregation. Switching styles does not rebuild the market feed or intentionally clear indicators, drawings, or chart viewport state.

Columns is not exposed because this Vela release has no native column style. Renko, Line Break, Kagi, Point & Figure, and Range are price/tick-based bar-construction methods, not ordinary time-bar color filters; the app deliberately does not present visual approximations as native calculations. A true implementation needs a supported transformed-bar/data-engine contract and must be validated against documented price-brick rules before it is offered.

## Appearance settings

Every visible control maps to Vela's live renderer configuration, not to decorative UI state. The Symbol tab exposes relevant settings for the active style: candle bodies/borders/wicks, OHLC bar colors, line/area colors and widths, or baseline colors/level. Volume visibility uses the native `volume` indicator handle; its bullish/bearish columns follow the active bullish/bearish chart palette.

Canvas controls cover background, text and label size, independent horizontal/vertical grid visibility and colors, pane separators, and top/bottom/right margins. Scales controls cover linear/percent/indexed scale mode, logarithmic and inverted axes, price-only autoscaling, price labels, last-price line and label, countdown, and axis-border color. Crosshair controls cover line color, axis-label background, line style, width, and opacity.

Some options are intentionally omitted when the current Vela API or the configured feeds do not support them as live controls: axis side/position and time-axis visibility are engine-managed in the pinned release; session shading is not supplied for the configured 24/7 crypto markets; crosshair mode follows Vela's native interaction; and footprint bid/ask colors remain on the native renderer palette. The UI does not show inert controls for these cases.

## Persistence

`VelaWorkspace` persists chart market/provider, interval, price style and renderer config, indicators and their visibility/settings, drawings, and related chart state under `deplyzeview.single-chart.v1` using its built-in browser storage adapter. The app's Footprint display mode, volume unit, and ticks-per-row are stored separately under `deplyzeview.chart-ui.v1`. Both are local to the Tauri WebView profile; no account sync or server-side settings service is implied.

Appearance changes are applied through Vela's public `renderer.applyConfig` API and are included in the workspace state. Reset appearance restores the app's graphite defaults without intentionally changing the selected price style, market, drawings, or Footprint mode/unit/grouping.

## Upstream chart engine

The project uses the exact published `@luxalgo/vela` npm release `0.9.3`, which exposes the documented VelaWorkspace, renderer configuration, and plugin APIs used here. The lockfile resolves the public npm registry tarball, so installing this repo does not require a GitHub SSH key. The project includes Vela's license and notice files; keep its attribution visible in the chart.
