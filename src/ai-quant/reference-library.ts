/**
 * Curated Pine Script Reference Library for AI Quant.
 * Loads all `.md` indicator files from `src/ai-quant/references/*.md`, automatically
 * cleans any rich-text Markdown escaping if present, parses frontmatter metadata,
 * and exposes on-demand search and retrieval tools (`search_pine_references` and
 * `read_pine_reference`) so AI Quant can consult verified indicators when relevant.
 */

export interface PineReferenceEntry {
  id: string;
  fileName: string;
  title: string;
  category: string;
  tags: string[];
  pineVersion: 5 | 6;
  overlay: boolean;
  summary: string;
  source: string;
}

export interface PineReferenceSummary {
  id: string;
  title: string;
  category: string;
  tags: string[];
  pineVersion: 5 | 6;
  overlay: boolean;
  summary: string;
  lineCount: number;
}

/**
 * Cleans rich-text Markdown escaping (e.g. `//**@version=**6`, `\=`, `\[`, `\]`, `**int**`)
 * so that even raw `.md` files exported from Docs/Notion yield 100% valid Pine Script.
 */
export function cleanMarkdownPine(raw: string): string {
  let s = (raw || '').replace(/\r\n/g, '\n');
  s = s.replace(/^\s*\/+\*\*@version=\*\*(\d+)/m, '//@version=$1');
  s = s.replace(/\*\*(@?[a-zA-Z_][a-zA-Z0-9_.]*)\*\*/g, '$1');
  s = s.replace(/\\([=\[\]_\-+*#.<>|~`{}()!\\])/g, '$1');
  s = s
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (/^[═─━\-=*]{5,}$/.test(t)) return '// ' + t;
      return line.replace(/\s+$/, '');
    })
    .join('\n')
    .trim();
  return s;
}

function slugifyId(input: string): string {
  return input
    .toLowerCase()
    .replace(/\.md$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferTagsFromContent(title: string, source: string): string[] {
  const combined = `${title}\n${source}`.toLowerCase();
  const tags = new Set<string>();
  const checks: Array<[string, RegExp]> = [
    ['smc', /\bsmc\b|smart money/],
    ['order block', /order\s*block|\bob\b/],
    ['market structure', /market\s*structure|structure/],
    ['bos', /\bbos\b|break of structure/],
    ['choch', /\bchoch\b|change of character/],
    ['support and resistance', /support|resistance|\bs\/r\b|\bsr\b/],
    ['supply and demand', /supply|demand/],
    ['channel', /channel|regression|linreg/],
    ['ema', /\bema\b|ta\.ema/],
    ['macd', /\bmacd\b|ta\.macd/],
    ['volume profile', /volume\s*profile|\bpoc\b|value\s*area/],
    ['mtf', /request\.security|multi-timeframe|\bhtf\b|\bltf\b/],
    ['zones', /\bbox\.new\b|zone/],
  ];
  for (const [tag, rx] of checks) {
    if (rx.test(combined)) tags.add(tag);
  }
  return Array.from(tags);
}

export function parseReferenceMarkdown(fileName: string, rawMarkdown: string): PineReferenceEntry {
  const normalized = (rawMarkdown || '').replace(/\r\n/g, '\n');
  let frontmatterBlock = '';
  let body = normalized;

  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (fmMatch) {
    frontmatterBlock = fmMatch[1];
    body = fmMatch[2];
  }

  const meta: Record<string, string> = {};
  for (const line of frontmatterBlock.split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      meta[k] = v;
    }
  }

  const fenceMatch = body.match(/```(?:pine|pinescript)?\s*\n([\s\S]*?)```/i);
  const rawPine = fenceMatch ? fenceMatch[1] : body;
  const source = cleanMarkdownPine(rawPine);

  const versionMatch = source.match(/^\/\/@version\s*=\s*(\d+)/m);
  const pineVersion: 5 | 6 =
    meta.pine_version === '5' || (versionMatch && versionMatch[1] === '5') ? 5 : 6;

  const indMatch = source.match(/\bindicator\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/);
  const defaultTitle = indMatch ? indMatch[1].trim() : fileName.replace(/\.md$/i, '');
  const title = (meta.title || defaultTitle).replace(/^["']|["']$/g, '').trim();
  const id = (meta.id || slugifyId(fileName)).replace(/^["']|["']$/g, '').trim();
  const category = (meta.category || 'indicator').replace(/^["']|["']$/g, '').trim();

  let tags: string[] = [];
  if (meta.tags) {
    const bracketInner = meta.tags.replace(/^\[|\]$/g, '');
    tags = bracketInner
      .split(',')
      .map((t) => t.replace(/^["'\s]+|["'\s]+$/g, '').toLowerCase())
      .filter(Boolean);
  }
  if (tags.length === 0) {
    tags = inferTagsFromContent(title, source);
  }

  const overlay =
    meta.overlay !== undefined
      ? meta.overlay.trim().toLowerCase() !== 'false'
      : !/\boverlay\s*=\s*false\b/i.test(source);

  const summary = (meta.summary || `${title} (Pine v${pineVersion})`)
    .replace(/^["']|["']$/g, '')
    .trim();

  return {
    id,
    fileName,
    title,
    category,
    tags,
    pineVersion,
    overlay,
    summary,
    source,
  };
}

const rawReferenceModules = import.meta.glob('./references/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const REFERENCE_CATALOG: PineReferenceEntry[] = Object.entries(rawReferenceModules)
  .map(([modulePath, rawContent]) => {
    const fileName = modulePath.split('/').pop() || modulePath;
    return parseReferenceMarkdown(fileName, rawContent);
  })
  .sort((a, b) => a.id.localeCompare(b.id));

export function listPineReferences(): PineReferenceSummary[] {
  return REFERENCE_CATALOG.map((entry) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
    tags: entry.tags,
    pineVersion: entry.pineVersion,
    overlay: entry.overlay,
    summary: entry.summary,
    lineCount: entry.source.split('\n').length,
  }));
}

export function getAllPineReferenceEntries(): PineReferenceEntry[] {
  return [...REFERENCE_CATALOG];
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'for',
  'with',
  'build',
  'create',
  'make',
  'me',
  'indicator',
  'pine',
  'script',
  'in',
  'on',
  'of',
  'to',
  'that',
  'this',
  'is',
  'are',
  'using',
  'show',
  'add',
  'chart',
]);

function normalizeTokens(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/s\/r/g, 'sr support resistance')
    .replace(/s&d/g, 'supply demand')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));
}

export function searchPineReferences(
  query: string,
  category?: string,
  maxResults = 3,
): PineReferenceSummary[] {
  const qLower = (query || '').toLowerCase().trim();
  const catLower = (category || '').toLowerCase().trim();
  const tokens = normalizeTokens(query);

  if (!qLower && !catLower) {
    return listPineReferences().slice(0, maxResults);
  }

  const scored: Array<{ entry: PineReferenceEntry; score: number }> = [];

  for (const entry of REFERENCE_CATALOG) {
    let score = 0;
    const idLower = entry.id.toLowerCase();
    const titleLower = entry.title.toLowerCase();
    const categoryLower = entry.category.toLowerCase();
    const summaryLower = entry.summary.toLowerCase();
    const tagsJoined = entry.tags.join(' ').toLowerCase();

    if (catLower && (categoryLower === catLower || categoryLower.includes(catLower))) {
      score += 15;
    }

    if (qLower) {
      if (idLower === qLower || titleLower === qLower) score += 40;
      else if (idLower.includes(qLower) || titleLower.includes(qLower)) score += 20;

      for (const tag of entry.tags) {
        if (qLower.includes(tag) || tag.includes(qLower)) {
          score += 14;
        }
      }
    }

    for (const tok of tokens) {
      if (idLower.includes(tok)) score += 8;
      if (titleLower.includes(tok)) score += 8;
      if (categoryLower.includes(tok)) score += 6;
      if (entry.tags.some((t) => t === tok || t.includes(tok))) score += 10;
      else if (tagsJoined.includes(tok)) score += 5;
      if (summaryLower.includes(tok)) score += 4;
    }

    if (score > 0) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));

  return scored.slice(0, maxResults).map(({ entry }) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
    tags: entry.tags,
    pineVersion: entry.pineVersion,
    overlay: entry.overlay,
    summary: entry.summary,
    lineCount: entry.source.split('\n').length,
  }));
}

export function readPineReference(idOrQuery: string): PineReferenceEntry | null {
  const target = (idOrQuery || '').trim().toLowerCase();
  if (!target) return null;

  // 1. Exact ID or filename match
  const exact = REFERENCE_CATALOG.find(
    (entry) =>
      entry.id.toLowerCase() === target ||
      entry.fileName.toLowerCase() === target ||
      entry.fileName.replace(/\.md$/i, '').toLowerCase() === target ||
      entry.title.toLowerCase() === target,
  );
  if (exact) return exact;

  // 2. Substring ID or title match
  const partial = REFERENCE_CATALOG.find(
    (entry) =>
      entry.id.toLowerCase().includes(target) ||
      target.includes(entry.id.toLowerCase()) ||
      entry.title.toLowerCase().includes(target),
  );
  if (partial) return partial;

  // 3. Fallback to best search match
  const bestSearch = searchPineReferences(target, undefined, 1)[0];
  if (bestSearch) {
    return REFERENCE_CATALOG.find((entry) => entry.id === bestSearch.id) ?? null;
  }

  return null;
}

/**
 * Produces a compact version of a reference Pine Script for LLM tool consumption by
 * removing decorative separator banners and verbose JSDoc-style `@variable`/`@function`
 * comment lines while keeping 100% of executable code and section headers intact.
 */
export function compactReferenceSourceForPrompt(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^\/\/\s*[-═─━=*]{4,}/.test(t)) return false;
      if (/^\/\/\s*@(?:variable|function|type|field|param|returns)\b/.test(t)) return false;
      if (/^[a-zA-Z0-9_]+Tooltip\s*=\s*['"]/.test(t)) return false;
      if (/^tooltip\s*=\s*['"]/.test(t)) return false;
      if (/^alertcondition\s*\(/.test(t)) return false;
      return true;
    })
    .map((line) =>
      line
        .replace(/,\s*tooltip\s*=\s*[a-zA-Z0-9_]+Tooltip\b/g, '')
        .replace(/,\s*tooltip\s*=\s*["'][^"']*["']/g, ''),
    )
    .join('\n');
}

/**
 * Executes a reference library tool call requested by DeepSeek and returns a JSON string result.
 */
export function executeReferenceToolCall(
  toolName: string,
  rawArgs: string | Record<string, unknown>,
): string {
  let args: Record<string, unknown> = {};
  if (typeof rawArgs === 'string') {
    try {
      args = JSON.parse(rawArgs || '{}') as Record<string, unknown>;
    } catch {
      args = { query: rawArgs };
    }
  } else if (rawArgs && typeof rawArgs === 'object') {
    args = rawArgs;
  }

  if (toolName === 'search_pine_references') {
    const query = typeof args.query === 'string' ? args.query : '';
    const category = typeof args.category === 'string' ? args.category : undefined;
    const matches = searchPineReferences(query, category, 3);
    if (matches.length === 0) {
      return JSON.stringify({
        matches: [],
        note: 'No matching reference indicator found in the curated library. Proceed using your own Pine Script expertise and DeplyzeView runtime rules.',
      });
    }
    return JSON.stringify({
      matches,
      note: 'Call read_pine_reference with the "id" of the most relevant match to inspect its verified Pine Script implementation, or proceed with your own knowledge if none fit the user request.',
    });
  }

  if (toolName === 'read_pine_reference') {
    const id =
      typeof args.id === 'string'
        ? args.id
        : typeof args.query === 'string'
          ? args.query
          : '';
    const entry = readPineReference(id);
    if (!entry) {
      return JSON.stringify({
        found: false,
        availableIds: REFERENCE_CATALOG.map((e) => e.id),
        note: 'Reference ID not found. Use one of availableIds or proceed with your own Pine Script expertise.',
      });
    }
    return JSON.stringify({
      found: true,
      id: entry.id,
      title: entry.title,
      category: entry.category,
      referencePineVersion: entry.pineVersion,
      overlay: entry.overlay,
      summary: entry.summary,
      source: compactReferenceSourceForPrompt(entry.source),
      guidance:
        'CRITICAL: Study the domain logic, non-repainting structure/zone formulas, input parameters, and color palette from this reference, then synthesize a clean, concise 90-180 line indicator in the target Pine version. Do NOT copy 300+ lines or UDT/method boilerplate verbatim—use parallel typed arrays (array.new_box, array.new_float, array.new_int, array.new_line, array.new_label) guarded by "if array.size(arr) > 0" and explicit typed inputs (input.bool, input.int, input.float, input.color, input.string) so the script compiles on the first pass and streams fast.',
    });
  }

  return JSON.stringify({ error: `Unsupported tool "${toolName}".` });
}
