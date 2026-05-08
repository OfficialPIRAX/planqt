import { Routes, Route, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Radio,
  BookOpen,
  Settings,
  Leaf,
  Plus,
  Cloud,
  CloudRain,
  Sun,
  CloudSun,
} from 'lucide-react';
import { LiveDot } from '@/components/LiveDot';
import { useSSE } from '@/lib/sse';
import { fetchDashboard } from '@/lib/api';
import { Dashboard } from '@/routes/Dashboard';
import { Sensors } from '@/routes/Sensors';
import { Templates } from '@/routes/Templates';
import { Settings as SettingsPage } from '@/routes/Settings';

const navItems = [
  { to: '/', label: 'Garten', icon: LayoutDashboard },
  { to: '/sensors', label: 'Sensoren', icon: Radio },
  { to: '/templates', label: 'Vorlagen', icon: BookOpen },
  { to: '/settings', label: 'Mehr', icon: Settings },
] as const;

function WeatherIcon({ description }: { description: string }) {
  const d = description.toLowerCase();
  if (d.includes('regen') || d.includes('schauer')) return <CloudRain className="h-4 w-4" />;
  if (d.includes('wolkig') || d.includes('bedeckt') || d.includes('bewölkt')) return <CloudSun className="h-4 w-4" />;
  if (d.includes('klar') || d.includes('sonnig')) return <Sun className="h-4 w-4" />;
  return <Cloud className="h-4 w-4" />;
}

function AppShell() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    staleTime: 60_000,
  });

  useSSE((event) => {
    window.dispatchEvent(new CustomEvent('flora:sse-event', { detail: event }));
  });

  const weather = data?.weather;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Leaf className="h-4.5 w-4.5 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">
              PlanQT
            </span>
            <LiveDot />
          </div>

          <div className="flex items-center gap-3">
            {weather && (
              <div className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                <WeatherIcon description={weather.description} />
                {weather.tempCurrent != null && (
                  <span className="font-medium tabular-nums">
                    {Math.round(weather.tempCurrent)}°C
                  </span>
                )}
              </div>
            )}
            <button
              onClick={() => navigate('/?new=1')}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-light active:scale-[0.97]"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Neu</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-5xl flex-1">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 z-40 border-t border-border/60 bg-card/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-5xl items-center justify-around">
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 px-4 py-2 text-[0.65rem] font-medium transition-colors min-w-[4rem] ${
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="sensors" element={<Sensors />} />
        <Route path="templates" element={<Templates />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
