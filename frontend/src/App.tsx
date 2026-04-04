import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import Tasks from './pages/Tasks';
import Economy from './pages/Economy';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Setup from './pages/Setup';
import { api } from './services/api';

// ── Setup mode guard ─────────────────────────────────────────
// Checks /api/health on mount. If the server is in setup mode
// (health returns { status: "setup" }), redirect to /setup.
// If already configured and user lands on /setup, redirect to /.

function SetupGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const [isSetupMode, setIsSetupMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const health = await api.getHealthStatus();
        if (cancelled) return;

        if (health.status === 'setup') {
          setIsSetupMode(true);
          if (location.pathname !== '/setup') {
            navigate('/setup', { replace: true });
          }
        } else {
          setIsSetupMode(false);
          if (location.pathname === '/setup') {
            navigate('/', { replace: true });
          }
        }
      } catch {
        // If health check fails, allow normal navigation
        // (server might be fully down or not responding)
        setIsSetupMode(false);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!checked) {
    // Show nothing while checking — avoids flash of wrong page
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <SetupGuard>
        <Routes>
          {/* Setup wizard — rendered WITHOUT the main Layout */}
          <Route path="/setup" element={<Setup />} />

          {/* Main app routes — wrapped in Layout */}
          <Route
            path="/*"
            element={
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/agents" element={<Agents />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/economy" element={<Economy />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            }
          />
        </Routes>
      </SetupGuard>
    </BrowserRouter>
  );
}
