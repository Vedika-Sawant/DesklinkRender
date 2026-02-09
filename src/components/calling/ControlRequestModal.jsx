import React from 'react';
import { Mouse, ShieldAlert } from 'lucide-react';

/**
 * ControlRequestModal
 * --------------------
 * Host-side modal shown when a participant requests remote control
 * during a live VisionDesk meeting.
 *
 * Visually aligned with JoinMeetingModal / IncomingRequestModal.
 */
export default function ControlRequestModal({
  requesterName,
  roomLabel,
  onGrant,
  onReject,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl bg-[#0B1120] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <Mouse className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-sm font-semibold text-slate-50">Remote control request</h2>
              {roomLabel && (
                <span className="text-[11px] text-slate-400">Room {roomLabel}</span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4 bg-slate-950/80">
          <p className="text-sm text-slate-300">
            <span className="font-medium text-slate-50">{requesterName || 'A participant'}</span>
            <span className="text-slate-400"> is requesting temporary control of your screen.</span>
          </p>

          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
            <ShieldAlert className="h-4 w-4 text-amber-400 mt-0.5" />
            <div className="text-[11px] leading-relaxed text-amber-100">
              They will be able to move your mouse and type on your behalf until you revoke
              control. You can revoke access at any time using the red "Revoke control" button.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-800 bg-slate-900/70 px-6 py-4">
          <button
            type="button"
            onClick={onReject}
            className="rounded-xl border border-slate-700 bg-transparent px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-600 focus:ring-offset-2 focus:ring-offset-[#0B1120]"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onGrant}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 shadow-[0_15px_35px_rgba(16,185,129,0.45)] transition-colors hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-[#0B1120]"
          >
            Grant control
          </button>
        </div>
      </div>
    </div>
  );
}
