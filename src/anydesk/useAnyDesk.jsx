import { useEffect, useState, useRef } from "react";
import { createAnyDeskSocket } from "./anydeskSocket";

export function useAnyDesk(roomId) {
  const [connected, setConnected] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Lazy initialize the socket
    const socket = createAnyDeskSocket();
    socketRef.current = socket;

    if (!socket) {
      console.warn('[useAnyDesk] Socket not available');
      return;
    }

    socket.emit("anydesk:join", { roomId });

    const handleConnected = () => {
      setConnected(true);
    };

    const handleStream = (stream) => {
      setRemoteStream(stream);
    };

    socket.on("anydesk:connected", handleConnected);
    socket.on("anydesk:stream", handleStream);

    return () => {
      socket.off("anydesk:connected", handleConnected);
      socket.off("anydesk:stream", handleStream);
      socket.emit("anydesk:leave", { roomId });
    };
  }, [roomId]);

  return { connected, remoteStream };
}
