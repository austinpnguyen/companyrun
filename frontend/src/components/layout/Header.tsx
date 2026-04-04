import { useEffect, useState } from 'react';
import { Bell, Activity } from 'lucide-react';
import { api } from '../../services/api';

export default function Header() {
  const [companyName, setCompanyName] = useState('CompanyRun');
  const [orchStatus, setOrchStatus] = useState<string>('unknown');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [companyRes, orchRes] = await Promise.allSettled([
          api.getCompany(),
          api.getOrchestratorStatus(),
        ]);
        if (companyRes.status === 'fulfilled') {
          setCompanyName(companyRes.value.company?.name ?? 'CompanyRun');
        }
        if (orchRes.status === 'fulfilled') {
          setOrchStatus(orchRes.value.status?.status ?? 'unknown');
        }
      } catch {
        // ignore
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusColor =
    orchStatus === 'running'
      ? 'bg-green-500'
      : orchStatus === 'stopped'
        ? 'bg-red-500'
        : 'bg-yellow-500';

  return (
    <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
      {/* Left: Company name */}
      <h1 className="text-lg font-semibold text-white">{companyName}</h1>

      {/* Right: Status + notifications */}
      <div className="flex items-center gap-4">
        {/* Orchestrator status pill */}
        <div className="flex items-center gap-2 bg-gray-700/50 px-3 py-1.5 rounded-full text-xs">
          <Activity className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-400">Orchestrator</span>
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-gray-300 capitalize">{orchStatus}</span>
        </div>

        {/* Notification bell */}
        <button className="relative text-gray-400 hover:text-gray-200 transition-colors">
          <Bell className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
