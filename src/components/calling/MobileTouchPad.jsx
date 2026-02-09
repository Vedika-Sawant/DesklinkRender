import React from 'react';
import RemoteVideoArea from '../../modules/desklink/components/RemoteVideoArea.jsx';
import { Keyboard, Mouse, ScrollText } from 'lucide-react';

/**
 * MobileTouchPad
 * --------------
 * Mobile-first wrapper around RemoteVideoArea that adds:
 *  - explicit left/right click buttons
 *  - a scroll strip
 *  - an on-screen keyboard toggle
 *
 * It reuses the same control protocol and styling as the existing
 * DeskLink remote viewer components.
 */
export default function MobileTouchPad({
  stream,
  onControlMessage,
  sessionId,
  token,
  permissions,
  stats,
  onToggleKeyboard,
  isKeyboardVisible,
  onScroll,
}) {
  const handleScroll = (direction) => {
    if (!onScroll) return;
    const delta = direction === 'up' ? -120 : 120;
    onScroll(delta);
  };

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
        <RemoteVideoArea
          stream={stream}
          onControlMessage={onControlMessage}
          sessionId={sessionId}
          token={token}
          permissions={permissions}
          stats={stats}
        />
      </div>

      {/* Touch controls row */}
      <div className="mt-1 flex items-stretch gap-2 text-xs text-slate-200">
        {/* Left / Right click buttons */}
        <div className="flex-1 flex items-center gap-2">
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2 transition-colors active:scale-[0.97] active:bg-emerald-600"
            onMouseDown={() => {
              navigator.vibrate?.(10);
              onControlMessage?.({
                type: 'mousedown',
                button: 0, // left button
                sessionId,
                auth: token,
                ts: Date.now(),
              });
            }}
            onMouseUp={() => {
              onControlMessage?.({
                type: 'mouseup',
                button: 0, // left button
                sessionId,
                auth: token,
                ts: Date.now(),
              });
            }}
          >
            <Mouse className="h-3.5 w-3.5" />
            <span className="uppercase tracking-wide text-[10px]">Left click</span>
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2 transition-colors active:scale-[0.97] active:bg-emerald-600"
            onMouseDown={() => {
              navigator.vibrate?.(10);
              onControlMessage?.({
                type: 'mousedown',
                button: 2, // right button
                sessionId,
                auth: token,
                ts: Date.now(),
              });
            }}
            onMouseUp={() => {
              onControlMessage?.({
                type: 'mouseup',
                button: 2, // right button
                sessionId,
                auth: token,
                ts: Date.now(),
              });
            }}
          >
            <Mouse className="h-3.5 w-3.5 transform scale-x-[-1]" />
            <span className="uppercase tracking-wide text-[10px]">Right click</span>
          </button>
        </div>

        {/* Scroll strip */}
        <div className="flex flex-col items-stretch w-10 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={() => handleScroll('up')}
            className="flex-1 flex items-center justify-center text-slate-300 hover:bg-slate-800 active:bg-slate-700"
          >
            <ScrollText className="h-3.5 w-3.5 rotate-180" />
          </button>
          <div className="h-px bg-slate-800" />
          <button
            type="button"
            onClick={() => handleScroll('down')}
            className="flex-1 flex items-center justify-center text-slate-300 hover:bg-slate-800 active:bg-slate-700"
          >
            <ScrollText className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Keyboard toggle */}
        <button
          type="button"
          onClick={onToggleKeyboard}
          className={`flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-[10px] font-medium tracking-wide uppercase transition-colors ${
            isKeyboardVisible
              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
              : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Keyboard className="h-3.5 w-3.5" />
          <span>{isKeyboardVisible ? 'Hide KB' : 'Keyboard'}</span>
        </button>
      </div>
    </div>
  );
}
