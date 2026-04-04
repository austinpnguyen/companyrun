// ============================================================
// Agents Page — grid of agents, hire modal, detail view
// ============================================================

import { useEffect, useState } from 'react';
import { UserPlus, X, ChevronRight, Briefcase } from 'lucide-react';
import { useAgentStore } from '../stores/agentStore';
import StatusBadge from '../components/common/StatusBadge';
import KPIChart from '../components/common/KPIChart';
import type { Agent } from '../types';

const TEMPLATE_ROLES = [
  'developer',
  'designer',
  'researcher',
  'writer',
  'data_analyst',
  'devops',
  'qa_tester',
  'project_manager',
];

export default function Agents() {
  const { agents, loading, error, fetchAgents, hireAgent, fireAgent } = useAgentStore();
  const [showHireModal, setShowHireModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [hireName, setHireName] = useState('');
  const [hireRole, setHireRole] = useState(TEMPLATE_ROLES[0]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleHire = async () => {
    if (!hireName.trim()) return;
    await hireAgent({ templateRole: hireRole, name: hireName.trim() });
    setHireName('');
    setShowHireModal(false);
  };

  const handleFire = async (agent: Agent) => {
    if (!confirm(`Fire agent "${agent.name}"? This cannot be undone.`)) return;
    await fireAgent(agent.id, 'Fired by user from dashboard');
    setSelectedAgent(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Agents</h2>
        <button onClick={() => setShowHireModal(true)} className="btn-primary flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Hire Agent
        </button>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading && <div className="text-gray-500">Loading agents...</div>}

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.id}
            onClick={() => setSelectedAgent(agent)}
            className="card hover:border-blue-500/50 cursor-pointer transition-colors group"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                  {agent.name}
                </h3>
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

      {/* Hire Modal */}
      {showHireModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Hire New Agent</h3>
              <button onClick={() => setShowHireModal(false)} className="text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Agent Name</label>
                <input
                  type="text"
                  value={hireName}
                  onChange={(e) => setHireName(e.target.value)}
                  placeholder="e.g. Alice"
                  className="input w-full"
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Role Template</label>
                <select
                  value={hireRole}
                  onChange={(e) => setHireRole(e.target.value)}
                  className="input w-full"
                >
                  {TEMPLATE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowHireModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleHire} disabled={!hireName.trim()} className="btn-primary">
                Hire Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Detail Panel */}
      {selectedAgent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedAgent.name}</h3>
                <p className="text-gray-500 capitalize">{selectedAgent.role}</p>
              </div>
              <button onClick={() => setSelectedAgent(null)} className="text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="card">
                <p className="text-xs text-gray-500 mb-1">Status</p>
                <StatusBadge status={selectedAgent.status} size="md" />
              </div>
              <div className="card">
                <p className="text-xs text-gray-500 mb-1">Model</p>
                <p className="text-white">{selectedAgent.model}</p>
              </div>
              <div className="card">
                <p className="text-xs text-gray-500 mb-1">Provider</p>
                <p className="text-white">{selectedAgent.provider}</p>
              </div>
              <div className="card">
                <p className="text-xs text-gray-500 mb-1">Hired</p>
                <p className="text-white">{new Date(selectedAgent.hiredAt).toLocaleString()}</p>
              </div>
            </div>

            {/* Placeholder KPI */}
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
              {selectedAgent.status === 'active' && (
                <button onClick={() => handleFire(selectedAgent)} className="btn-danger">
                  Fire Agent
                </button>
              )}
              <button onClick={() => setSelectedAgent(null)} className="btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
