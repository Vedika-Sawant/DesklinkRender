import React, { useState, useCallback } from 'react';
import SidebarShell from '../../../chatspace/components/SidebarShell.jsx';
import NewMeetingButton from './NewMeetingButton.jsx';
import JoinMeetingButton from './JoinMeetingButton.jsx';
import SettingsIcon from './SettingsIcon.jsx';
// Using path alias for cleaner imports
import NewMeetingPreview from '@/components/calling/NewMeetingPreview.jsx';
import JoinMeeting from '@/components/calling/JoinMeeting.jsx';
import VideoRoom from '@/components/calling/VideoRoom.jsx';

export default function MeetDashboard() {
  const [showNewMeetingPreview, setShowNewMeetingPreview] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [meetingState, setMeetingState] = useState(null);

  const onCreateMeeting = useCallback(() => {
    setShowNewMeetingPreview(true);
  }, []);

  const onJoinMeeting = useCallback(() => {
    setShowJoinModal(true);
  }, []);

  const handleStartMeeting = useCallback(async (previewData) => {
    try {
      // Generate unique room ID (UUID)
      const roomId = crypto.randomUUID();

      setMeetingState({
        roomId,
        userName: 'You',
        isHost: true,
        localStream: previewData.localStream,
        initialAudioEnabled: previewData.isAudioEnabled,
        initialVideoEnabled: previewData.isVideoEnabled,
      });

      setShowNewMeetingPreview(false);
    } catch (error) {
      console.error('Error starting meeting:', error);
      alert('Failed to start meeting. Please try again.');
    }
  }, []);

  const handleJoinMeetingSubmit = useCallback(async (joinData) => {
    try {
      // Validate room ID format (UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(joinData.meetingId)) {
        alert('Invalid meeting ID format. Please check the meeting ID.');
        return;
      }

      // Initialize local stream
      const constraints = {
        audio: !joinData.dontConnectAudio,
        video: !joinData.turnOffVideo ? { width: 1280, height: 720 } : false,
      };

      let localStream = null;
      try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Failed to access camera/microphone. Please check permissions.');
        return;
      }

      setMeetingState({
        roomId: joinData.meetingId,
        userName: joinData.userName,
        isHost: false,
        localStream,
        initialAudioEnabled: !joinData.dontConnectAudio,
        initialVideoEnabled: !joinData.turnOffVideo,
      });

      setShowJoinModal(false);
    } catch (error) {
      console.error('Error joining meeting:', error);
      alert('Failed to join meeting. Please check your connection and try again.');
    }
  }, []);

  const handleLeaveMeeting = useCallback(() => {
    // Stop local stream tracks
    if (meetingState?.localStream) {
      meetingState.localStream.getTracks().forEach((track) => track.stop());
    }
    setMeetingState(null);
  }, [meetingState]);

  // If in meeting, show meeting room (full screen)
  if (meetingState) {
    return (
      <VideoRoom
        roomId={meetingState.roomId}
        userName={meetingState.userName}
        isHost={meetingState.isHost}
        initialAudioEnabled={meetingState.initialAudioEnabled}
        initialVideoEnabled={meetingState.initialVideoEnabled}
        localStream={meetingState.localStream}
        onLeave={handleLeaveMeeting}
      />
    );
  }

  // Otherwise show dashboard with modals
  return (
    <>
      <div className="min-h-screen flex bg-slate-950 text-slate-50">
        <SidebarShell />

        <main className="relative flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-amber-500/15 blur-3xl" />
            <div className="absolute inset-24 rounded-[32px] border border-slate-800/70 bg-gradient-to-b from-slate-900/70 via-slate-950/80 to-slate-950/95 shadow-[0_0_0_1px_rgba(15,23,42,0.9)]" />
          </div>

          <div className="relative z-10 flex h-full flex-col px-6 py-6 sm:px-10 lg:px-14">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold text-slate-50 sm:text-xl">VisionDesk MeetSpace</h1>
                <p className="mt-1 text-xs text-slate-400 sm:text-sm">
                  Start a new meeting or join an existing one. Your workspace, now face-to-face.
                </p>
              </div>
              <SettingsIcon />
            </div>

            <div className="flex flex-1 items-center justify-center">
              <div className="flex w-full max-w-xl flex-col items-center justify-center gap-10">
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-4 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.4)]" />
                    Ready for your next call
                  </p>
                  <h2 className="text-center text-2xl font-semibold text-slate-50 sm:text-3xl">
                    Seamless meetings, inside VisionDesk.
                  </h2>
                  <p className="max-w-md text-center text-sm text-slate-400">
                    Create an instant room to share, or jump into a scheduled session with a code.
                  </p>
                </div>

                <div className="flex w-full flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
                  <NewMeetingButton onClick={onCreateMeeting} />
                  <JoinMeetingButton onClick={onJoinMeeting} />
                </div>

                {/* Remote Access Agent Download */}
                <div className="mt-8 flex flex-col items-center gap-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Remote Access Setup</p>
                  <a
                    href="/downloads/DeskLinkAgent.exe"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/50 px-6 py-3 text-sm font-medium text-slate-300 transition-all hover:border-amber-500/50 hover:bg-slate-800/80 hover:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    <svg className="h-5 w-5 text-slate-400 transition-colors group-hover:text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Enable Remote Control (Install Agent)
                    <svg className="h-4 w-4 ml-1 opacity-50 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                  <p className="text-[10px] text-slate-500 max-w-xs text-center">
                    Required for full remote control. Install once on your device.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Modals */}
      {showNewMeetingPreview && (
        <NewMeetingPreview
          onClose={() => setShowNewMeetingPreview(false)}
          onStart={handleStartMeeting}
        />
      )}

      {showJoinModal && (
        <JoinMeeting
          onClose={() => setShowJoinModal(false)}
          onJoin={handleJoinMeetingSubmit}
        />
      )}
    </>
  );
}
