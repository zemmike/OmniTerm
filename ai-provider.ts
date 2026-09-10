/**
 * Provider-agnostic AI layer for OmniTerm.
 *
 * Nothing here is tied to a single vendor: every provider is described by
 * (kind, baseUrl, model, apiKey), and the four kinds cover the field:
 *
 *   openai    any OpenAI-compatible /chat/completions endpoint — OpenAI,
 *             OpenRouter, Groq, DeepSeek, Mistral, Together, vLLM, LM Studio,
 *             llama.cpp's server, and Ollama's own /v1 compatibility layer
 *   anthropic the Messages API
 *   gemini    Google's generateContent
 *   ollama    a local Ollama daemon (no key, nothing leaves the machine)
 *
 * Settings live in <data dir>/ai-config.json (0600) and take precedence over
 * environment variables, which take precedence over auto-detection of a local
 * Ollama. The API key is never returned to the renderer: the UI only ever
 * learns whether a key is present and where it came from.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type AiKind = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'none';

export interface AiConfig {
  enabled: boolean;
  provider: AiKind;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export interface AiPreset {
  id: string;
  label: string;
  provider: AiKind;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  note: string;
}

const DATA_DIR =
  process.env.OMNITERM_DATA_DIR || path.join(os.homedir(), '.local', 'share', 'omniterm');
const CONFIG_FILE = process.env.OMNITERM_AI_CONFIG || path.join(DATA_DIR, 'ai-config.json');

export const DEFAULT_SYSTEM_PROMPT =
  'You are the assistant built into OmniTerm, a Linux terminal emulator. ' +
  'Answer with concrete, runnable commands, keep it short, and use fenced code blocks.';

export const AI_PRESETS: AiPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama (local)',
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'llama3.1',
    needsKey: false,
    note: 'Private: nothing leaves this machine.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    provider: 'openai',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'local-model',
    needsKey: false,
    note: 'Local OpenAI-compatible server.',
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp server (local)',
    provider: 'openai',
    baseUrl: 'http://127.0.0.1:8080/v1',
    model: 'local-model',
    needsKey: false,
    note: 'Local OpenAI-compatible server.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needsKey: true,
    note: 'Cloud: prompts and context leave this machine.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5',
    needsKey: true,
    note: 'Cloud: prompts and context leave this machine.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    needsKey: true,
    note: 'Cloud: prompts and context leave this machine.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    needsKey: true,
    note: 'Cloud gateway to many models.',
  },
  {
    id: 'groq',
    label: 'Groq',
    provider: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    needsKey: true,
    note: 'Cloud: fast hosted Llama/Mixtral.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    needsKey: true,
    note: 'Cloud: OpenAI-compatible.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    provider: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    needsKey: true,
    note: 'Cloud: OpenAI-compatible.',
  },
  {
    id: 'together',
    label: 'Together AI',
    provider: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    needsKey: true,
    note: 'Cloud: OpenAI-compatible.',
  },
  {
    id: 'custom',
    label: 'Custom endpoint',
    provider: 'openai',
    baseUrl: '',
    model: '',
    needsKey: true,
    note: 'Any OpenAI-compatible /chat/completions server.',
  },
];

const DEFAULTS: AiConfig = {
  enabled: true,
  provider: 'none',
  baseUrl: '',
  model: '',
  apiKey: '',
  temperature: 0.2,
  maxTokens: 1024,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

function normalise(raw: Partial<AiConfig>): AiConfig {
  const kind = String(raw.provider || 'none').toLowerCase();
  const provider: AiKind = (['openai', 'anthropic', 'gemini', 'ollama'] as const).includes(
    kind as any,
  )
    ? (kind as AiKind)
    : 'none';
  return {
    enabled: raw.enabled !== false,
    provider,
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl.trim().replace(/\/+$/, '') : '',
    model: typeof raw.model === 'string' ? raw.model.trim() : '',
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
    temperature: clamp(raw.temperature as number, 0, 2, DEFAULTS.temperature),
    maxTokens: Math.round(clamp(raw.maxTokens as number, 1, 32000, DEFAULTS.maxTokens)),
    systemPrompt:
      typeof raw.systemPrompt === 'string' && raw.systemPrompt.trim()
        ? raw.systemPrompt.trim()
        : DEFAULT_SYSTEM_PROMPT,
  };
}

/** Normalise an arbitrary partial config (used for "test without saving"). */
export function normaliseConfig(partial: Partial<AiConfig>): AiConfig {
  return normalise(partial);
}

/** Raw saved settings, exactly as written to disk. */
export function loadAiConfig(): AiConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return normalise(parsed);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAiConfig(patchIn: Partial<AiConfig>): AiConfig {
  const current = loadAiConfig();
  const patch: Partial<AiConfig> = { ...patchIn };
  // Omitted key means "leave it alone"; an explicit empty string clears it.
  if (patch.apiKey === undefined) delete patch.apiKey;
  const next = normalise({ ...current, ...patch });
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

/** Preset matching the current base URL, so the UI can show what is selected. */
export function presetFor(config: AiConfig): string {
  const hit = AI_PRESETS.find(
    (p) => p.provider === config.provider && p.baseUrl && p.baseUrl === config.baseUrl,
  );
  return hit ? hit.id : 'custom';
}

// ------------------------------------------------------------------ resolution

export interface AiEffective {
  config: AiConfig;
  /** Where the active configuration came from. */
  source: 'settings' | 'env' | 'auto:ollama' | 'none';
  /** Human-readable privacy statement for the UI. */
  privacy: string;
  /** Anything the user should know (e.g. a local daemon that is not running). */
  warnings: string[];
}

function fromEnv(): Partial<AiConfig> | null {
  const provider = (process.env.OMNITERM_AI_PROVIDER || '').toLowerCase();
  const baseUrl = process.env.OMNITERM_AI_BASE_URL || '';
  const model = process.env.OMNITERM_AI_MODEL || '';
  const key =
    process.env.OMNITERM_AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    '';
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

  if (provider || baseUrl || key) {
    const kind: AiKind = (['openai', 'anthropic', 'gemini', 'ollama'] as AiKind[]).includes(
      provider as AiKind,
    )
      ? (provider as AiKind)
      : baseUrl
        ? 'openai'
        : 'none';
    if (kind === 'none' && !geminiKey) return null;
    const preset =
      AI_PRESETS.find((p) => p.provider === kind && (!baseUrl || p.baseUrl === baseUrl)) ||
      AI_PRESETS[0];
    return {
      provider: kind,
      baseUrl: baseUrl || (kind === 'ollama' ? OLLAMA_DEFAULT_URL : preset.baseUrl),
      model: model || preset.model,
      apiKey: key,
      enabled: true,
    };
  }
  // Convenience: a bare Gemini key behaves like the Gemini preset.
  if (geminiKey) {
    const preset = AI_PRESETS.find((p) => p.id === 'gemini')!;
    return {
      provider: 'gemini',
      baseUrl: preset.baseUrl,
      model: model || preset.model,
      apiKey: geminiKey,
      enabled: true,
    };
  }
  return null;
}

export const OLLAMA_DEFAULT_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

export async function ollamaAvailable(baseUrl = OLLAMA_DEFAULT_URL): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/** The configuration that will actually be used right now. */
export async function aiEffective(): Promise<AiEffective> {
  const saved = loadAiConfig();
  if (saved.enabled && saved.provider !== 'none') {
    return {
      config: saved,
      source: 'settings',
      privacy: isLocal(saved)
        ? 'local — nothing leaves this machine'
        : `cloud — prompts are sent to ${saved.baseUrl}`,
      warnings: [],
    };
  }

  const env = fromEnv();
  if (env) {
    const config = normalise({ ...DEFAULTS, ...env });
    if (config.provider !== 'none') {
      return {
        config,
        source: 'env',
        privacy: isLocal(config)
          ? 'local — nothing leaves this machine'
          : `cloud — prompts are sent to ${config.baseUrl}`,
        warnings: [],
      };
    }
  }

  const preset = AI_PRESETS.find((p) => p.id === 'ollama')!;
  const localUrl = process.env.OLLAMA_URL || preset.baseUrl;
  if (await ollamaAvailable(localUrl)) {
    // Prefer a model that is actually installed on this machine: a local daemon
    // is no use if we keep asking for a model nobody ever pulled.
    let model = process.env.OMNITERM_OLLAMA_MODEL || preset.model;
    try {
      const tags = await getJson(`${localUrl}/api/tags`, {}, 4000);
      const installed: string[] = (tags?.models || []).map((m: any) => m.name).filter(Boolean);
      if (installed.length && !installed.includes(model)) model = installed[0];
    } catch {
      /* keep the configured default */
    }
    return {
      config: normalise({ ...DEFAULTS, provider: 'ollama', baseUrl: localUrl, model }),
      source: 'auto:ollama',
      privacy: 'local — nothing leaves this machine',
      warnings: [],
    };
  }

  return {
    config: { ...DEFAULTS },
    source: 'none',
    privacy: 'offline — no AI provider configured',
    warnings: [
      'No provider configured. Set OMNITERM_AI_PROVIDER, OMNITERM_AI_BASE_URL and OMNITERM_AI_MODEL, write ~/.local/share/omniterm/ai-config.json, or start Ollama for a local model — see the AI section of the README.',
    ],
  };
}

function isLocal(config: AiConfig): boolean {
  return (
    config.provider === 'ollama' ||
    /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)/.test(config.baseUrl)
  );
}

// ---------------------------------------------------------------------- calls

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* keep the raw text for the error message */
    }
    if (!res.ok) {
      const detail =
        (json && (json.error?.message || json.message || json.error)) || text.slice(0, 300) || '';
      throw new Error(
        `${res.status} ${res.statusText}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`.slice(
          0,
          400,
        ),
      );
    }
    return json;
  } catch (err: any) {
    if (err?.name === 'AbortError')
      throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string, headers: Record<string, string>, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const detail = (json && (json.error?.message || json.error)) || text.slice(0, 200) || '';
      throw new Error(
        `${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`.slice(0, 300),
      );
    }
    return json;
  } catch (err: any) {
    if (err?.name === 'AbortError')
      throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** One chat turn against whatever provider is configured. Throws on failure. */
export async function aiChat(
  system: string,
  user: string,
  override?: AiConfig,
): Promise<{ text: string; source: string; latencyMs: number }> {
  const { config, source } = override
    ? { config: override, source: 'settings' as const }
    : await aiEffective();
  if (config.provider === 'none') {
    throw new Error(
      'no AI provider configured — set OMNITERM_AI_PROVIDER/OMNITERM_AI_BASE_URL/OMNITERM_AI_MODEL, write ~/.local/share/omniterm/ai-config.json, or run Ollama locally (see the README)',
    );
  }
  if (!config.baseUrl) throw new Error('no base URL configured');
  // A key is only required for a remote endpoint: local OpenAI-compatible
  // servers (Ollama's /v1, LM Studio, llama.cpp, vLLM) take no API key, and
  // refusing to try them would break the most private setups.
  if (config.provider !== 'ollama' && !isLocal(config) && !config.apiKey) {
    throw new Error(`no API key configured for ${config.provider} at ${config.baseUrl}`);
  }

  const started = Date.now();
  let text = '';
  const sys = system || config.systemPrompt;

  if (config.provider === 'openai') {
    const json = await postJson(
      `${config.baseUrl}/chat/completions`,
      config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
      {
        model: config.model,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: config.temperature,
        max_tokens: config.maxTokens,
      },
      45000,
    );
    text = json?.choices?.[0]?.message?.content ?? '';
  } else if (config.provider === 'anthropic') {
    const json = await postJson(
      `${config.baseUrl}/messages`,
      { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        system: sys,
        messages: [{ role: 'user', content: user }],
      },
      45000,
    );
    text = (json?.content || []).map((part: any) => part?.text || '').join('') || '';
  } else if (config.provider === 'gemini') {
    const json = await postJson(
      `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      {},
      {
        contents: [{ role: 'user', parts: [{ text: user }] }],
        systemInstruction: { parts: [{ text: sys }] },
        generationConfig: { temperature: config.temperature, maxOutputTokens: config.maxTokens },
      },
      45000,
    );
    text =
      (json?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('') || '';
    if (!text && json?.promptFeedback?.blockReason)
      throw new Error(`blocked by provider: ${json.promptFeedback.blockReason}`);
  } else if (config.provider === 'ollama') {
    const json = await postJson(
      `${config.baseUrl}/api/chat`,
      {},
      {
        model: config.model,
        stream: false,
        options: { temperature: config.temperature, num_predict: config.maxTokens },
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
      },
      120000,
    );
    text = json?.message?.content ?? '';
  }

  if (!String(text).trim()) throw new Error('provider returned an empty response');
  return {
    text: String(text),
    source: `${config.provider}:${config.model}${source === 'settings' ? '' : ` (${source})`}`,
    latencyMs: Date.now() - started,
  };
}

/** Ask the provider something trivial, to prove the settings work. */
export async function aiTest(prompt?: string, override?: AiConfig) {
  const question =
    prompt && prompt.trim() ? prompt.trim() : 'Reply with exactly: OmniTerm AI link OK';
  const started = Date.now();
  try {
    const reply = await aiChat(DEFAULT_SYSTEM_PROMPT, question, override);
    const { config, source, privacy } = await aiEffective();
    return {
      ok: true,
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      source,
      privacy,
      latencyMs: reply.latencyMs,
      reply: reply.text.slice(0, 800),
      error: null,
    };
  } catch (err: any) {
    const { config, source } = await aiEffective();
    return {
      ok: false,
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      source,
      latencyMs: Date.now() - started,
      reply: null,
      error: err?.message || String(err),
    };
  }
}

/** Whatever models the provider will admit to, for the model picker. */
export async function aiListModels(): Promise<{
  ok: boolean;
  models: string[];
  error: string | null;
}> {
  const { config } = await aiEffective();
  try {
    if (config.provider === 'ollama') {
      const json = await getJson(`${config.baseUrl}/api/tags`, {}, 8000);
      return {
        ok: true,
        models: (json?.models || [])
          .map((m: any) => m.name)
          .filter(Boolean)
          .sort(),
        error: null,
      };
    }
    if (config.provider === 'openai') {
      const json = await getJson(
        `${config.baseUrl}/models`,
        config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
        12000,
      );
      const models = (json?.data || json?.models || [])
        .map((m: any) => m.id || m.name)
        .filter(Boolean);
      return { ok: true, models: [...new Set(models)].sort() as string[], error: null };
    }
    if (config.provider === 'anthropic') {
      const json = await getJson(
        `${config.baseUrl}/models`,
        { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
        12000,
      );
      return {
        ok: true,
        models: (json?.data || []).map((m: any) => m.id).filter(Boolean),
        error: null,
      };
    }
    if (config.provider === 'gemini') {
      const json = await getJson(
        `${config.baseUrl}/models?key=${encodeURIComponent(config.apiKey)}`,
        {},
        12000,
      );
      const models = (json?.models || [])
        .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m: any) => String(m.name || '').replace(/^models\//, ''))
        .filter(Boolean);
      return { ok: true, models: [...new Set(models)].sort() as string[], error: null };
    }
    return { ok: false, models: [], error: 'configure a provider first' };
  } catch (err: any) {
    return { ok: false, models: [], error: err?.message || String(err) };
  }
}

/** UI-facing view of the settings. Never includes the API key itself. */
export async function aiSettingsForUi() {
  const saved = loadAiConfig();
  const effective = await aiEffective();
  const env = fromEnv();
  return {
    saved: {
      enabled: saved.enabled,
      provider: saved.provider,
      baseUrl: saved.baseUrl,
      model: saved.model,
      temperature: saved.temperature,
      maxTokens: saved.maxTokens,
      systemPrompt: saved.systemPrompt,
      hasKey: Boolean(saved.apiKey),
    },
    effective: {
      provider: effective.config.provider,
      baseUrl: effective.config.baseUrl,
      model: effective.config.model,
      temperature: effective.config.temperature,
      maxTokens: effective.config.maxTokens,
      source: effective.source,
      privacy: effective.privacy,
      preset: presetFor(effective.config),
    },
    envProvided: env
      ? {
          provider: env.provider,
          baseUrl: env.baseUrl,
          model: env.model,
          hasKey: Boolean(env.apiKey),
        }
      : null,
    configFile: CONFIG_FILE,
    presets: AI_PRESETS,
    warnings: effective.warnings,
  };
}
