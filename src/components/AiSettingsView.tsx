import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Save,
  ShieldCheck,
  Cloud,
  AlertTriangle,
  PlugZap,
  RefreshCw,
  Eraser,
} from 'lucide-react';

/**
 * AI settings — deliberately provider-agnostic.
 *
 * The screen is driven entirely by /api/ai/settings, so the list of providers
 * lives in one place (ai-provider.ts) and this component never hard-codes a
 * vendor. The API key is write-only from the UI's point of view: the server
 * only ever reports whether one is present and where it came from.
 */

interface Preset {
  id: string;
  label: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'none';
  baseUrl: string;
  model: string;
  needsKey: boolean;
  note: string;
}

interface SettingsPayload {
  saved: {
    enabled: boolean;
    provider: Preset['provider'];
    baseUrl: string;
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    hasKey: boolean;
  };
  effective: {
    provider: Preset['provider'];
    baseUrl: string;
    model: string;
    temperature: number;
    maxTokens: number;
    source: 'settings' | 'env' | 'auto:ollama' | 'none';
    privacy: string;
    preset: string;
  };
  envProvided: { provider: string; baseUrl: string; model: string; hasKey: boolean } | null;
  configFile: string;
  presets: Preset[];
  warnings: string[];
}

interface TestResult {
  ok: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  source: string;
  privacy?: string;
  latencyMs: number;
  reply: string | null;
  error: string | null;
}

const SOURCE_LABEL: Record<SettingsPayload['effective']['source'], string> = {
  settings: 'saved in this app',
  env: 'environment variables',
  'auto:ollama': 'auto-detected local Ollama',
  none: 'not configured',
};

export const AiSettingsView: React.FC = () => {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [presetId, setPresetId] = useState<string>('custom');
  const [provider, setProvider] = useState<Preset['provider']>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testPrompt, setTestPrompt] = useState('');
  const [test, setTest] = useState<TestResult | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  const applyPayload = useCallback((p: SettingsPayload) => {
    setData(p);
    const s = p.saved;
    // Show what would actually be used: saved settings, else env, else detected.
    const source = p.effective.source === 'settings' ? s : null;
    setPresetId(p.effective.preset);
    setProvider(source ? s.provider : p.effective.provider);
    setBaseUrl(source ? s.baseUrl : p.effective.baseUrl);
    setModel(source ? s.model : p.effective.model);
    setTemperature(source ? s.temperature : p.effective.temperature);
    setMaxTokens(source ? s.maxTokens : p.effective.maxTokens);
    setSystemPrompt(s.systemPrompt || '');
    setEnabled(s.enabled);
    setApiKey('');
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/settings');
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      applyPayload(payload);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.message || 'could not load AI settings');
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedPreset = useMemo(() => data?.presets.find((p) => p.id === presetId) || null, [data, presetId]);

  const choosePreset = (id: string) => {
    setPresetId(id);
    setDirty(true);
    setModels([]);
    const preset = data?.presets.find((p) => p.id === id);
    if (!preset) return;
    setProvider(preset.provider);
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
  };

  const save = async () => {
    setSaving(true);
    setSaveNote(null);
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          provider,
          baseUrl,
          model,
          temperature,
          maxTokens,
          systemPrompt,
          // Only send the key when the user actually typed one.
          ...(apiKey ? { apiKey } : {}),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
      applyPayload(payload);
      setSaveNote('Saved');
      setTimeout(() => setSaveNote(null), 2500);
    } catch (err: any) {
      setSaveNote(`Not saved: ${err?.message || 'error'}`);
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: '' }),
      });
      const payload = await res.json();
      if (res.ok) applyPayload(payload);
      setSaveNote('Saved key cleared');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useForm: true,
          provider,
          baseUrl,
          model,
          apiKey,
          temperature,
          maxTokens: Math.min(maxTokens, 256),
          prompt: testPrompt,
        }),
      });
      const payload = await res.json();
      setTest(payload);
    } catch (err: any) {
      setTest({
        ok: false,
        provider,
        model,
        baseUrl,
        source: 'error',
        latencyMs: 0,
        reply: null,
        error: err?.message || 'request failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      const res = await fetch('/api/ai/models');
      const payload = await res.json();
      if (!payload.ok) setModelsError(payload.error || 'could not list models');
      setModels(payload.models || []);
      if (!payload.models?.length && !payload.error) setModelsError('The provider returned no models.');
    } catch (err: any) {
      setModelsError(err?.message || 'could not list models');
    } finally {
      setLoadingModels(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[#8A8A93] text-xs p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading AI settings…
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-[#EF4444] text-xs">
          <AlertTriangle className="w-4 h-4" /> Could not load AI settings: {loadError}
        </div>
        <button onClick={load} className="px-3 py-1.5 text-xs bg-[#1A1A1E] border border-[#2A2A2E] rounded text-[#E0E0E5]">
          Try again
        </button>
      </div>
    );
  }

  const isLocalEffective = /local|offline/.test(data.effective.privacy);
  const field = 'w-full bg-[#0D0D0F] border border-[#2A2A2E] rounded px-2.5 py-1.5 text-xs text-[#E0E0E5] focus:outline-none focus:border-[#00FF41]';
  const label = 'block text-[10px] uppercase tracking-wider text-[#6B6B75] mb-1';

  return (
    <div className="p-4 md:p-5 space-y-4 text-[#E0E0E5]">
      {/* current state */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#00FF41]" />
          <span className="font-semibold">AI provider</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider ${
            data.effective.source === 'none'
              ? 'border-[#EAB308]/40 text-[#EAB308]'
              : 'border-[#00FF41]/40 text-[#00FF41]'
          }`}
        >
          {data.effective.source === 'none' ? 'not configured' : `${data.effective.provider} · ${data.effective.model || 'no model'}`}
        </span>
        <span className="flex items-center gap-1 text-[#8A8A93]">
          {isLocalEffective ? <ShieldCheck className="w-3.5 h-3.5 text-[#00FF41]" /> : <Cloud className="w-3.5 h-3.5" />}
          {data.effective.privacy}
        </span>
        <span className="text-[#55555E]">from {SOURCE_LABEL[data.effective.source]}</span>
      </div>

      {data.warnings.map((w) => (
        <div key={w} className="flex items-start gap-2 text-[#EAB308] text-xs border border-[#EAB308]/30 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{w}</span>
        </div>
      ))}

      {data.envProvided && (
        <div className="text-[#8A8A93] text-[11px] border border-[#2A2A2E] rounded px-3 py-2">
          Environment variables are also set ({data.envProvided.provider} · {data.envProvided.baseUrl || 'no base URL'}
          {data.envProvided.hasKey ? ' · key present' : ''}). Saved settings in this app win over them.
        </div>
      )}

      {/* form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-[#2A2A2E] rounded p-3 bg-[#0F0F11] space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-[#6B6B75]">Provider</div>

          <div>
            <label className={label}>Preset</label>
            <select value={presetId} onChange={(e) => choosePreset(e.target.value)} className={field}>
              {data.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {selectedPreset && <div className="text-[10px] text-[#6B6B75] mt-1">{selectedPreset.note}</div>}
          </div>

          <div>
            <label className={label}>Base URL</label>
            <input
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setDirty(true);
                setPresetId('custom');
              }}
              placeholder="https://api.example.com/v1"
              className={field}
            />
          </div>

          <div>
            <label className={label}>Model</label>
            <div className="flex gap-2">
              <input
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setDirty(true);
                }}
                list="omniterm-ai-models"
                placeholder="model name"
                className={field}
              />
              <datalist id="omniterm-ai-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button
                onClick={loadModels}
                disabled={loadingModels}
                title="Ask the provider which models it offers (uses the saved settings)"
                className="shrink-0 px-2 py-1.5 text-[11px] bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[#00FF41]/50 flex items-center gap-1.5"
              >
                {loadingModels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Load
              </button>
            </div>
            {models.length > 0 && <div className="text-[10px] text-[#6B6B75] mt-1">{models.length} models available — start typing to pick one</div>}
            {modelsError && <div className="text-[10px] text-[#EAB308] mt-1">{modelsError}</div>}
          </div>

          <div>
            <label className={label}>API key</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setDirty(true);
                  }}
                  placeholder={data.saved.hasKey ? 'saved — leave blank to keep it' : 'paste your API key'}
                  className={`${field} pr-8`}
                  autoComplete="off"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B6B75] hover:text-[#E0E0E5]"
                  title={showKey ? 'Hide' : 'Show'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {data.saved.hasKey && (
                <button
                  onClick={clearKey}
                  title="Delete the stored key"
                  className="shrink-0 px-2 py-1.5 text-[11px] bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[#EF4444]/50 flex items-center gap-1.5"
                >
                  <Eraser className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Temperature ({temperature})</label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => {
                  setTemperature(Number(e.target.value));
                  setDirty(true);
                }}
                className="w-full accent-[#00FF41]"
              />
            </div>
            <div>
              <label className={label}>Max tokens</label>
              <input
                type="number"
                min={1}
                max={32000}
                value={maxTokens}
                onChange={(e) => {
                  setMaxTokens(Number(e.target.value));
                  setDirty(true);
                }}
                className={field}
              />
            </div>
          </div>

          <div>
            <label className={label}>System prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value);
                setDirty(true);
              }}
              rows={3}
              className={`${field} resize-y`}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-[#8A8A93]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setDirty(true);
              }}
              className="accent-[#00FF41]"
            />
            Enabled (used by the <code className="text-[#00FF41]">ai</code> command in the terminal)
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 text-xs bg-[#00FF41] text-black font-semibold rounded hover:bg-[#00FF41]/90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
            {dirty && <span className="text-[10px] text-[#EAB308]">unsaved changes</span>}
            {saveNote && <span className="text-[10px] text-[#8A8A93]">{saveNote}</span>}
          </div>
        </div>

        {/* test + where things live */}
        <div className="space-y-4">
          <div className="border border-[#2A2A2E] rounded p-3 bg-[#0F0F11] space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-[#6B6B75]">Test connection</div>
            <div className="text-[11px] text-[#8A8A93]">
              Sends a real request using the values above <em>without saving them</em>, so you can check a key before
              committing to it.
            </div>
            <input
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="prompt (default: a one-line connectivity check)"
              className={field}
            />
            <button
              onClick={runTest}
              disabled={testing}
              className="px-3 py-1.5 text-xs bg-[#1A1A1E] border border-[#2A2A2E] rounded hover:border-[#00FF41]/50 disabled:opacity-50 flex items-center gap-1.5"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5" />}
              Test
            </button>

            {test && (
              <div
                className={`rounded border px-3 py-2 text-[11px] space-y-1 ${
                  test.ok ? 'border-[#00FF41]/40' : 'border-[#EF4444]/40'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {test.ok ? (
                    <Check className="w-3.5 h-3.5 text-[#00FF41]" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-[#EF4444]" />
                  )}
                  <span className={test.ok ? 'text-[#00FF41]' : 'text-[#EF4444]'}>
                    {test.ok ? 'working' : 'failed'}
                  </span>
                  <span className="text-[#6B6B75]">
                    {test.provider}
                    {test.model ? ` · ${test.model}` : ''} · {test.latencyMs}ms
                  </span>
                </div>
                {test.reply && <pre className="whitespace-pre-wrap text-[#E0E0E5] font-mono">{test.reply}</pre>}
                {test.error && <pre className="whitespace-pre-wrap text-[#EF4444] font-mono">{test.error}</pre>}
              </div>
            )}
          </div>

          <div className="border border-[#2A2A2E] rounded p-3 bg-[#0F0F11] space-y-2 text-[11px] text-[#8A8A93]">
            <div className="text-[11px] uppercase tracking-wider text-[#6B6B75]">How this is stored</div>
            <div>
              Settings live in <code className="text-[#E0E0E5]">{data.configFile}</code> (mode 0600, readable only by
              you).
            </div>
            <div>
              The key is never returned to the interface — the app only ever reports whether one is saved.
            </div>
            <div>
              Local providers (Ollama, LM Studio, llama.cpp) keep everything on this machine. Cloud providers receive the
              prompt and any terminal context you attach to it.
            </div>
            <div>
              Environment variables still work for scripted setups: <code className="text-[#E0E0E5]">OMNITERM_AI_PROVIDER</code>,{' '}
              <code className="text-[#E0E0E5]">OMNITERM_AI_BASE_URL</code>, <code className="text-[#E0E0E5]">OMNITERM_AI_API_KEY</code>,{' '}
              <code className="text-[#E0E0E5]">OMNITERM_AI_MODEL</code>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
