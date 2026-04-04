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
import { useThemeStore } from '../../stores/themeStore';

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
  const { theme } = useThemeStore();

  useEffect(() => {
    const fetchDecisions = async () => {
      try {
        const res = await api.getDecisions();
        setPendingDecisions(res.total ?? res.decisions?.length ?? 0);
      } catch {
        // ignore
      }
    };
    fetchDecisions();
    const interval = setInterval(fetchDecisions, 15000);
    return () => clearInterval(interval);
  }, []);

  // Colorful theme gets a special logo gradient
  const logoStyle =
    theme === 'colorful'
      ? { background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
      : { color: 'var(--cr-logo-color)' };

  return (
    <aside
      className="w-64 flex flex-col min-h-screen"
      style={{
        backgroundColor: 'var(--cr-surface)',
        borderRight: '1px solid var(--cr-border)',
      }}
    >
      {/* Logo / Brand */}
      <div className="p-4" style={{ borderBottom: '1px solid var(--cr-border)' }}>
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6" style={{ color: 'var(--cr-logo-color)' }} />
          <span className="text-lg font-bold" style={{ color: 'var(--cr-text)' }}>
            CompanyRun
          </span>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--cr-text-5)' }}>
          AI Company Dashboard
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.625rem 0.75rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              textDecoration: 'none',
              transition: 'background-color 0.15s, color 0.15s',
              backgroundColor: isActive ? 'var(--cr-nav-active-bg)' : 'transparent',
              color: isActive ? 'var(--cr-nav-active-text)' : 'var(--cr-text-3)',
            })}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              if (!el.classList.contains('active')) {
                el.style.backgroundColor = 'var(--cr-nav-hover-bg)';
                el.style.color = 'var(--cr-nav-hover-text)';
              }
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              if (!el.classList.contains('active')) {
                el.style.backgroundColor = 'transparent';
                el.style.color = 'var(--cr-text-3)';
              }
            }}
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
      <div className="p-4" style={{ borderTop: '1px solid var(--cr-border)' }}>
        <p className="text-xs" style={{ color: 'var(--cr-text-5)' }}>
          v1.0.0 • Phase 10
        </p>
      </div>
    </aside>
  );
}
