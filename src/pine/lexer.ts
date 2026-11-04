export interface SourceLocation { offset: number; line: number; column: number }
export interface Token {
  kind: 'identifier' | 'number' | 'string' | 'color' | 'operator' | 'newline' | 'indent' | 'dedent' | 'eof';
  value: string;
  start: SourceLocation;
  end: SourceLocation;
}
export class PineDiagnostic extends Error {
  readonly stage = 'lex';
  readonly location: SourceLocation;
  constructor(message: string, location: SourceLocation) {
    super(message);
    this.name = 'PineDiagnostic';
    this.location = location;
  }
}
export const SOURCE_LIMIT = 256 * 1024;
export const NESTING_LIMIT = 128;

/** Tokenize source without evaluating JavaScript or resolving host properties. */
export function tokenize(source: string): Token[] {
  if (new TextEncoder().encode(source).length > SOURCE_LIMIT) {
    throw new PineDiagnostic('Source exceeds 256 KiB.', { offset: 0, line: 1, column: 1 });
  }
  const tokens: Token[] = [];
  const indentation = [0];
  const delimiters: string[] = [];
  let offset = 0;
  let line = 1;
  let column = 1;
  let lineStart = true;
  const location = (): SourceLocation => ({ offset, line, column });
  const advance = () => { offset++; column++; };
  const emit = (kind: Token['kind'], value: string, start: SourceLocation) => {
    tokens.push({ kind, value, start, end: location() });
  };
  const fail = (message: string, at = location()): never => { throw new PineDiagnostic(message, at); };
  while (offset < source.length) {
    if (lineStart) {
      const start = location();
      let width = 0;
      while (source[offset] === ' ' || source[offset] === '\t') {
        width += source[offset] === '\t' ? 4 : 1;
        advance();
      }
      const blank = offset === source.length || /[\r\n]/.test(source[offset]) || source.startsWith('//', offset);
      if (!blank && delimiters.length === 0) {
        const previous = indentation[indentation.length - 1];
        if (width > previous) {
          if (indentation.length > NESTING_LIMIT) fail('Indentation exceeds nesting limit.', start);
          indentation.push(width);
          emit('indent', '', start);
        } else {
          while (width < indentation[indentation.length - 1]) {
            indentation.pop();
            emit('dedent', '', start);
          }
          if (width !== indentation[indentation.length - 1]) fail('Indentation does not match an enclosing block.', start);
        }
      }
      lineStart = false;
      if (offset === source.length) break;
    }
    const start = location();
    const char = source[offset];
    if (char === ' ' || char === '\t') { advance(); continue; }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[offset + 1] === '\n') offset++;
      offset++; line++; column = 1; lineStart = true;
      if (!delimiters.length) emit('newline', '\n', start);
      continue;
    }
    if (source.startsWith('//', offset)) {
      while (offset < source.length && !/[\r\n]/.test(source[offset])) advance();
      continue;
    }
    if (char === '"' || char === "'") {
      advance();
      let value = '';
      while (offset < source.length && source[offset] !== char) {
        if (/[\r\n]/.test(source[offset])) fail('Unterminated string.', start);
        if (source[offset] === '\\') {
          advance();
          const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'" };
          if (!(source[offset] in escapes)) fail('Unsupported string escape.');
          value += escapes[source[offset]];
        } else value += source[offset];
        advance();
      }
      if (offset >= source.length) fail('Unterminated string.', start);
      advance(); emit('string', value, start); continue;
    }
    if (char === '#') {
      advance();
      const begin = offset;
      while (offset < source.length && /[a-zA-Z0-9]/.test(source[offset])) advance();
      const hex = source.slice(begin, offset);
      if (!/^(?:[\da-fA-F]{6}|[\da-fA-F]{8})$/.test(hex)) fail('Expected a six or eight digit hex color.', start);
      emit('color', '#' + hex, start); continue;
    }
    if (/\d/.test(char) || (char === '.' && /\d/.test(source[offset + 1] ?? ''))) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(offset))!;
      for (let i = 0; i < match[0].length; i++) advance();
      if (/[a-zA-Z_]/.test(source[offset] ?? '')) fail('Malformed numeric literal.', start);
      if (!Number.isFinite(Number(match[0]))) fail('Numeric literal is out of range.', start);
      emit('number', match[0], start); continue;
    }
    if (/[a-zA-Z_]/.test(char)) {
      advance();
      while (offset < source.length && /[a-zA-Z_0-9]/.test(source[offset])) advance();
      emit('identifier', source.slice(start.offset, offset), start); continue;
    }
    const pair = source.slice(offset, offset + 2);
    if ([':=', '==', '!=', '<=', '>=', '=>', '+=', '-=', '*=', '/=', '%='].includes(pair)) {
      advance(); advance(); emit('operator', pair, start); continue;
    }
    if ('()[]'.includes(char)) {
      if (char === '(' || char === '[') {
        if (delimiters.length >= NESTING_LIMIT) fail('Expression exceeds nesting limit.');
        delimiters.push(char);
      } else if (delimiters.pop() !== (char === ')' ? '(' : '[')) fail('Mismatched closing delimiter.');
    } else if (!'+-*/%=<>?:,.'.includes(char)) fail(`Unsupported character ${JSON.stringify(char)}.`);
    advance(); emit('operator', char, start);
  }
  if (delimiters.length) fail('Unclosed expression delimiter.');
  if (tokens.length && tokens[tokens.length - 1].kind !== 'newline') emit('newline', '\n', location());
  while (indentation.length > 1) { indentation.pop(); emit('dedent', '', location()); }
  emit('eof', '', location());
  return tokens;
}
