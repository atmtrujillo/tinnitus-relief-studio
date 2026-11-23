import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar, MobileNav, TransportBar } from './components/layout';
import { ReliefSessionModal } from './components/common';
import { usePanicHotkey } from './hooks';
import {
  Dashboard,
  Calibration,
  PhaseExperiment,
  SoundTherapy,
  Visualiser,
  SessionHistory,
  SettingsPage,
} from './pages';

export default function App() {
  const [reliefModalOpen, setReliefModalOpen] = useState(false);
  usePanicHotkey();

  return (
    <div className="flex h-screen overflow-hidden bg-surface-900 text-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MobileNav />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard onOpenReliefLog={() => setReliefModalOpen(true)} />} />
            <Route path="/calibration" element={<Calibration />} />
            <Route path="/phase" element={<PhaseExperiment />} />
            <Route path="/therapy" element={<SoundTherapy />} />
            <Route path="/visualiser" element={<Visualiser />} />
            <Route path="/history" element={<SessionHistory onOpenReliefLog={() => setReliefModalOpen(true)} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <TransportBar onOpenReliefLog={() => setReliefModalOpen(true)} />
      </div>
      <ReliefSessionModal open={reliefModalOpen} onClose={() => setReliefModalOpen(false)} />
    </div>
  );
}
