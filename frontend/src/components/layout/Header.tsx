import { useEffect, useState } from 'react';
import { Bell, Activity, Sun, Moon, Sparkles } from 'lucide-react';
import { api } from '../../services/api';
import { useThemeStore, type Theme } from '../../stores/themeStore';

const THEMES: { id: Theme; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'light',    icon: Sun,      label: 'Light' },
  { id: 'dark',     icon: Moon,     label: 'Dark' },
  { id: 'colorful', icon: Sparkles, label: 'Colorful' },
];

export default function Header() {
  const [companyName, setCompanyName] = useState('CompanyRun');
  const [orchStatus, setOrchStatus] = useState<string>('unknown');
  const { theme, setTheme } = useThemeStore();

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
    <header
      className="h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6"
      style={{ backgroundColor: 'var(--cr-surface)', borderColor: 'var(--cr-border)' }}
    >
      {/* Left: Company name */}
      <h1 className="text-lg font-semibold" style={{ color: 'var(--cr-text)' }}>
        {companyName}
      </h1>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Theme switcher */}
        <div
          className="flex items-center gap-0.5 rounded-lg p-0.5"
          style={{ background: 'var(--cr-raised)', border: '1px solid var(--cr-border)' }}
        >
          {THEMES.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              title={label}
              className="flex items-center justify-center w-7 h-7 rounded-md transition-all"
              style={{
                background: theme === id ? 'var(--cr-accent)' : 'transparent',
                color: theme === id ? '#fff' : 'var(--cr-text-3)',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        {/* Orchestrator status pill */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
          style={{ background: 'var(--cr-raised)', color: 'var(--cr-text-3)' }}
        >
          <Activity className="w-3.5 h-3.5" style={{ color: 'var(--cr-text-4)' }} />
          <span style={{ color: 'var(--cr-text-4)' }}>Orchestrator</span>
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span style={{ color: 'var(--cr-text-3)' }} className="capitalize">{orchStatus}</span>
        </div>

        {/* Notification bell */}
        <button
          className="relative transition-colors"
          style={{ color: 'var(--cr-text-4)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--cr-text)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--cr-text-4)')}
        >
          <Bell className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
