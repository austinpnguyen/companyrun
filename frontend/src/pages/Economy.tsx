// ============================================================
// Economy Page — budget overview, leaderboard, charts
// ============================================================

import { useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Trophy } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useEconomyStore } from '../stores/economyStore';

export default function Economy() {
  const { overview, leaderboard, loading, error, fetchOverview, fetchLeaderboard } = useEconomyStore();

  useEffect(() => {
    fetchOverview();
    fetchLeaderboard(10);
  }, [fetchOverview, fetchLeaderboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading economy data...</div>
      </div>
    );
  }

  // Chart data from leaderboard
  const chartData = leaderboard.map((entry) => ({
    name: entry.agentName ?? entry.agentId?.slice(0, 8) ?? 'Unknown',
    earned: Number(entry.totalEarned ?? 0),
    spent: Number(entry.totalSpent ?? 0),
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Economy</h2>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Budget Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card border-l-4 border-blue-500/30">
          <div className="flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Budget</p>
              <p className="text-xl font-bold text-white">
                ${Number(overview?.budgetTotal ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="card border-l-4 border-red-500/30">
          <div className="flex items-center gap-3">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Spent</p>
              <p className="text-xl font-bold text-white">
                ${Number(overview?.totalSpent ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="card border-l-4 border-green-500/30">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Remaining</p>
              <p className="text-xl font-bold text-white">
                ${Number(overview?.budgetRemaining ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Earnings vs Penalties Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-white mb-4">Earnings vs Spending by Agent</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                axisLine={{ stroke: '#374151' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                axisLine={{ stroke: '#374151' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#f3f4f6',
                }}
              />
              <Legend />
              <Bar dataKey="earned" name="Earned" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="spent" name="Spent" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <h3 className="text-lg font-semibold text-white">Top Earners Leaderboard</h3>
        </div>

        {leaderboard.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-700">
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Agent</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4 text-right">Balance</th>
                  <th className="pb-2 pr-4 text-right">Earned</th>
                  <th className="pb-2 text-right">Spent</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => (
                  <tr key={entry.agentId} className="border-b border-gray-700/50">
                    <td className="py-2 pr-4 text-gray-400">{i + 1}</td>
                    <td className="py-2 pr-4 text-white font-medium">{entry.agentName}</td>
                    <td className="py-2 pr-4 text-gray-400 capitalize">{entry.role}</td>
                    <td className="py-2 pr-4 text-right text-blue-400 font-mono">
                      ${Number(entry.balance).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-green-400 font-mono">
                      ${Number(entry.totalEarned).toFixed(2)}
                    </td>
                    <td className="py-2 text-right text-red-400 font-mono">
                      ${Number(entry.totalSpent).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No economy data yet</p>
        )}
      </div>
    </div>
  );
}
