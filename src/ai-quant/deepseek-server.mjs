import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';
export const MAX_IMAGE_DATA_URL_LENGTH = 15 * 1024 * 1024;
export const MAX_IMAGES_PER_MESSAGE = 4;

export function parseDotEnvText(text) {
  const result = {};
  const cleaned = text.replace(/^\uFEFF/, '');
  for (const rawLine of cleaned.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const stripped = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eqIdx = stripped.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = stripped.slice(0, eqIdx).trim();
    let val = stripped.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

export function validateDeepSeekBaseUrl(rawUrl) {
  const trimmed = String(rawUrl || DEFAULT_DEEPSEEK_BASE_URL).trim().replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid DEEPSEEK_BASE_URL');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) ||
      parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('DEEPSEEK_BASE_URL requires HTTPS (or loopback HTTP for local testing) without embedded credentials, query, or fragment');
  }
  return trimmed;
}

export function validateDeepSeekModel(rawModel) {
  const trimmed = String(rawModel || DEFAULT_DEEPSEEK_MODEL).trim();
  if (!trimmed) return DEFAULT_DEEPSEEK_MODEL;
  if (trimmed !== 'deepseek-flash' && !trimmed.startsWith('deepseek-flash')) {
    throw new Error(`Unsupported model "${trimmed}". AI Quant exclusively uses deepseek-flash.`);
  }
  return trimmed;
}

function resolveWorktreeMainEnvPath(cwd = process.cwd()) {
  try {
    const gitFile = readFileSync(resolve(cwd, '.git'), 'utf8').trim();
    const match = gitFile.match(/^gitdir:\s*(.+)$/i);
    if (!match) return null;
    const gitDir = resolve(cwd, match[1].trim());
    const worktreesMatch = gitDir.replace(/\\/g, '/').match(/^(.*)\/\.git\/worktrees\/[^/]+$/);
    if (worktreesMatch && worktreesMatch[1]) {
      return resolve(worktreesMatch[1], '.env');
    }
  } catch {
    /* Not a git worktree file */
  }
  return null;
}

export function resolveDeepSeekServerConfig({ env = process.env, dotenvPath = resolve(process.cwd(), '.env') } = {}) {
  const fileVars = {};
  const candidatePaths = [];
  if (dotenvPath) {
    candidatePaths.push(dotenvPath);
    if (dotenvPath === resolve(process.cwd(), '.env')) {
      const mainRepoEnv = resolveWorktreeMainEnvPath(process.cwd());
      if (mainRepoEnv && mainRepoEnv !== dotenvPath) {
        candidatePaths.push(mainRepoEnv);
      }
    }
  }
  for (const path of candidatePaths) {
    try {
      const parsed = parseDotEnvText(readFileSync(path, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (!fileVars[k] && typeof v === 'string' && v.trim()) {
          fileVars[k] = v.trim();
        } else if (!(k in fileVars)) {
          fileVars[k] = v;
        }
      }
    } catch {
      /* .env is optional if environment variables are supplied directly */
    }
  }
  const getVar = (key) => {
    const fromEnv = typeof env[key] === 'string' ? env[key].trim() : '';
    if (fromEnv) return fromEnv;
    const fromFile = typeof fileVars[key] === 'string' ? fileVars[key].trim() : '';
    return fromFile;
  };

  const baseUrl = validateDeepSeekBaseUrl(getVar('DEEPSEEK_BASE_URL') || DEFAULT_DEEPSEEK_BASE_URL);
  const model = validateDeepSeekModel(getVar('DEEPSEEK_MODEL') || DEFAULT_DEEPSEEK_MODEL);
  const apiKey = getVar('DEEPSEEK_API_KEY');
  if (!apiKey) {
    throw new Error('DeepSeek API key is not configured. Add DEEPSEEK_API_KEY to your local .env file.');
  }
  return { apiKey, baseUrl, model };
}

export function redactSecrets(message, apiKey) {
  let text = String(message ?? '');
  if (apiKey && apiKey.trim()) {
    text = text.split(apiKey.trim()).join('[REDACTED]');
  }
  return text.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}

export function validateServerMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Request must contain at least one message.');
  }
  const allowedPrefixes = [
    'data:image/jpeg;base64,',
    'data:image/png;base64,',
    'data:image/gif;base64,',
    'data:image/webp;base64,',
  ];
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') throw new Error('Invalid message object.');
    const { role, content } = msg;
    if (!['system', 'user', 'assistant', 'tool'].includes(role)) {
      throw new Error(`Unsupported message role "${role}".`);
    }
    if (typeof content === 'string') continue;
    if (content === null && role === 'assistant') continue;
    if (Array.isArray(content)) {
      if (role !== 'user') {
        throw new Error("Multimodal content arrays with images are only supported in 'user' role messages.");
      }
      if (content.length === 0) {
        throw new Error('User message content array cannot be empty.');
      }
      let imageCount = 0;
      for (const part of content) {
        if (!part || typeof part !== 'object') throw new Error('Invalid content part.');
        if (part.type === 'text') {
          if (typeof part.text !== 'string') throw new Error("Text content part is missing 'text' string.");
        } else if (part.type === 'image_url') {
          imageCount += 1;
          if (imageCount > MAX_IMAGES_PER_MESSAGE) {
            throw new Error(`A single message can include at most ${MAX_IMAGES_PER_MESSAGE} reference images.`);
          }
          const url = part.image_url?.url;
          if (typeof url !== 'string' || !url.trim()) {
            throw new Error("image_url part is missing 'image_url.url'.");
          }
          const trimmed = url.trim();
          if (trimmed.length > MAX_IMAGE_DATA_URL_LENGTH) {
            throw new Error('Attached image exceeds the maximum supported size (10 MB).');
          }
          const isDataUrl = allowedPrefixes.some(prefix => trimmed.startsWith(prefix));
          const isFileIdOrHttps = trimmed.startsWith('file-') || trimmed.startsWith('https://');
          if (!isDataUrl && !isFileIdOrHttps) {
            throw new Error('Unsupported image format. Only JPEG, PNG, GIF, and WebP images are supported.');
          }
          if (isDataUrl) {
            const b64 = trimmed.split(';base64,')[1] ?? '';
            if (!b64.trim()) throw new Error('Attached image payload is empty.');
          }
        } else {
          throw new Error(`Unsupported message content part type "${part.type}".`);
        }
      }
      continue;
    }
    throw new Error('Message content must be a string or valid user content array.');
  }
}

function readJsonBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        rejectBody(new Error('Request payload exceeds maximum size limit.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        rejectBody(new Error('Invalid JSON request body.'));
      }
    });
    req.on('error', rejectBody);
  });
}

export function createAiQuantMiddleware({
  env = process.env,
  dotenvPath = resolve(process.cwd(), '.env'),
  fetcher = globalThis.fetch,
} = {}) {
  const activeControllers = new Map();

  return async function aiQuantMiddleware(req, res, next) {
    const url = req.url ? req.url.split('?')[0] : '';
    if (!url.startsWith('/__deplyzeview_ai_quant')) {
      if (typeof next === 'function') return next();
      res.writeHead(404);
      res.end();
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const sendJson = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url === '/__deplyzeview_ai_quant/status' && req.method === 'GET') {
      try {
        const cfg = resolveDeepSeekServerConfig({ env, dotenvPath });
        return sendJson(200, {
          configured: true,
          model: cfg.model,
          baseUrl: cfg.baseUrl,
        });
      } catch (error) {
        return sendJson(200, {
          configured: false,
          model: DEFAULT_DEEPSEEK_MODEL,
          baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (url === '/__deplyzeview_ai_quant/cancel' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 64 * 1024);
        const requestId = String(body.requestId || '');
        const controller = activeControllers.get(requestId);
        if (controller) {
          controller.abort();
          activeControllers.delete(requestId);
          return sendJson(200, { cancelled: true });
        }
        return sendJson(200, { cancelled: false });
      } catch (error) {
        return sendJson(400, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (url === '/__deplyzeview_ai_quant/chat' && req.method === 'POST') {
      let apiKey = '';
      let requestId = '';
      try {
        const body = await readJsonBody(req);
        requestId = String(body.requestId || `req-${Date.now()}`);
        const messages = body.messages;
        const tools = Array.isArray(body.tools) && body.tools.length > 0 ? body.tools : undefined;
        const temperature = typeof body.temperature === 'number' ? body.temperature : 0.2;

        validateServerMessages(messages);
        const cfg = resolveDeepSeekServerConfig({ env, dotenvPath });
        apiKey = cfg.apiKey;

        const controller = new AbortController();
        activeControllers.set(requestId, controller);
        req.on('close', () => {
          if (!res.writableEnded) controller.abort();
          activeControllers.delete(requestId);
        });

        const endpoint = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
        const payload = {
          model: cfg.model,
          messages,
          stream: true,
          thinking: { type: 'disabled' },
          max_tokens: 8192,
          temperature,
          ...(tools ? { tools } : {}),
        };

        let upstream = null;
        for (let attempt = 0; attempt <= 2; attempt++) {
          upstream = await fetcher(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
              'Accept-Encoding': 'identity',
              'Connection': 'keep-alive',
              'Authorization': `Bearer ${cfg.apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300_000)]),
            redirect: 'error',
          });
          if ([429, 502, 503, 504].includes(upstream.status) && attempt < 2 && !controller.signal.aborted) {
            await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
            continue;
          }
          break;
        }

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => '');
          activeControllers.delete(requestId);
          let errMessage = '';
          try {
            const parsed = JSON.parse(errText);
            errMessage = parsed?.error?.message || '';
          } catch { /* ignore */ }
          if (!errMessage) {
            if (upstream.status === 401 || upstream.status === 403) {
              errMessage = 'DeepSeek API authentication failed. Verify DEEPSEEK_API_KEY in your .env file.';
            } else if (upstream.status === 429) {
              errMessage = 'DeepSeek API rate limit reached. Please wait a moment and try again.';
            } else {
              errMessage = `DeepSeek API returned HTTP ${upstream.status}`;
            }
          }
          return sendJson(upstream.status, { error: redactSecrets(errMessage, apiKey) });
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        const reader = upstream.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let fullReasoning = '';
        let sawDone = false;
        const toolCalls = [];

        if (reader) {
          try {
            streamLoop: while (!controller.signal.aborted) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              let newlineIdx;
              while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newlineIdx).trim();
                buffer = buffer.slice(newlineIdx + 1);
                if (!line || line.startsWith(':')) continue;
                if (!line.startsWith('data:')) continue;
                const dataStr = line.slice(5).trim();
                if (dataStr === '[DONE]') {
                  sawDone = true;
                  break streamLoop;
                }
                try {
                  const frame = JSON.parse(dataStr);
                  const delta = frame?.choices?.[0]?.delta;
                  if (!delta) continue;
                  const contentDelta = typeof delta.content === 'string' ? delta.content : '';
                  const reasoningDelta = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
                  if (contentDelta) fullContent += contentDelta;
                  if (reasoningDelta) fullReasoning += reasoningDelta;
                  if (Array.isArray(delta.tool_calls)) {
                    for (const tc of delta.tool_calls) {
                      const idx = Number(tc.index ?? 0);
                      while (toolCalls.length <= idx) {
                        toolCalls.push({ id: '', type: 'function', function: { name: '', arguments: '' } });
                      }
                      if (tc.id) toolCalls[idx].id = tc.id;
                      if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
                      if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                  }
                  if (contentDelta || reasoningDelta) {
                    res.write(`data: ${JSON.stringify({ type: 'delta', delta: contentDelta, reasoningDelta })}\n\n`);
                  }
                } catch {
                  /* ignore malformed SSE chunk */
                }
              }
            }
          } catch (readErr) {
            const fenceCount = (fullContent.match(/```/g) || []).length;
            const hasCompleteCode = sawDone || (fenceCount >= 2 && fullContent.includes('indicator('));
            if (!hasCompleteCode && !controller.signal.aborted) {
              // Seamless fallback to non-streaming completion if the SSE socket broke mid-stream
              const fbRes = await fetcher(endpoint, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'Accept-Encoding': 'identity',
                  'Authorization': `Bearer ${cfg.apiKey}`,
                },
                body: JSON.stringify({ ...payload, stream: false }),
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]),
                redirect: 'error',
              }).catch(() => null);

              let recovered = false;
              if (fbRes && fbRes.ok) {
                const fbJson = await fbRes.json().catch(() => null);
                const fbContent = fbJson?.choices?.[0]?.message?.content;
                if (typeof fbContent === 'string' && fbContent.trim()) {
                  fullContent = fbContent;
                  res.write(`data: ${JSON.stringify({ type: 'delta', delta: fbContent, reasoningDelta: '' })}\n\n`);
                  recovered = true;
                }
              }
              if (!recovered) {
                throw readErr;
              }
            }
          }
        }

        activeControllers.delete(requestId);
        const cleanedContent = fullContent.replace(/<ds_safety>[\s\S]*$/i, '').trim();
        res.write(`data: ${JSON.stringify({
          type: 'done',
          content: cleanedContent,
          reasoning: fullReasoning,
          toolCalls,
          model: cfg.model,
        })}\n\n`);
        res.end();
      } catch (error) {
        activeControllers.delete(requestId);
        const rawMsg = error?.name === 'AbortError'
          ? 'Generation cancelled by user.'
          : (error instanceof Error ? error.message : String(error));
        const safeMsg = redactSecrets(rawMsg, apiKey);
        if (!res.headersSent) {
          sendJson(400, { error: safeMsg });
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', error: safeMsg })}\n\n`);
          res.end();
        }
      }
      return;
    }

    sendJson(405, { error: 'Method not allowed' });
  };
}
