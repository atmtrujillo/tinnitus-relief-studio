import { Trash2, TrendingDown, Calendar, FileText, Plus } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { formatDate, formatDuration, formatFrequency } from '../utils';

interface SessionHistoryProps {
  onOpenReliefLog: () => void;
}

export function SessionHistory({ onOpenReliefLog }: SessionHistoryProps) {
  const { state, dispatch } = useAppContext();
  const chronological = state.sessions;
  const sessions = [...chronological].reverse();

  const avgBefore =
    sessions.length > 0
      ? sessions.reduce((s, r) => s + r.ratingBefore, 0) / sessions.length
      : 0;
  const avgAfter =
    sessions.length > 0
      ? sessions.reduce((s, r) => s + r.ratingAfter, 0) / sessions.length
      : 0;
  const avgImprovement = avgBefore - avgAfter;

  // Trend chart data (last 20 sessions)
  const chartData = chronological.slice(-20);
  const chartW = 640;
  const chartH = 170;
  const padX = 28;
  const padY = 18;
  const innerW = chartW - padX * 2;
  const innerH = chartH - padY * 2;

  const xAt = (i: number) =>
    chartData.length <= 1
      ? padX + innerW / 2
      : padX + (i / (chartData.length - 1)) * innerW;
  const yAt = (rating: number) => padY + ((10 - rating) / 10) * innerH;

  const beforePath = chartData
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(s.ratingBefore).toFixed(1)}`)
    .join(' ');
  const afterPath = chartData
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(s.ratingAfter).toFixed(1)}`)
    .join(' ');

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Session History</h1>
          <p className="text-sm text-gray-400 mt-1">
            Personal log of subjective before/after tinnitus ratings. Do not interpret
            subjective improvements as evidence of medical efficacy.
          </p>
        </div>
        <button onClick={onOpenReliefLog} className="btn-primary text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Log Assessment
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 text-center">
          <Calendar className="w-5 h-5 text-accent-blue mx-auto mb-1.5" />
          <span className="text-xs text-gray-500 block">Total Sessions</span>
          <span className="text-2xl font-mono font-semibold text-white">{sessions.length}</span>
        </div>
        <div className="glass-panel p-4 text-center">
          <TrendingDown className="w-5 h-5 text-amber-400 mx-auto mb-1.5" />
          <span className="text-xs text-gray-500 block">Avg. Before</span>
          <span className="text-2xl font-mono font-semibold text-amber-300">
            {sessions.length > 0 ? avgBefore.toFixed(1) : '—'}
          </span>
        </div>
        <div className="glass-panel p-4 text-center">
          <TrendingDown className="w-5 h-5 text-accent-green mx-auto mb-1.5" />
          <span className="text-xs text-gray-500 block">Avg. After</span>
          <span className="text-2xl font-mono font-semibold text-accent-green">
            {sessions.length > 0 ? avgAfter.toFixed(1) : '—'}
          </span>
        </div>
        <div className="glass-panel p-4 text-center">
          <TrendingDown className="w-5 h-5 text-accent-purple mx-auto mb-1.5" />
          <span className="text-xs text-gray-500 block">Avg. Change</span>
          <span className="text-2xl font-mono font-semibold text-accent-purple">
            {sessions.length > 0
              ? avgImprovement > 0
                ? `−${avgImprovement.toFixed(1)}`
                : avgImprovement < 0
                ? `+${Math.abs(avgImprovement).toFixed(1)}`
                : '0.0'
              : '—'}
          </span>
        </div>
      </div>

      {/* Trend Chart */}
      {chartData.length > 0 && (
        <div className="glass-panel p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="uppercase tracking-wider text-gray-400">
              Subjective Intensity Trend (Last {chartData.length} sessions)
            </span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                Before
              </span>
              <span className="flex items-center gap-1.5 text-accent-green">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-green" />
                After
              </span>
            </div>
          </div>

          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-44 bg-surface-900 rounded-lg border border-white/5">
            {[0, 2, 5, 8, 10].map((v) => (
              <g key={v}>
                <line
                  x1={padX}
                  y1={yAt(v)}
                  x2={chartW - padX}
                  y2={yAt(v)}
                  stroke="rgba(255,255,255,0.06)"
                />
                <text
                  x={10}
                  y={yAt(v) + 3}
                  fill="rgba(156,163,175,0.6)"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {v}
                </text>
              </g>
            ))}

            {chartData.length > 1 && (
              <>
                <path d={beforePath} fill="none" stroke="#fbbf24" strokeWidth="2" opacity="0.85" />
                <path d={afterPath} fill="none" stroke="#10b981" strokeWidth="2" />
              </>
            )}

            {chartData.map((s, i) => (
              <g key={s.id}>
                <circle cx={xAt(i)} cy={yAt(s.ratingBefore)} r="3.5" fill="#fbbf24" />
                <circle cx={xAt(i)} cy={yAt(s.ratingAfter)} r="3.5" fill="#10b981" />
              </g>
            ))}
          </svg>
        </div>
      )}

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-300 font-medium">No sessions recorded yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Complete a sound therapy session or click &ldquo;Log Assessment&rdquo; to start
            tracking how different sounds feel.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const improvement = session.ratingBefore - session.ratingAfter;
            return (
              <div
                key={session.id}
                className="glass-panel p-4 flex flex-col md:flex-row md:items-center gap-4"
              >
                <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-gray-500 block">Date</span>
                    <span className="text-white text-xs">{formatDate(session.date)}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Technique</span>
                    <span className="text-white text-xs">{session.technique}</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Frequency</span>
                    <span className="text-white font-mono text-xs">
                      {session.frequency != null ? formatFrequency(session.frequency) : 'Broadband'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Duration</span>
                    <span className="text-white font-mono text-xs">
                      {formatDuration(session.duration)}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Rating</span>
                    <span className="font-mono text-xs">
                      <span className="text-amber-300">{session.ratingBefore}</span>
                      <span className="text-gray-500 mx-1">→</span>
                      <span className="text-accent-green">{session.ratingAfter}</span>
                      {improvement !== 0 && (
                        <span
                          className={`ml-1.5 ${
                            improvement > 0 ? 'text-accent-green' : 'text-red-400'
                          }`}
                        >
                          ({improvement > 0 ? `−${improvement}` : `+${Math.abs(improvement)}`})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                {session.notes && (
                  <p className="text-xs text-gray-400 md:max-w-xs border-l border-white/10 pl-3">
                    {session.notes}
                  </p>
                )}
                <button
                  onClick={() => dispatch({ type: 'DELETE_SESSION', payload: session.id })}
                  className="text-gray-500 hover:text-red-400 transition-colors self-start md:self-center p-1"
                  title="Delete record"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
