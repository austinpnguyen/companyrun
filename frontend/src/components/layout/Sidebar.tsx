import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ListTodo,
  Coins,
  MessageSquare,
  Settings,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../services/api';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents', icon: Users, label: 'Agents' },
  { to: '/tasks', icon: ListTodo, label: 'Tasks' },
  { to: '/economy', icon: Coins, label: 'Economy' },
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const [pendingDecisions, setPendingDecisions] = useState(0);

  useEffect(() => {
    const fetchDecisions = async () => {
      try {
        const res = await api.getDecisions();
        setPendingDecisions(res.total ?? res.decisions?.length ?? 0);
      } catch {
        // Silently ignore if orchestrator not running
      }
    };
    fetchDecisions();
    const interval = setInterval(fetchDecisions, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col min-h-screen">
      {/* Logo / Brand */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-blue-500" />
          <span className="text-lg font-bold text-white">CompanyRun</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">AI Company Dashboard</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
            {label === 'Dashboard' && pendingDecisions > 0 && (
              <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {pendingDecisions}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
        <p className="text-xs text-gray-600">v1.0.0 • Phase 10</p>
      </div>
    </aside>
  );
}
