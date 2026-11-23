import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Target,
  FlipHorizontal,
  Music2,
  Activity,
  Clock,
  Settings,
  Waves,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calibration', icon: Target, label: 'Calibration' },
  { to: '/phase', icon: FlipHorizontal, label: 'Phase Experiment' },
  { to: '/therapy', icon: Music2, label: 'Sound Therapy' },
  { to: '/visualiser', icon: Activity, label: 'Visualiser' },
  { to: '/history', icon: Clock, label: 'Session History' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-64 bg-surface-800 border-r border-white/5 p-4">
      <div className="flex items-center gap-3 px-4 py-3 mb-6">
        <Waves className="w-7 h-7 text-accent-blue" />
        <div>
          <h1 className="text-lg font-semibold text-white">Tinnitus Relief</h1>
          <p className="text-xs text-gray-500">Studio</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'nav-item-active' : ''}`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-sm font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-4 py-3 text-xs text-gray-600">
        <p>⚠️ Not a medical device.</p>
        <p className="mt-1">For experimental use only.</p>
      </div>
    </aside>
  );
}
