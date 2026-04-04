// ============================================================
// Settings Page — company config, LLM providers, thresholds
// ============================================================

import { useEffect, useState } from 'react';
import { Save, RefreshCw, CheckCircle, XCircle, Server, Cloud } from 'lucide-react';
import { api } from '../services/api';

interface LLMProvider {
  id: string;
  displayName: string;
  endpoint: string;
  description: string;
  configured: boolean;
  maskedKey: string;
}

export default function Settings() {
  const [companyName, setCompanyName] = useState('');
  const [companyDescription, setCompanyDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // LLM providers from backend
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  // Config placeholders
  const [kpiThreshold, setKpiThreshold] = useState(60);
  const [wageMultiplier, setWageMultiplier] = useState(1.0);
  const [penaltyRate, setPenaltyRate] = useState(0.1);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await api.getCompany();
        if (res.company) {
          setCompanyName(res.company.name ?? '');
          setCompanyDescription(res.company.description ?? '');
          const cfg = res.company.config as Record<string, unknown> ?? {};
          setKpiThreshold(Number(cfg.kpiThreshold ?? 60));
          setWageMultiplier(Number(cfg.wageMultiplier ?? 1.0));
          setPenaltyRate(Number(cfg.penaltyRate ?? 0.1));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    const fetchProviders = async () => {
      try {
        const res = await api.getProviders();
        setProviders(res.providers ?? []);
      } catch {
        // ignore — providers section will just be empty
      } finally {
        setProvidersLoading(false);
      }
    };

    fetchSettings();
    fetchProviders();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.updateCompanyConfig({
        name: companyName,
        description: companyDescription,
        config: {
          kpiThreshold,
          wageMultiplier,
          penaltyRate,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Settings</h2>

      {saved && (
        <div className="bg-green-500/20 border border-green-500/30 text-green-400 px-4 py-2 rounded-lg text-sm">
          Settings saved successfully!
        </div>
      )}

      {/* Company Info */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold text-white">Company Info</h3>

        <div>
          <label className="label">Company Name</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="input w-full"
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            value={companyDescription}
            onChange={(e) => setCompanyDescription(e.target.value)}
            rows={3}
            className="input w-full resize-none"
          />
        </div>
      </div>

      {/* LLM Providers */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">LLM Providers</h3>
          <span className="text-xs text-gray-500">
            {providers.filter((p) => p.configured).length}/{providers.length} configured
          </span>
        </div>
        <p className="text-xs text-gray-500">
          API keys are stored as environment variables on the server. Update them in your <code className="text-gray-400">.env</code> file.
        </p>

        {providersLoading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading providers...
          </div>
        ) : providers.length === 0 ? (
          <div className="text-gray-500 text-sm py-4">
            No LLM providers found. Check backend configuration.
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className={`border rounded-lg p-4 transition-colors ${
                  provider.configured
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-gray-700 bg-gray-800/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {provider.id === '9router' ? (
                      <Server className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Cloud className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{provider.displayName}</span>
                        {provider.configured ? (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Configured
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <XCircle className="w-3.5 h-3.5" />
                            Not configured
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{provider.description}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Endpoint:</span>{' '}
                    <code className="text-gray-400 break-all">{provider.endpoint}</code>
                  </div>
                  <div>
                    <span className="text-gray-500">API Key:</span>{' '}
                    <code className="text-gray-400">
                      {provider.maskedKey || '(not set)'}
                    </code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KPI Thresholds */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold text-white">Performance Thresholds</h3>

        <div>
          <label className="label">KPI Warning Threshold: {kpiThreshold}</label>
          <input
            type="range"
            min={0}
            max={100}
            value={kpiThreshold}
            onChange={(e) => setKpiThreshold(parseInt(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>0</span>
            <span>100</span>
          </div>
        </div>
      </div>

      {/* Economy Parameters */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold text-white">Economy Parameters</h3>

        <div>
          <label className="label">Wage Multiplier: {wageMultiplier.toFixed(1)}x</label>
          <input
            type="range"
            min={0.1}
            max={5.0}
            step={0.1}
            value={wageMultiplier}
            onChange={(e) => setWageMultiplier(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>0.1x</span>
            <span>5.0x</span>
          </div>
        </div>

        <div>
          <label className="label">Penalty Rate: {(penaltyRate * 100).toFixed(0)}%</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={penaltyRate}
            onChange={(e) => setPenaltyRate(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-600">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
