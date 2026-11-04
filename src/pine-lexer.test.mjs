import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, PineDiagnostic, SOURCE_LIMIT } from './pine/lexer.ts';

test('lexer retains locations through CRLF, comments and indentation', () => {
  const tokens = tokenize('//@version=5\r\nif close > open\r\n    value := close[1] // previous\r\nplot(value)');
  assert.deepEqual(tokens.filter(t => ['indent', 'dedent'].includes(t.kind)).map(t => t.kind), ['indent', 'dedent']);
  const value = tokens.find(t => t.value === 'value');
  assert.deepEqual(value.start, { offset: 35, line: 3, column: 5 });
  assert.equal(tokens.at(-1).kind, 'eof');
});
test('lexer handles strings, colors and scientific notation', () => {
  const tokens = tokenize('plot(.5e-2, title="a\\n\\\"b", color=#FF000080)');
  assert.equal(tokens.find(t => t.kind === 'number').value, '.5e-2');
  assert.equal(tokens.find(t => t.kind === 'string').value, 'a\n"b');
  assert.equal(tokens.find(t => t.kind === 'color').value, '#FF000080');
});
test('parenthesized continuation does not create blocks', () => {
  const tokens = tokenize('plot(\n    close,\n    color=#aabbcc\n)');
  assert.equal(tokens.filter(t => t.kind === 'indent').length, 0);
  assert.equal(tokens.filter(t => t.kind === 'newline').length, 1);
});
test('malformed source produces located diagnostics', () => {
  for (const source of ['"unterminated', '(]', '#123', '1e+', '1e999', 'if true\n    x=1\n  x=2', 'x=@']) {
    assert.throws(() => tokenize(source), error => error instanceof PineDiagnostic && error.location.line > 0 && error.location.column > 0);
  }
});
test('source and expression depth are bounded', () => {
  assert.throws(() => tokenize(' '.repeat(SOURCE_LIMIT + 1)), /256 KiB/);
  assert.throws(() => tokenize('('.repeat(129)), /nesting limit/);
});
