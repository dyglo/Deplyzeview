/**
 * Lightweight, XSS-safe Pine Script v5/v6 tokenizer and HTML syntax highlighter
 * for both streaming code animations and compact code inspection in Dark & Light themes.
 */

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TOKEN_REGEX = new RegExp(
  [
    // 1. Comments (single line //...)
    '(\\/\\/.*$)',
    // 2. Strings ("..." or '...')
    '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')',
    // 3. Hex colors (#RRGGBB or #RRGGBBAA)
    '(#[0-9a-fA-F]{6,8}\\b)',
    // 4. Built-in namespaces & core functions
    '(\\b(?:indicator|strategy|library|plot|plotshape|plotchar|plotarrow|plotcandle|plotbar|bgcolor|barcolor|hline|fill|alertcondition|alert)\\b|\\b(?:ta|math|array|matrix|map|box|line|linefill|label|table|polyline|color|input|str|request| time|timenow|syminfo|barstate|timeframe|session|chart|runtime)\\.[a-zA-Z_]\\w*)',
    // 5. Pine keywords & types
    '(\\b(?:var|varip|const|type|method|import|export|as|if|else|for|to|by|while|switch|break|continue|return|int|float|bool|string|color|line|box|label|table|array|matrix|map|series|simple|input|and|or|not|true|false|na)\\b)',
    // 6. Built-in series variables
    '(\\b(?:open|high|low|close|volume|hl2|hlc3|ohlc4|hlcc4|bar_index|last_bar_index|time|time_close)\\b)',
    // 7. Numbers
    '(\\b\\d+(?:\\.\\d+)?\\b)',
  ].join('|'),
  'gm',
);

export function highlightPineLine(line: string): string {
  if (!line) return '&nbsp;';
  const trimmed = line.trim();
  if (trimmed.startsWith('//@version=')) {
    return `<span class="ph-directive">${escapeHtml(line)}</span>`;
  }

  let result = '';
  let lastIndex = 0;
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(line)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(line.slice(lastIndex, match.index));
    }
    const full = match[0];
    if (match[1] !== undefined) {
      result += `<span class="ph-comment">${escapeHtml(full)}</span>`;
    } else if (match[2] !== undefined) {
      result += `<span class="ph-string">${escapeHtml(full)}</span>`;
    } else if (match[3] !== undefined) {
      result += `<span class="ph-color">${escapeHtml(full)}</span>`;
    } else if (match[4] !== undefined) {
      result += `<span class="ph-builtin">${escapeHtml(full)}</span>`;
    } else if (match[5] !== undefined) {
      result += `<span class="ph-keyword">${escapeHtml(full)}</span>`;
    } else if (match[6] !== undefined) {
      result += `<span class="ph-series">${escapeHtml(full)}</span>`;
    } else if (match[7] !== undefined) {
      result += `<span class="ph-number">${escapeHtml(full)}</span>`;
    } else {
      result += escapeHtml(full);
    }
    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < line.length) {
    result += escapeHtml(line.slice(lastIndex));
  }

  return result;
}

export interface HighlightedLine {
  lineNumber: number;
  html: string;
}

export function highlightPineSourceLines(
  source: string,
  options: { maxTailLines?: number } = {},
): { lines: HighlightedLine[]; totalLines: number } {
  const raw = source || '';
  const fenceMatch = raw.match(/```(?:pine|pinescript)?\s*\r?\n([\s\S]*)$/i);
  let cleaned = '';
  if (fenceMatch) {
    cleaned = fenceMatch[1].replace(/```\s*[\s\S]*$/, '');
  } else if (/^\s*(?:\/\/@version\s*=|indicator\s*\(|study\s*\()/m.test(raw)) {
    const idx = raw.search(/^\s*(?:\/\/@version\s*=|indicator\s*\(|study\s*\()/m);
    cleaned = raw.slice(Math.max(0, idx)).replace(/```\s*[\s\S]*$/, '');
  }

  if (!cleaned.trim()) {
    return { lines: [], totalLines: 0 };
  }

  const rawLines = cleaned.split(/\r?\n/);
  const totalLines = rawLines.length;
  const maxTail = options.maxTailLines ?? 0;
  const startIdx = maxTail > 0 && totalLines > maxTail ? totalLines - maxTail : 0;

  const lines: HighlightedLine[] = [];
  for (let i = startIdx; i < totalLines; i++) {
    lines.push({
      lineNumber: i + 1,
      html: highlightPineLine(rawLines[i]),
    });
  }

  return { lines, totalLines };
}

/**
 * Generates contextual follow-up refinement suggestions tailored to the active indicator's
 * features so follow-up interactions feel smart and specific to the indicator on the chart.
 */
export function generateContextualFollowUps(source: string, indicatorName: string): string[] {
  const s = (source || '').toLowerCase();
  const suggestions: string[] = [];

  if (s.includes('box.new') || s.includes('supply') || s.includes('demand') || s.includes('zone') || s.includes('order block')) {
    suggestions.push('Add a toggle to hide mitigated/invalidated zones and extend active zones to the right');
  }
  if (s.includes('asia') || s.includes('london') || s.includes('session')) {
    suggestions.push('Add New York session detection and customizable session colors');
  }
  if (!s.includes('ema') && !s.includes('sma')) {
    suggestions.push(`Add a 50 & 200 EMA trend filter to qualify ${indicatorName} signals`);
  } else {
    suggestions.push('Add an ATR volatility band and highlight high-confluence signals');
  }
  if (!s.includes('table.new')) {
    suggestions.push('Add a compact on-chart status table showing current bias and active levels');
  }
  if (!s.includes('alertcondition')) {
    suggestions.push('Add customizable alert conditions for confirmed bullish and bearish setups');
  }

  return suggestions.slice(0, 3);
}
