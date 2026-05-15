"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Check, ChevronDown, ChevronUp, Mic, Volume2, Bot } from "lucide-react";

const SETTINGS_KEY = "pitchperfect_model_settings";

type ProviderConfig = Record<string, string>;

type ModelSettings = {
  ttsProvider: string;
  sttProvider: string;
  llmModel: string;
  ttsConfig: ProviderConfig;
  sttConfig: ProviderConfig;
  llmConfig: ProviderConfig;
};

const DEFAULT_SETTINGS: ModelSettings = {
  ttsProvider: "sarvam",
  sttProvider: "sarvam",
  llmModel: "kimi-k2",
  ttsConfig: {},
  sttConfig: {},
  llmConfig: {},
};

type Field = { key: string; label: string; placeholder?: string; type?: string; hint?: string; options?: { value: string; label: string }[] };

type ProviderDef = {
  id: string;
  label: string;
  sublabel: string;
  badge?: string;
  color: string;
  fields: Field[];
};

const TTS_PROVIDERS: ProviderDef[] = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    sublabel: "eleven_turbo_v2_5 · low latency · multilingual",
    color: "bg-violet-500/15 text-violet-400",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sk-…", type: "password", hint: "From elevenlabs.io → Profile → API keys" },
      { key: "voiceId", label: "Voice ID", placeholder: "21m00Tcm4TlvDq8ikWAM", hint: "Voice ID from ElevenLabs voice library" },
      {
        key: "model", label: "Model", options: [
          { value: "eleven_turbo_v2_5", label: "Turbo v2.5 (recommended)" },
          { value: "eleven_multilingual_v2", label: "Multilingual v2 (higher quality)" },
          { value: "eleven_flash_v2_5", label: "Flash v2.5 (ultra-low latency)" },
        ],
      },
    ],
  },
  {
    id: "sarvam",
    label: "Sarvam AI TTS",
    sublabel: "Saaras · optimised for 11 Indian languages",
    badge: "Active",
    color: "bg-orange-500/15 text-orange-400",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sarvam-…", type: "password", hint: "From dashboard.sarvam.ai → API Keys" },
      {
        key: "voice", label: "Voice", options: [
          { value: "meera", label: "Meera (Hindi female)" },
          { value: "arjun", label: "Arjun (Hindi male)" },
          { value: "amol", label: "Amol (Marathi male)" },
          { value: "anushka", label: "Anushka (Telugu female)" },
          { value: "arvind", label: "Arvind (Tamil male)" },
        ],
      },
      {
        key: "model", label: "Model", options: [
          { value: "bulbul:v2", label: "Bulbul v2 (recommended)" },
          { value: "bulbul:v1", label: "Bulbul v1" },
        ],
      },
    ],
  },
  {
    id: "local",
    label: "Local / System TTS",
    sublabel: "Web Speech API · no API key required · browser-native",
    color: "bg-green-500/15 text-green-400",
    fields: [
      {
        key: "voice", label: "System Voice", placeholder: "e.g. Google हिन्दी", hint: "Voice name from your OS speech settings. Leave blank to use default.",
      },
      {
        key: "rate", label: "Speech Rate", placeholder: "1.0", hint: "0.5 (slow) to 2.0 (fast). Default: 1.0",
      },
    ],
  },
];

const STT_PROVIDERS: ProviderDef[] = [
  {
    id: "elevenlabs",
    label: "ElevenLabs Scribe",
    sublabel: "scribe_v2_realtime · auto language detection",
    color: "bg-violet-500/15 text-violet-400",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sk-…", type: "password", hint: "Shared with TTS if both use ElevenLabs" },
      {
        key: "model", label: "Model", options: [
          { value: "scribe_v2_realtime", label: "Scribe v2 Realtime (recommended)" },
          { value: "scribe_v2", label: "Scribe v2 (batch, higher accuracy)" },
        ],
      },
    ],
  },
  {
    id: "sarvam",
    label: "Sarvam AI STT",
    sublabel: "Saarika v2 · purpose-built Indic ASR",
    badge: "Active",
    color: "bg-orange-500/15 text-orange-400",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sarvam-…", type: "password", hint: "Shared with TTS if both use Sarvam AI" },
      {
        key: "model", label: "Model", options: [
          { value: "saarika:v2", label: "Saarika v2 (recommended)" },
          { value: "saarika:v1", label: "Saarika v1" },
          { value: "saarika:flash", label: "Saarika Flash (ultra-low latency)" },
        ],
      },
      { key: "language", label: "Language Hint", placeholder: "hi-IN", hint: "BCP-47 code. Leave blank for auto-detect." },
    ],
  },
  {
    id: "google",
    label: "Google Cloud STT",
    sublabel: "speech-to-text v2 · broad language support",
    color: "bg-blue-500/15 text-blue-400",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "AIza…", type: "password", hint: "From Google Cloud Console → APIs & Services → Credentials" },
      {
        key: "model", label: "Model", options: [
          { value: "latest_long", label: "Latest Long (general purpose)" },
          { value: "latest_short", label: "Latest Short (low latency)" },
          { value: "phone_call", label: "Phone Call (telephony-optimised)" },
        ],
      },
      { key: "language", label: "Language Code", placeholder: "hi-IN", hint: "e.g. hi-IN, en-IN, ta-IN, te-IN" },
    ],
  },
  {
    id: "whisper",
    label: "Whisper (Local)",
    sublabel: "OpenAI Whisper · self-hosted · no API cost",
    color: "bg-green-500/15 text-green-400",
    fields: [
      { key: "endpoint", label: "Endpoint URL", placeholder: "http://localhost:9000/asr", hint: "Your local Whisper server (e.g. whisper.cpp HTTP server)" },
      {
        key: "model", label: "Model Size", options: [
          { value: "base", label: "Base (fast, lower accuracy)" },
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium (recommended)" },
          { value: "large-v3", label: "Large v3 (highest accuracy)" },
        ],
      },
    ],
  },
];

const LLM_PROVIDERS: ProviderDef[] = [
  {
    id: "kimi-k2",
    label: "Moonshot Kimi-K2.6",
    sublabel: "via vLLM · reasoning disabled for low latency",
    badge: "Active",
    color: "bg-violet-500/15 text-violet-400",
    fields: [
      { key: "apiKey", label: "API Key / vLLM token", placeholder: "sk-…", type: "password" },
      { key: "baseUrl", label: "Base URL", placeholder: "https://your-vllm-host/v1", hint: "OpenAI-compatible endpoint" },
      { key: "model", label: "Model name", placeholder: "moonshotai/Kimi-K2-Instruct" },
    ],
  },
  {
    id: "gpt4o",
    label: "OpenAI GPT-4o",
    sublabel: "gpt-4o · fastest OpenAI model",
    color: "bg-emerald-500/15 text-emerald-400",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sk-…", type: "password", hint: "From platform.openai.com → API keys" },
      {
        key: "model", label: "Model", options: [
          { value: "gpt-4o", label: "GPT-4o" },
          { value: "gpt-4o-mini", label: "GPT-4o mini (cheaper)" },
          { value: "gpt-4.1", label: "GPT-4.1" },
        ],
      },
    ],
  },
  {
    id: "sarvam",
    label: "Sarvam AI — Sarvam-M",
    sublabel: "multilingual Indic LLM · Hindi / Hinglish native",
    color: "bg-orange-500/15 text-orange-400",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sarvam-…", type: "password", hint: "From dashboard.sarvam.ai → API Keys" },
      { key: "model", label: "Model", placeholder: "sarvam-m" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini Flash",
    sublabel: "gemini-2.0-flash · low cost, high throughput",
    color: "bg-blue-500/15 text-blue-400",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "AIza…", type: "password", hint: "From Google AI Studio → Get API key" },
      {
        key: "model", label: "Model", options: [
          { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (recommended)" },
          { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
          { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
        ],
      },
    ],
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<ModelSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) }); } catch {}
    }
  }, []);

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function setTtsConfig(provId: string, key: string, val: string) {
    setSettings((s) => ({
      ...s,
      ttsConfig: { ...s.ttsConfig, [`${provId}.${key}`]: val },
    }));
  }

  function setSTTConfig(provId: string, key: string, val: string) {
    setSettings((s) => ({
      ...s,
      sttConfig: { ...s.sttConfig, [`${provId}.${key}`]: val },
    }));
  }

  function setLLMConfig(provId: string, key: string, val: string) {
    setSettings((s) => ({
      ...s,
      llmConfig: { ...s.llmConfig, [`${provId}.${key}`]: val },
    }));
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-ink-mute mt-1">Configure voice and AI providers for your agent.</p>
      </div>

      <ProviderSection
        icon={<Volume2 size={15} />}
        title="Text-to-Speech (TTS)"
        description="Voice synthesis engine used to speak to leads during calls."
        providers={TTS_PROVIDERS}
        activeId={settings.ttsProvider}
        config={settings.ttsConfig}
        onSelect={(id) => setSettings((s) => ({ ...s, ttsProvider: id }))}
        onConfig={setTtsConfig}
      />

      <ProviderSection
        icon={<Mic size={15} />}
        title="Speech Recognition (STT)"
        description="Transcription engine that converts caller speech to text in real-time."
        providers={STT_PROVIDERS}
        activeId={settings.sttProvider}
        config={settings.sttConfig}
        onSelect={(id) => setSettings((s) => ({ ...s, sttProvider: id }))}
        onConfig={setSTTConfig}
      />

      <ProviderSection
        icon={<Bot size={15} />}
        title="Language Model (LLM)"
        description="AI model that generates agent replies during the call."
        providers={LLM_PROVIDERS}
        activeId={settings.llmModel}
        config={settings.llmConfig}
        onSelect={(id) => setSettings((s) => ({ ...s, llmModel: id }))}
        onConfig={setLLMConfig}
      />

      <div className="flex items-center gap-3 pt-2 border-t border-ink-line">
        <Button onClick={saveSettings}>
          {saved ? <><Check size={14} className="mr-1" />Saved</> : "Save preferences"}
        </Button>
        <p className="text-xs text-ink-mute">
          API keys are stored locally in your browser.
        </p>
      </div>
    </div>
  );
}

function ProviderSection({
  icon, title, description, providers, activeId, config, onSelect, onConfig,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  providers: ProviderDef[];
  activeId: string;
  config: ProviderConfig;
  onSelect: (id: string) => void;
  onConfig: (providerId: string, key: string, val: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(activeId);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-ink-mute">{icon}</span>
        <div>
          <div className="text-sm font-semibold text-ink-text">{title}</div>
          <div className="text-xs text-ink-mute">{description}</div>
        </div>
      </div>

      <div className="space-y-2">
        {providers.map((prov) => {
          const isActive = activeId === prov.id;
          const isOpen = expanded === prov.id;

          return (
            <div
              key={prov.id}
              className={`rounded-xl border transition-colors ${
                isActive ? "border-accent bg-accent/5" : "border-ink-line bg-ink-card"
              }`}
            >
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Radio */}
                <button
                  onClick={() => { onSelect(prov.id); setExpanded(prov.id); }}
                  className="shrink-0"
                  aria-label={`Select ${prov.label}`}
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isActive ? "border-accent" : "border-ink-mute"
                  }`}>
                    {isActive && <div className="h-2 w-2 rounded-full bg-accent" />}
                  </div>
                </button>

                {/* Label */}
                <button
                  className="flex-1 text-left"
                  onClick={() => { onSelect(prov.id); setExpanded(prov.id); }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink-text">{prov.label}</span>
                    {prov.badge && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${prov.color}`}>
                        {prov.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-mute mt-0.5">{prov.sublabel}</div>
                </button>

                {/* Expand toggle */}
                <button
                  onClick={() => setExpanded(isOpen ? null : prov.id)}
                  className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg text-ink-mute hover:bg-ink-line hover:text-ink-text transition-colors"
                  aria-label={isOpen ? "Collapse" : "Configure"}
                >
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {/* Config fields */}
              {isOpen && prov.fields.length > 0 && (
                <div className="px-4 pb-4 pt-1 border-t border-ink-line space-y-3">
                  {prov.fields.map((field) => (
                    <ConfigField
                      key={field.key}
                      field={field}
                      value={config[`${prov.id}.${field.key}`] ?? ""}
                      onChange={(v) => onConfig(prov.id, field.key, v)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfigField({
  field, value, onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-ink-text">{field.label}</label>
      {field.options ? (
        <select
          value={value || field.options[0].value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm bg-ink-line border border-ink-line rounded-lg px-3 py-2 text-ink-text focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={field.type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="w-full text-sm bg-ink-line border border-ink-line rounded-lg px-3 py-2 text-ink-text placeholder:text-ink-mute focus:outline-none focus:ring-1 focus:ring-accent"
        />
      )}
      {field.hint && <p className="text-[11px] text-ink-mute">{field.hint}</p>}
    </div>
  );
}
