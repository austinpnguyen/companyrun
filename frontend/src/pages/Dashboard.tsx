// ============================================================
// Dashboard Page — overview with stats, decisions, quick actions
// ============================================================

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ListTodo, DollarSign, AlertTriangle, Plus, UserPlus, Activity } from 'lucide-react';
import { api } from '../services/api';
import DecisionCard from '../components/common/DecisionCard';
import type { CompanyOverview, Decision } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [orchStatus, setOrchStatus] = useState<string>('unknown');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [companyRes, decisionsRes, orchRes] = await Promise.allSettled([
          api.getCompany(),
          api.getDecisions(),
          api.getOrchestratorStatus(),
        ]);

        if (companyRes.status === 'fulfilled') setOverview(companyRes.value);
        if (decisionsRes.status === 'fulfilled') setDecisions(decisionsRes.value.decisions ?? []);
        if (orchRes.status === 'fulfilled') setOrchStatus(orchRes.value.status?.status ?? 'unknown');
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await api.approveDecision(id);
      setDecisions((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.rejectDecision(id);
      setDecisions((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error('Failed to reject:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  const totalTasks = overview?.taskStats
    ? Object.values(overview.taskStats).reduce((a, b) => a + b, 0)
    : 0;
  const activeTasks = overview?.taskStats
    ? (overview.taskStats['in_progress'] ?? 0) + (overview.taskStats['assigned'] ?? 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
              orchStatus === 'running'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Orchestrator: {orchStatus}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5 text-blue-400" />}
          label="Active Agents"
          value={overview?.activeAgents ?? 0}
          color="blue"
        />
        <StatCard
          icon={<ListTodo className="w-5 h-5 text-green-400" />}
          label="Active Tasks"
          value={activeTasks}
          subtitle={`${totalTasks} total`}
          color="green"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5 text-yellow-400" />}
          label="Budget Remaining"
          value={`$${Number(overview?.company?.budgetRemaining ?? 0).toLocaleString()}`}
          subtitle={`of $${Number(overview?.company?.budgetTotal ?? 0).toLocaleString()}`}
          color="yellow"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
          label="Pending Decisions"
          value={decisions.length}
          color="red"
        />
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/agents')} className="btn-primary flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Hire Agent
        </button>
        <button onClick={() => navigate('/tasks')} className="btn-secondary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Task
        </button>
      </div>

      {/* Pending Decisions */}
      {decisions.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Pending Decisions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {decisions.map((d) => (
              <DecisionCard key={d.id} decision={d} onApprove={handleApprove} onReject={handleReject} />
            ))}
          </div>
        </div>
      )}

      {/* Task Status Breakdown */}
      {overview?.taskStats && Object.keys(overview.taskStats).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Task Status Breakdown</h3>
          <div className="card">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(overview.taskStats).map(([status, count]) => (
                <div key={status} className="text-center">
                  <div className="text-2xl font-bold text-white">{count}</div>
                  <div className="text-xs text-gray-500 capitalize">{status.replace(/_/g, ' ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── StatCard component ───────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  color: string;
}) {
  const borderColor =
    color === 'blue'
      ? 'border-blue-500/30'
      : color === 'green'
        ? 'border-green-500/30'
        : color === 'yellow'
          ? 'border-yellow-500/30'
          : 'border-red-500/30';

  return (
    <div className={`card border-l-4 ${borderColor}`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
