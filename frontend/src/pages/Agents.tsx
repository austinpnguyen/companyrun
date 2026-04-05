// ============================================================
// Agents Page — canvas org chart + list view, hire/detail modals
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { UserPlus, X, ChevronRight, Briefcase, LayoutGrid, Network, AlertCircle, Loader2 } from 'lucide-react';
import { useAgentStore } from '../stores/agentStore';
import { api } from '../services/api';
import socket from '../services/socket';
import StatusBadge from '../components/common/StatusBadge';
import KPIChart from '../components/common/KPIChart';
import AgentCanvas from '../components/AgentCanvas';
import type { Agent, AgentTemplate } from '../types';

type ViewMode = 'canvas' | 'list';

// ── Tier badge ───────────────────────────────────────────────

function TierBadge({ tier, isAdversarial }: { tier: string | null; isAdversarial: boolean | null }) {
  if (tier === 'adversarial' || isAdversarial) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
        Adversarial
      </span>
    );
  }
  if (tier === 'worker') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
        Worker
      </span>
    );
  }
  if (tier) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">
        {tier}
      </span>
    );
  }
  return null;
}

// ── Hire Modal ───────────────────────────────────────────────

interface HireModalProps {
  onClose: () => void;
  onHire: (templateRole: string, name: string) => Promise<void>;
}

function HireModal({ onClose, onHire }: HireModalProps) {
  const { templates, fetchTemplates } = useAgentStore();
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [manualRole, setManualRole] = useState('');
  const [agentName, setAgentName] = useState('');
  const [hiring, setHiring] = useState(false);

  useEffect(() => {
    if (templates.length === 0) {
      setLoadingTemplates(true);
      fetchTemplates()
        .catch((err: unknown) =>
          setTemplatesError(err instanceof Error ? err.message : 'Failed to load templates')
        )
        .finally(() => setLoadingTemplates(false));
    }
  }, [templates.length, fetchTemplates]);

  const workerTemplates = templates.filter(
    (t) => t.tier !== 'adversarial' && !t.isAdversarial
  );
  const adversarialTemplates = templates.filter(
    (t) => t.tier === 'adversarial' || t.isAdversarial
  );

  const effectiveRole = selectedTemplate ? selectedTemplate.role : manualRole.trim();
  const canHire = agentName.trim().length > 0 && effectiveRole.length > 0;

  const handleHire = async () => {
    if (!canHire) return;
    setHiring(true);
    try {
      await onHire(effectiveRole, agentName.trim());
      onClose();
    } finally {
      setHiring(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canHire && !hiring) handleHire();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onKeyDown={handleKeyDown}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Hire New Agent</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Template loading */}
        {loadingTemplates && (
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading templates...
          </div>
        )}

        {templatesError && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Failed to load templates</p>
              <p className="text-red-400/70 text-xs mt-0.5">{templatesError}</p>
            </div>
          </div>
        )}

        {/* Worker templates */}
        {workerTemplates.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">
              Worker Agents
            </p>
            <div className="grid grid-cols-2 gap-2">
              {workerTemplates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => setSelectedTemplate(selectedTemplate?.id === tmpl.id ? null : tmpl)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    selectedTemplate?.id === tmpl.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 bg-gray-900 hover:border-blue-500/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{tmpl.name}</p>
                      <p className="text-xs text-gray-500 capitalize mt-0.5">{tmpl.role}</p>
                    </div>
                    <TierBadge tier={tmpl.tier} isAdversarial={tmpl.isAdversarial} />
                  </div>
                  {tmpl.description && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">{tmpl.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Adversarial templates */}
        {adversarialTemplates.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
              Adversarial Agents
            </p>
            <div className="grid grid-cols-2 gap-2">
              {adversarialTemplates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => setSelectedTemplate(selectedTemplate?.id === tmpl.id ? null : tmpl)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    selectedTemplate?.id === tmpl.id
                      ? 'border-red-500 bg-red-500/10'
                      : 'border-gray-700 bg-gray-900 hover:border-red-500/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{tmpl.name}</p>
                      <p className="text-xs text-gray-500 capitalize mt-0.5">{tmpl.role}</p>
                    </div>
                    <TierBadge tier={tmpl.tier} isAdversarial={tmpl.isAdversarial} />
                  </div>
                  {tmpl.description && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">{tmpl.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Manual fallback when no templates */}
        {!loadingTemplates && templates.length === 0 && (
          <div className="mb-4">
            <label className="label">Role (manual)</label>
            <input
              type="text"
              value={manualRole}
              onChange={(e) => setManualRole(e.target.value)}
              placeholder="e.g. developer"
              className="input w-full"
            />
          </div>
        )}

        {/* Selected template indicator */}
        {selectedTemplate && (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="text-gray-400">Selected:</span>
            <span className="text-white font-medium">{selectedTemplate.name}</span>
            <button
              onClick={() => setSelectedTemplate(null)}
              className="text-gray-600 hover:text-gray-400 ml-auto text-xs"
            >
              Clear
            </button>
          </div>
        )}

        {/* Agent name */}
        <div className="mb-6">
          <label className="label">Agent Name <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="e.g. Alice"
            className="input w-full"
            autoFocus
          />
          {agentName.trim().length === 0 && (
            <p className="text-xs text-gray-600 mt-1">Name is required</p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={hiring} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleHire}
            disabled={!canHire || hiring}
            className="btn-primary flex items-center gap-2"
          >
            {hiring && <Loader2 className="w-4 h-4 animate-spin" />}
            Hire Agent
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agent Detail Modal ────────────────────────────────────────

interface DetailModalProps {
  agent: Agent;
  onClose: () => void;
  onRefresh: () => void;
}

function DetailModal({ agent, onClose, onRefresh }: DetailModalProps) {
  const { fireAgent } = useAgentStore();
  const [cancelling, setCancelling] = useState(false);
  const [firing, setFiring] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleFire = async () => {
    if (!confirm(`Fire agent "${agent.name}"? This cannot be undone.`)) return;
    setFiring(true);
    setActionError(null);
    try {
      await fireAgent(agent.id, 'Fired by user from dashboard');
      onRefresh();
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to fire agent');
    } finally {
      setFiring(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setActionError(null);
    try {
      await api.cancelAgent(agent.id);
      onRefresh();
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel agent');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-xl font-bold text-white">{agent.name}</h3>
              <TierBadge tier={agent.tier} isAdversarial={agent.isAdversarial} />
            </div>
            <p className="text-gray-500 capitalize">{agent.role}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {actionError && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm mb-4">
            {actionError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="card">
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <StatusBadge status={agent.status} size="md" />
          </div>
          <div className="card">
            <p className="text-xs text-gray-500 mb-1">Model</p>
            <p className="text-white">{agent.model}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500 mb-1">Provider</p>
            <p className="text-white">{agent.provider}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-500 mb-1">Hired</p>
            <p className="text-white">{new Date(agent.hiredAt).toLocaleString()}</p>
          </div>
          {agent.tier && (
            <div className="card">
              <p className="text-xs text-gray-500 mb-1">Tier</p>
              <TierBadge tier={agent.tier} isAdversarial={agent.isAdversarial} />
            </div>
          )}
          {agent.isAdversarial !== null && (
            <div className="card">
              <p className="text-xs text-gray-500 mb-1">Adversarial</p>
              <p className={agent.isAdversarial ? 'text-red-400' : 'text-green-400'}>
                {agent.isAdversarial ? 'Yes' : 'No'}
              </p>
            </div>
          )}
        </div>

        {/* KPI chart */}
        <div className="card mb-4">
          <h4 className="text-sm font-medium text-gray-400 mb-2">Performance (KPI)</h4>
          <KPIChart
            metrics={[
              { name: 'Quality', value: 75 },
              { name: 'Speed', value: 60 },
              { name: 'Reliability', value: 80 },
              { name: 'Efficiency', value: 70 },
            ]}
            height={180}
          />
        </div>

        <div className="flex justify-end gap-3">
          {agent.status === 'active' && (
            <>
              <button
                onClick={handleCancel}
                disabled={cancelling || firing}
                className="btn-secondary flex items-center gap-2"
              >
                {cancelling && <Loader2 className="w-4 h-4 animate-spin" />}
                Cancel
              </button>
              <button
                onClick={handleFire}
                disabled={firing || cancelling}
                className="btn-danger flex items-center gap-2"
              >
                {firing && <Loader2 className="w-4 h-4 animate-spin" />}
                Fire Agent
              </button>
            </>
          )}
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Agents page ─────────────────────────────────────────

export default function Agents() {
  const { agents, loading, error, fetchAgents, hireAgent } = useAgentStore();
  const [view, setView] = useState<ViewMode>('canvas');
  const [showHireModal, setShowHireModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const refresh = useCallback(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Real-time updates via Socket.io
  useEffect(() => {
    const handleAgentUpdated = () => refresh();
    const handleTaskUpdated = () => refresh();

    socket.on('agent:updated', handleAgentUpdated);
    socket.on('task:updated', handleTaskUpdated);

    return () => {
      socket.off('agent:updated', handleAgentUpdated);
      socket.off('task:updated', handleTaskUpdated);
    };
  }, [refresh]);

  const handleHire = async (templateRole: string, name: string) => {
    await hireAgent({ templateRole, name });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Agents</h2>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-gray-800 border border-gray-700 rounded-lg p-1 gap-1">
            <button
              onClick={() => setView('canvas')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                view === 'canvas'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Network className="w-4 h-4" />
              Canvas
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                view === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              List
            </button>
          </div>

          <button
            onClick={() => setShowHireModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Hire Agent
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading && agents.length === 0 && (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading agents...
        </div>
      )}

      {/* Canvas view */}
      {view === 'canvas' && (
        <>
          {agents.length === 0 && !loading ? (
            <div className="text-center py-12">
              <Briefcase className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">No agents hired yet</p>
              <button onClick={() => setShowHireModal(true)} className="btn-primary">
                Hire Your First Agent
              </button>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden" style={{ height: 600 }}>
              <AgentCanvas agents={agents} onAgentClick={setSelectedAgent} />
            </div>
          )}
        </>
      )}

      {/* List view */}
      {view === 'list' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className="card hover:border-blue-500/50 cursor-pointer transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                        {agent.name}
                      </h3>
                      <TierBadge tier={agent.tier} isAdversarial={agent.isAdversarial} />
                    </div>
                    <p className="text-sm text-gray-500 capitalize">{agent.role}</p>
                  </div>
                  <StatusBadge status={agent.status} />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Model</span>
                    <span className="text-gray-300">{agent.model}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Provider</span>
                    <span className="text-gray-300">{agent.provider}</span>
                  </div>
                  <div className="flex items-center justify-between text-gray-400">
                    <span>Hired</span>
                    <span className="text-gray-300">
                      {new Date(agent.hiredAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors" />
                </div>
              </div>
            ))}
          </div>

          {agents.length === 0 && !loading && (
            <div className="text-center py-12">
              <Briefcase className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500">No agents hired yet</p>
              <button onClick={() => setShowHireModal(true)} className="btn-primary mt-4">
                Hire Your First Agent
              </button>
            </div>
          )}
        </>
      )}

      {/* Hire Modal */}
      {showHireModal && (
        <HireModal
          onClose={() => setShowHireModal(false)}
          onHire={handleHire}
        />
      )}

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <DetailModal
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
