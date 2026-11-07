import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PineEngine } from '@luxalgo/vela-pinets';

const bars = Array.from({ length: 240 }, (_, i) => {
  const close = 100 + Math.sin(i / 7) * 3 + i * 0.03;
  return { time: Date.UTC(2026, 0, 1) + i * 3_600_000, open: close - 0.4, high: close + 1, low: close - 1, close, volume: 1000 };
});

function execute(engine, prepared, sourceBars = bars) {
  return new Promise((resolve, reject) => {
    let result;
    const session = engine.execute(
      { prepared, market: { symbol: 'TEST:TEST', timeframe: '60' }, bars: sourceBars, mode: 'static' },
      { onModel: model => { result = model; }, onError: reject, onDone: () => { session.stop(); resolve(result); } },
    );
  });
}

test('Pine Painter compiles Pine v6 const and switch syntax', async () => {
  const source = `//@version=6
indicator("v6 syntax")
const int LIMIT = 2
mode = input.bool(true, "Use high")
value = switch mode
    true => high
    => low
plot(value[LIMIT])`;
  const engine = new PineEngine();
  const prepared = await engine.prepare(source, 'v6-syntax');
  assert.equal(prepared.language, 'pine');
  assert.equal(prepared.inputs[0].key, 'mode');
  const model = await execute(engine, prepared);
  assert.equal(model.series.length, 1);
  assert.equal(model.series[0].points.at(-1).value, bars.at(-3).high);
});

test('Pine Painter renders the supplied LTF S/R Zones v6 indicator', async () => {
  const source = await readFile(new URL('./testdata/sr-supply-demand-v6.pine', import.meta.url), 'utf8');
  const engine = new PineEngine();
  const prepared = await engine.prepare(source, 'sr-supply-demand');
  assert.equal(prepared.meta.title, 'LTF S/R Zones');
  assert.deepEqual(prepared.inputs.map(input => input.key), ['len', 'wmax', 'gap', 'maxN', 'flip', 'fAge', 'fMax']);
  const model = await execute(engine, prepared);
  assert.equal(model.series.length, 0);
  assert.ok(model.boxes.length > 0, 'expected Pine box drawings to reach the Vela model');
  assert.ok(model.boxes.every(box => Number.isFinite(box.top) && Number.isFinite(box.bottom)));
});
