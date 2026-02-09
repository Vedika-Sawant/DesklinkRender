import React from 'react';
import { MousePointerClick, ShieldAlert, XCircle } from 'lucide-react';

/**
 * RemoteControlToolbar
 * --------------------
 * Small floating status pill shown above the meeting toolbar when
 * remote control is in use.
 *
 * Props:
 *  - role: 'host' | 'participant'
 *  - state: 'idle' | 'pending' | 'active'
 *  - onOpenPanel: open the detailed remote-control panel
 *  - onRevoke: revoke current control session (host only)
 */
export default function RemoteControlToolbar({
  role = 'participant',
  state = 'idle',
  onOpenPanel,
  onRevoke,
}) {
  if (state === 'idle') return null;

  const isHost = role === 'host';
  const isActive = state === 'active';

  const label = isActive
    ? isHost
      ? 'Student is controlling your screen'
      : 'You are controlling the screen'
    : isHost
      ? 'Control request pending'
      : 'Waiting for host approval';

  return (
    <div className="pointer-events-auto absolute bottom-24 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-center gap-2 rounded-full bg-slate-900/95 border border-slate-700 px-3 py-1.5 shadow-lg text-xs text-slate-100">
        <div className="flex items-center gap-1.5">
          {isActive ? (
            <MousePointerClick className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
          )}
          <span className="text-[11px] whitespace-nowrap">
            {label}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenPanel}
          className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-200 hover:bg-slate-700"
        >
          Open panel
        </button>

        {isHost && isActive && (
          <button
            type="button"
            onClick={onRevoke}
            className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-500"
          >
            <XCircle className="h-3 w-3" />
            <span>Revoke</span>
          </button>
        )}
      </div>
    </div>
  );
}
