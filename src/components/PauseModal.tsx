import { useState } from 'react';
import { Download, LogOut, RotateCcw, Upload, X } from 'lucide-react';
import type { ChronicleEntry, FpsCap, SettingsState } from '../game/types';

interface PauseModalProps {
  settings: SettingsState;
  chronicle: ChronicleEntry[];
  mpRoomCode?: string | null;
  onLeaveRoom?: () => void;
  onResume: () => void;
  onChangeSimSpeed: (speed: 0 | 1 | 2 | 3) => void;
  onChangeFpsCap: (fps: FpsCap) => void;
  onExportSave: () => string;
  onImportSave: (json: string) => boolean;
  onResetVillage: () => void;
}

export function PauseModal({
  settings,
  chronicle,
  mpRoomCode,
  onLeaveRoom,
  onResume,
  onChangeSimSpeed,
  onChangeFpsCap,
  onExportSave,
  onImportSave,
  onResetVillage,
}: PauseModalProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleDownload = () => {
    const data = onExportSave();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hearthglen-save.json';
    a.click();
    URL.revokeObjectURL(url);
    setNotice('Save file downloaded.');
  };

  const handleImport = () => {
    const ok = onImportSave(importText.trim());
    setNotice(ok ? 'Village save restored!' : 'Invalid save JSON format.');
    if (ok) {
      setShowImport(false);
      setImportText('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0B0E15]/75 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Village Journal and Performance Settings"
    >
      <div className="w-full max-w-lg kingdom-frame rounded-lg p-6 text-[#F3EAD6] max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#8E6B35]/40">
          <h2 className="text-xl font-semibold text-[#F7EFDD]" style={{ fontFamily: 'var(--font-display)' }}>
            Archipelago Chronicle & Eco Performance
          </h2>
          <button
            type="button"
            onClick={onResume}
            className="p-1.5 rounded-sm hover:bg-[#252D3D] text-[#B4A995] hover:text-[#F3EAD6] cursor-pointer"
            aria-label="Resume Game"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Performance & Simulation Speed */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-[#B4A995] mb-1.5">Simulation Pace</div>
            <div className="flex items-center gap-1 p-1 rounded bg-[#1B212E] border border-[#8E6B35]/30">
              {([0, 1, 2, 3] as const).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => onChangeSimSpeed(sp)}
                  className={`flex-1 py-1.5 rounded-sm text-xs font-semibold cursor-pointer transition-colors ${
                    settings.simSpeed === sp
                      ? 'bg-[#D69635] text-[#14161D]'
                      : 'text-[#B4A995] hover:text-[#F3EAD6]'
                  }`}
                >
                  {sp === 0 ? 'Paused' : `${sp}x`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-[#B4A995] mb-1.5">Render Frame Rate</div>
            <div className="flex items-center gap-1 p-1 rounded bg-[#1B212E] border border-[#8E6B35]/30">
              {([15, 30, 60] as FpsCap[]).map((fps) => (
                <button
                  key={fps}
                  type="button"
                  onClick={() => onChangeFpsCap(fps)}
                  className={`flex-1 py-1.5 rounded-sm text-xs font-semibold cursor-pointer transition-colors tabular-nums ${
                    settings.fpsCap === fps
                      ? 'bg-[#4C8767] text-[#FFFDF9]'
                      : 'text-[#B4A995] hover:text-[#F3EAD6]'
                  }`}
                >
                  {fps === 15 ? 'Eco 15' : `${fps} fps`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-2 text-[11px] text-[#B4A995]">
          Backgrounded browser tabs pause 3D rendering automatically while keeping catch-up progress intact when you return.
        </p>

        {/* Chronicle */}
        <div className="mt-4 pt-3 border-t border-[#8E6B35]/35">
          <div className="text-xs font-semibold text-[#F3EAD6] mb-2">Archipelago Chronicle</div>
          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 text-xs">
            {chronicle.map((entry) => (
              <div key={entry.id} className="text-[#D1C6B2]">
                <span className="font-semibold text-[#E5AF47] tabular-nums">Day {entry.day}:</span>{' '}
                {entry.text}
              </div>
            ))}
          </div>
        </div>

        {/* Keyboard Shortcuts Reference */}
        <div className="mt-4 pt-3 border-t border-[#8E6B35]/35 text-[11px] text-[#B4A995]">
          <span className="font-semibold text-[#F3EAD6]">Controls & Shortcuts:</span> Drag Pan · Scroll Zoom · Space Pause/Play · 0 Recenter · Tab Cycle Villager · 1–9 Assign/Suggest Role · A Free Will · T Talk · P Praise · E Nudge Curiosity · F Meal · B Ledger · G Map · C Sky · H Dock · M Mute · Esc Journal
        </div>

        {/* Save Management & Room Controls */}
        <div className="mt-4 pt-3 border-t border-[#8E6B35]/35 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-sm bg-[#212836] hover:bg-[#2C3547] border border-[#8E6B35]/40 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#E5AF47]" />
              <span>Export Save</span>
            </button>
            {!mpRoomCode && (
              <button
                type="button"
                onClick={() => setShowImport((v) => !v)}
                className="px-3 py-1.5 rounded-sm bg-[#212836] hover:bg-[#2C3547] border border-[#8E6B35]/40 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#E5AF47]" />
                <span>Import</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {mpRoomCode && onLeaveRoom ? (
              <button
                type="button"
                onClick={onLeaveRoom}
                className="px-3 py-1.5 rounded-sm text-[#E38589] hover:bg-[#312128] border border-[#C8666B]/40 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave Room ({mpRoomCode})</span>
              </button>
            ) : !confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-3 py-1.5 rounded-sm text-[#E38589] hover:bg-[#312128] text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Archipelago</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onResetVillage();
                  setConfirmReset(false);
                }}
                className="px-3 py-1.5 rounded-sm bg-[#B84A52] text-white text-xs font-semibold cursor-pointer"
              >
                Confirm Reset
              </button>
            )}
            <button
              type="button"
              onClick={onResume}
              className="px-4 py-1.5 rounded-sm bg-[#D69635] hover:bg-[#E5A746] text-[#14161D] text-xs font-semibold cursor-pointer"
            >
              Return to Sky-Sea
            </button>
          </div>
        </div>

        {showImport && !mpRoomCode && (
          <div className="mt-3 space-y-2">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste exported JSON save here..."
              className="w-full h-20 rounded-sm border border-[#8E6B35]/50 bg-[#141923] text-[#F3EAD6] p-2 text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleImport}
              className="px-3 py-1.5 rounded-sm bg-[#4C8767] text-white text-xs font-semibold cursor-pointer"
            >
              Restore Save
            </button>
          </div>
        )}
        {notice && <p className="mt-2 text-xs text-[#74C294] font-medium">{notice}</p>}
      </div>
    </div>
  );
}
