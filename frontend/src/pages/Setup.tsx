// ============================================================
// Setup Wizard — multi-step configuration page
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Database,
  Key,
  Settings,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Rocket,
  Zap,
  Globe,
  Server,
} from 'lucide-react';
import { api } from '../services/api';
import type { SetupStatus } from '../types';

// ── Constants ────────────────────────────────────────────────

const STEPS = ['Welcome', 'Database', 'LLM Providers', 'Settings', 'Launch'] as const;

type ProviderStatus = 'untested' | 'testing' | 'success' | 'failed';

interface ProviderState {
  key: string;
  envVar: string;
  label: string;
  description: string;
  apiKey: string;
  status: ProviderStatus;
  message: string;
}

const INITIAL_PROVIDERS: ProviderState[] = [
  {
    key: 'openrouter',
    envVar: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
    description: 'Recommended — supports 100+ models',
    apiKey: '',
    status: 'untested',
    message: '',
  },
  {
    key: 'togetherai',
    envVar: 'TOGETHERAI_API_KEY',
    label: 'Together AI',
    description: 'Fast inference for open-source models',
    apiKey: '',
    status: 'untested',
    message: '',
  },
  {
    key: 'askcodi',
    envVar: 'ASKCODI_API_KEY',
    label: 'AskCodi',
    description: 'AI coding assistant API',
    apiKey: '',
    status: 'untested',
    message: '',
  },
  {
    key: '9router',
    envVar: 'NINE_ROUTER_API_KEY',
    label: '9Router',
    description: 'Multi-model routing service',
    apiKey: '',
    status: 'untested',
    message: '',
  },
];

// ── Password Toggle Input ────────────────────────────────────

function PasswordInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        className="input w-full pr-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 p-1"
        onClick={() => setShow(!show)}
        tabIndex={-1}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

// ── Status Indicator ─────────────────────────────────────────

function StatusIndicator({ status, message }: { status: ProviderStatus | 'idle'; message?: string }) {
  if (status === 'untested' || status === 'idle') return null;
  if (status === 'testing') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-blue-400">
        <Loader2 size={14} className="animate-spin" /> Testing…
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-green-400">
        <CheckCircle size={14} /> {message || 'Success'}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm text-red-400">
      <XCircle size={14} /> {message || 'Failed'}
    </span>
  );
}

// ── Progress Bar ─────────────────────────────────────────────

function ProgressBar({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-col items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                i < currentStep
                  ? 'bg-green-600 text-white'
                  : i === currentStep
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400'
              }`}
            >
              {i < currentStep ? <CheckCircle size={16} /> : i + 1}
            </div>
            <span
              className={`text-xs mt-1 hidden sm:block ${
                i === currentStep ? 'text-blue-400 font-medium' : 'text-gray-500'
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-500"
          style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Step 1: Welcome ──────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center max-w-lg mx-auto animate-fadeIn">
      <div className="mb-6">
        <div className="w-20 h-20 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4">
          <Rocket size={40} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Welcome to CompanyRun</h1>
        <p className="text-gray-400 text-lg">
          Let's get your AI company set up and running.
        </p>
      </div>

      <div className="card text-left space-y-3 mb-8">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          What you'll need
        </h3>
        <div className="flex items-start gap-3">
          <Database size={18} className="text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-gray-200 text-sm font-medium">Supabase Account</p>
            <p className="text-gray-500 text-xs">
              Free tier works fine. Provides PostgreSQL database + API.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Key size={18} className="text-purple-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-gray-200 text-sm font-medium">At Least One LLM API Key</p>
            <p className="text-gray-500 text-xs">
              OpenRouter recommended — supports 100+ models with one key.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Settings size={18} className="text-gray-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-gray-200 text-sm font-medium">5 Minutes</p>
            <p className="text-gray-500 text-xs">
              The wizard will guide you through each step.
            </p>
          </div>
        </div>
      </div>

      <button onClick={onNext} className="btn-primary px-8 py-3 text-lg inline-flex items-center gap-2">
        Get Started <ArrowRight size={20} />
      </button>
    </div>
  );
}

// ── Step 2: Database ─────────────────────────────────────────

function StepDatabase({
  dbUrl,
  setDbUrl,
  supabaseUrl,
  setSupabaseUrl,
  supabaseKey,
  setSupabaseKey,
  onNext,
  onBack,
}: {
  dbUrl: string;
  setDbUrl: (v: string) => void;
  supabaseUrl: string;
  setSupabaseUrl: (v: string) => void;
  supabaseKey: string;
  setSupabaseKey: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const testConnection = async () => {
    if (!dbUrl.trim()) return;
    setTestStatus('testing');
    setTestMessage('');
    try {
      const result = await api.testDatabase(dbUrl);
      setTestStatus(result.success ? 'success' : 'failed');
      setTestMessage(result.message);
    } catch (err) {
      setTestStatus('failed');
      setTestMessage(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const canProceed = testStatus === 'success' && supabaseUrl.trim() !== '' && supabaseKey.trim() !== '';

  return (
    <div className="max-w-xl mx-auto animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
          <Database size={20} className="text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Database Configuration</h2>
          <p className="text-gray-400 text-sm">Connect to your Supabase PostgreSQL database</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* DATABASE_URL */}
        <div>
          <label className="label">DATABASE_URL</label>
          <PasswordInput
            value={dbUrl}
            onChange={(v) => {
              setDbUrl(v);
              setTestStatus('idle');
            }}
            placeholder="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
          />
          <p className="text-xs text-gray-500 mt-1">
            PostgreSQL connection string from Supabase → Settings → Database → Connection string (URI)
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={testConnection}
              disabled={!dbUrl.trim() || testStatus === 'testing'}
              className="btn-secondary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {testStatus === 'testing' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Zap size={14} />
              )}
              Test Connection
            </button>
            <StatusIndicator status={testStatus} message={testMessage} />
          </div>
        </div>

        {/* SUPABASE_URL */}
        <div>
          <label className="label">SUPABASE_URL</label>
          <input
            type="text"
            className="input w-full"
            value={supabaseUrl}
            onChange={(e) => setSupabaseUrl(e.target.value)}
            placeholder="https://your-project.supabase.co"
          />
          <p className="text-xs text-gray-500 mt-1">
            Project URL from Supabase → Settings → API
          </p>
        </div>

        {/* SUPABASE_ANON_KEY */}
        <div>
          <label className="label">SUPABASE_ANON_KEY</label>
          <PasswordInput
            value={supabaseKey}
            onChange={setSupabaseKey}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
          />
          <p className="text-xs text-gray-500 mt-1">
            anon / public key from Supabase → Settings → API
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="btn-secondary inline-flex items-center gap-1.5">
          <ArrowLeft size={16} /> Back
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Step 3: LLM Providers ────────────────────────────────────

function StepLLM({
  providers,
  setProviders,
  onNext,
  onBack,
}: {
  providers: ProviderState[];
  setProviders: (p: ProviderState[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const updateProvider = (index: number, updates: Partial<ProviderState>) => {
    const next = [...providers];
    next[index] = { ...next[index], ...updates };
    setProviders(next);
  };

  const testProvider = async (index: number) => {
    const p = providers[index];
    if (!p.apiKey.trim()) return;
    updateProvider(index, { status: 'testing', message: '' });
    try {
      const result = await api.testLLM(p.key, p.apiKey);
      updateProvider(index, {
        status: result.success ? 'success' : 'failed',
        message: result.message,
      });
    } catch (err) {
      updateProvider(index, {
        status: 'failed',
        message: err instanceof Error ? err.message : 'Test failed',
      });
    }
  };

  const hasAtLeastOne = providers.some((p) => p.status === 'success');

  const providerIcon = (key: string) => {
    switch (key) {
      case 'openrouter':
        return <Globe size={20} className="text-purple-400" />;
      case 'togetherai':
        return <Zap size={20} className="text-orange-400" />;
      case 'askcodi':
        return <Key size={20} className="text-cyan-400" />;
      case '9router':
        return <Server size={20} className="text-green-400" />;
      default:
        return <Key size={20} className="text-gray-400" />;
    }
  };

  return (
    <div className="max-w-xl mx-auto animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
          <Key size={20} className="text-purple-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">LLM Providers</h2>
          <p className="text-gray-400 text-sm">
            Configure at least one AI provider to power your agents
          </p>
        </div>
      </div>

      {!hasAtLeastOne && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-3 mb-5 text-sm text-yellow-300">
          ⚠️ At least one provider must be configured and tested to proceed.
        </div>
      )}

      <div className="space-y-4">
        {providers.map((provider, index) => (
          <div key={provider.key} className="card">
            <div className="flex items-center gap-3 mb-3">
              {providerIcon(provider.key)}
              <div className="flex-1">
                <h3 className="text-white font-medium">{provider.label}</h3>
                <p className="text-gray-500 text-xs">{provider.description}</p>
              </div>
              {provider.status === 'success' && (
                <CheckCircle size={20} className="text-green-400" />
              )}
              {provider.status === 'failed' && (
                <XCircle size={20} className="text-red-400" />
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <PasswordInput
                  value={provider.apiKey}
                  onChange={(v) =>
                    updateProvider(index, { apiKey: v, status: 'untested', message: '' })
                  }
                  placeholder={`${provider.label} API key`}
                />
              </div>
              <button
                onClick={() => testProvider(index)}
                disabled={!provider.apiKey.trim() || provider.status === 'testing'}
                className="btn-secondary text-sm px-3 py-2 inline-flex items-center gap-1 disabled:opacity-50 shrink-0"
              >
                {provider.status === 'testing' ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Zap size={14} />
                )}
                Test
              </button>
            </div>

            {provider.message && (
              <div className="mt-2">
                <StatusIndicator status={provider.status} message={provider.message} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="btn-secondary inline-flex items-center gap-1.5">
          <ArrowLeft size={16} /> Back
        </button>
        <button
          onClick={onNext}
          disabled={!hasAtLeastOne}
          className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Company Settings ─────────────────────────────────

function StepSettings({
  settings,
  setSettings,
  onNext,
  onBack,
}: {
  settings: Record<string, string>;
  setSettings: (s: Record<string, string>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const update = (key: string, value: string) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div className="max-w-xl mx-auto animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gray-600/20 rounded-lg flex items-center justify-center">
          <Settings size={20} className="text-gray-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Company Settings</h2>
          <p className="text-gray-400 text-sm">Optional — defaults work fine for most setups</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="label">Company Name</label>
          <input
            type="text"
            className="input w-full"
            value={settings.COMPANY_NAME || ''}
            onChange={(e) => update('COMPANY_NAME', e.target.value)}
            placeholder="My AI Company"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Port</label>
            <input
              type="number"
              className="input w-full"
              value={settings.PORT || ''}
              onChange={(e) => update('PORT', e.target.value)}
              placeholder="3000"
            />
          </div>
          <div>
            <label className="label">Node Environment</label>
            <select
              className="input w-full"
              value={settings.NODE_ENV || 'development'}
              onChange={(e) => update('NODE_ENV', e.target.value)}
            >
              <option value="development">development</option>
              <option value="production">production</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Orchestrator Interval (ms)</label>
            <input
              type="number"
              className="input w-full"
              value={settings.ORCHESTRATOR_HEARTBEAT_MS || ''}
              onChange={(e) => update('ORCHESTRATOR_HEARTBEAT_MS', e.target.value)}
              placeholder="30000"
            />
            <p className="text-xs text-gray-500 mt-1">How often the orchestrator checks for work</p>
          </div>
          <div>
            <label className="label">Log Level</label>
            <select
              className="input w-full"
              value={settings.LOG_LEVEL || 'info'}
              onChange={(e) => update('LOG_LEVEL', e.target.value)}
            >
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="btn-secondary inline-flex items-center gap-1.5">
          <ArrowLeft size={16} /> Back
        </button>
        <button onClick={onNext} className="btn-primary inline-flex items-center gap-1.5">
          Next <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Step 5: Initialize & Launch ──────────────────────────────

type LaunchPhase =
  | 'review'
  | 'saving'
  | 'saved'
  | 'initializing'
  | 'initialized'
  | 'restarting'
  | 'done'
  | 'error';

function StepLaunch({
  dbUrl,
  supabaseUrl,
  supabaseKey,
  providers,
  settings,
  onBack,
}: {
  dbUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  providers: ProviderState[];
  settings: Record<string, string>;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<LaunchPhase>('review');
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(5);

  const configuredProviders = providers.filter((p) => p.status === 'success');

  const mask = (val: string) => {
    if (!val || val.length < 10) return '••••';
    return val.slice(0, 4) + '•'.repeat(Math.min(12, val.length - 8)) + val.slice(-4);
  };

  const buildConfig = useCallback((): Record<string, string> => {
    const config: Record<string, string> = {
      DATABASE_URL: dbUrl,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: supabaseKey,
    };

    for (const p of providers) {
      if (p.apiKey.trim()) {
        config[p.envVar] = p.apiKey;
      }
    }

    for (const [k, v] of Object.entries(settings)) {
      if (v && v.trim()) {
        config[k] = v;
      }
    }

    return config;
  }, [dbUrl, supabaseUrl, supabaseKey, providers, settings]);

  const saveConfig = async () => {
    setPhase('saving');
    setError('');
    try {
      const config = buildConfig();
      await api.saveSetupConfig(config);
      setPhase('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setPhase('error');
    }
  };

  const initializeDb = async () => {
    setPhase('initializing');
    setError('');
    try {
      await api.initializeDatabase();
      setPhase('initialized');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initialization failed');
      setPhase('error');
    }
  };

  const launchServer = async () => {
    setPhase('restarting');
    setError('');
    try {
      await api.restartServer().catch(() => {
        // Server will disconnect — that's expected
      });
      setPhase('done');
    } catch {
      // Expected — server restarts and drops the connection
      setPhase('done');
    }
  };

  // Countdown timer after launch
  useEffect(() => {
    if (phase !== 'done') return;
    if (countdown <= 0) {
      navigate('/');
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown, navigate]);

  const phaseLabel = (p: LaunchPhase) => {
    switch (p) {
      case 'saving':
        return 'Saving configuration…';
      case 'saved':
        return 'Configuration saved ✓';
      case 'initializing':
        return 'Migrating database & seeding data…';
      case 'initialized':
        return 'Database initialized ✓';
      case 'restarting':
        return 'Restarting server…';
      case 'done':
        return 'Done! Redirecting…';
      default:
        return '';
    }
  };

  const phaseOrder: LaunchPhase[] = ['saving', 'saved', 'initializing', 'initialized', 'restarting', 'done'];
  const currentPhaseIndex = phaseOrder.indexOf(phase);

  return (
    <div className="max-w-xl mx-auto animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center">
          <Rocket size={20} className="text-green-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Initialize & Launch</h2>
          <p className="text-gray-400 text-sm">Review your configuration and launch CompanyRun</p>
        </div>
      </div>

      {/* Summary */}
      <div className="card mb-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-2">
          Configuration Summary
        </h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">DATABASE_URL</span>
            <span className="text-gray-200 font-mono text-xs">{mask(dbUrl)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">SUPABASE_URL</span>
            <span className="text-gray-200 font-mono text-xs truncate ml-4 max-w-[240px]">{supabaseUrl}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">SUPABASE_ANON_KEY</span>
            <span className="text-gray-200 font-mono text-xs">{mask(supabaseKey)}</span>
          </div>

          <hr className="border-gray-700" />

          {configuredProviders.map((p) => (
            <div key={p.key} className="flex justify-between">
              <span className="text-gray-400">{p.envVar}</span>
              <span className="text-green-400 font-mono text-xs flex items-center gap-1">
                <CheckCircle size={12} /> {mask(p.apiKey)}
              </span>
            </div>
          ))}

          {Object.entries(settings).some(([, v]) => v?.trim()) && (
            <>
              <hr className="border-gray-700" />
              {Object.entries(settings)
                .filter(([, v]) => v?.trim())
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-gray-400">{k}</span>
                    <span className="text-gray-200 font-mono text-xs">{v}</span>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>

      {/* Progress */}
      {phase !== 'review' && phase !== 'error' && (
        <div className="card mb-6">
          <div className="space-y-2">
            {phaseOrder.map((p, i) => {
              const isActive = p === phase;
              const isDone = i < currentPhaseIndex;
              const isPending = i > currentPhaseIndex;
              if (isPending) return null;

              return (
                <div
                  key={p}
                  className={`flex items-center gap-2 text-sm ${
                    isActive ? 'text-blue-400' : isDone ? 'text-green-400' : 'text-gray-500'
                  }`}
                >
                  {isActive && (p === 'saving' || p === 'initializing' || p === 'restarting') ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isDone || isActive ? (
                    <CheckCircle size={14} />
                  ) : null}
                  {phaseLabel(p)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
            <XCircle size={16} /> Error
          </div>
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Done countdown */}
      {phase === 'done' && (
        <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-4 mb-6 text-center">
          <CheckCircle size={32} className="text-green-400 mx-auto mb-2" />
          <p className="text-green-300 text-lg font-medium">CompanyRun is ready!</p>
          <p className="text-green-400/70 text-sm mt-1">
            Redirecting to dashboard in {countdown}s…
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          disabled={phase !== 'review' && phase !== 'error'}
          className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex gap-3">
          {(phase === 'review' || phase === 'error') && (
            <button onClick={saveConfig} className="btn-primary inline-flex items-center gap-1.5">
              <Rocket size={16} /> Save Configuration
            </button>
          )}
          {phase === 'saved' && (
            <button onClick={initializeDb} className="btn-success inline-flex items-center gap-1.5">
              <Database size={16} /> Initialize Database
            </button>
          )}
          {phase === 'initialized' && (
            <button onClick={launchServer} className="btn-success inline-flex items-center gap-1.5">
              <Rocket size={16} /> Launch CompanyRun
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Setup Wizard ────────────────────────────────────────

export default function Setup() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  // Step 2: Database
  const [dbUrl, setDbUrl] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  // Step 3: Providers
  const [providers, setProviders] = useState<ProviderState[]>(INITIAL_PROVIDERS);

  // Step 4: Settings
  const [settings, setSettings] = useState<Record<string, string>>({
    COMPANY_NAME: 'My AI Company',
    PORT: '3000',
    NODE_ENV: 'development',
    ORCHESTRATOR_HEARTBEAT_MS: '30000',
    LOG_LEVEL: 'info',
  });

  // Pre-fill from existing config if available
  useEffect(() => {
    (async () => {
      try {
        const status: SetupStatus = await api.getSetupStatus();
        const fields = status.fields;

        // Pre-fill any values that are already set (use maskedValue as a hint)
        // We can't get actual values back, so we just mark which fields are configured
        // The user can skip fields that are already set

        // If DATABASE_URL is set, show masked value as placeholder hint
        if (fields.DATABASE_URL?.set) {
          // We won't pre-fill secrets — user must re-enter or leave blank to keep existing
        }

        // Pre-fill non-secret settings
        if (fields.PORT?.maskedValue && fields.PORT.set) {
          setSettings((s) => ({ ...s, PORT: fields.PORT.maskedValue || s.PORT }));
        }
        if (fields.NODE_ENV?.maskedValue && fields.NODE_ENV.set) {
          setSettings((s) => ({ ...s, NODE_ENV: fields.NODE_ENV.maskedValue || s.NODE_ENV }));
        }
      } catch {
        // Setup status unavailable — continue with defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 size={32} className="text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Rocket size={16} className="text-white" />
          </div>
          <span className="text-white font-semibold">CompanyRun Setup</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <ProgressBar currentStep={step} />

          {step === 0 && <StepWelcome onNext={() => setStep(1)} />}

          {step === 1 && (
            <StepDatabase
              dbUrl={dbUrl}
              setDbUrl={setDbUrl}
              supabaseUrl={supabaseUrl}
              setSupabaseUrl={setSupabaseUrl}
              supabaseKey={supabaseKey}
              setSupabaseKey={setSupabaseKey}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}

          {step === 2 && (
            <StepLLM
              providers={providers}
              setProviders={setProviders}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <StepSettings
              settings={settings}
              setSettings={setSettings}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && (
            <StepLaunch
              dbUrl={dbUrl}
              supabaseUrl={supabaseUrl}
              supabaseKey={supabaseKey}
              providers={providers}
              settings={settings}
              onBack={() => setStep(3)}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-3 text-center text-xs text-gray-600">
        CompanyRun — AI Company Simulator
      </footer>
    </div>
  );
}
