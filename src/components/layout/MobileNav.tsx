import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Target,
  FlipHorizontal,
  Music2,
  Activity,
  Clock,
  Settings,
  Menu,
  X,
  Waves,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calibration', icon: Target, label: 'Calibration' },
  { to: '/phase', icon: FlipHorizontal, label: 'Phase Experiment' },
  { to: '/therapy', icon: Music2, label: 'Sound Therapy' },
  { to: '/visualiser', icon: Activity, label: 'Visualiser' },
  { to: '/history', icon: Clock, label: 'History' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-surface-800 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Waves className="w-6 h-6 text-accent-blue" />
          <span className="font-semibold">Tinnitus Relief Studio</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="p-2 text-gray-400 hover:text-white transition-colors"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <nav className="bg-surface-800 border-b border-white/5 px-4 pb-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
