/**
 * VisionDesk / DeskLink - Mobile Remote Control Helper
 * ----------------------------------------------------
 * This module provides DOM-level helpers to map MOBILE touch/gesture
 * input into remote desktop control messages.
 *
 * It is intentionally UI-framework-agnostic and is meant to be used
 * from React components like RemoteVideoArea or meeting-specific
 * viewers.
 *
 * Responsibilities (Phase 1):
 *  - Attach touch listeners to a given element that is rendering the
 *    remote desktop video.
 *  - Map gestures to abstract control actions:
 *      * Single-finger move   -> mouse move
 *      * Single-finger tap    -> left click
 *      * Two-finger tap       -> right click
 *      * Vertical swipe       -> scroll
 *  - Optionally forward keyboard events from a provided input element.
 *  - Delegate message creation & transport to caller via callbacks.
 *
 * IMPORTANT:
 *  - This module DOES NOT know about WebRTC or the DeskLink protocol.
 *    The caller passes a "createMessage" + "send" callback pair, which
 *    can be wired to WebRTC DataChannels or WebSockets as needed.
 *  - This keeps the file reusable for both DeskLink remote viewer and
 *    VisionDesk in-meeting remote control.
 */

/**
 * Very small throttler for high-frequency events (e.g. touchmove).
 * Defaults to ~60fps when intervalMs = 16.
 */
class SimpleThrottler {
  constructor(intervalMs = 16) {
    this.intervalMs = intervalMs;
    this.lastSent = 0;
    this.pending = null;
    this.timeoutId = null;
  }

  schedule(message, sendFn) {
    const now = Date.now();
    const elapsed = now - this.lastSent;

    if (elapsed >= this.intervalMs) {
      this.lastSent = now;
      this.pending = null;
      sendFn(message);
      return;
    }

    this.pending = message;
    if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => {
        this.timeoutId = null;
        if (this.pending) {
          const msg = this.pending;
          this.pending = null;
          this.lastSent = Date.now();
          sendFn(msg);
        }
      }, this.intervalMs - elapsed);
    }
  }

  clear() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.pending = null;
  }
}

/**
 * Attach mobile remote control gesture handling to a DOM element.
 *
 * @param {Object} options
 * @param {HTMLElement} options.element                - Element that displays the remote screen (video/canvas/div)
 * @param {(msg: any) => void} options.send            - Function to send a FULLY CONSTRUCTED control message
 * @param {Object} options.messageFactory              - Functions that build protocol messages
 * @param {(x: number, y: number) => any} options.messageFactory.createMouseMove
 * @param {(x: number, y: number, button: string) => any} options.messageFactory.createMouseClick
 * @param {(dx: number, dy: number) => any} options.messageFactory.createMouseWheel
 * @param {(key: string, isDown: boolean, modifiers?: any) => any} [options.messageFactory.createKey]
 * @param {number} [options.throttleMs=16]             - Throttle interval for move events
 * @param {HTMLInputElement|HTMLTextAreaElement} [options.keyboardElement] - Optional input for on-screen keyboard
 *
 * @returns {{ detach: () => void }}
 */
export function attachMobileRemoteControl({
  element,
  send,
  messageFactory,
  throttleMs = 16,
  keyboardElement,
}) {
  if (!element || typeof element.addEventListener !== 'function') {
    throw new Error('attachMobileRemoteControl: element must be a valid HTMLElement');
  }
  if (!send || typeof send !== 'function') {
    throw new Error('attachMobileRemoteControl: send must be a function');
  }
  if (!messageFactory || typeof messageFactory.createMouseMove !== 'function') {
    throw new Error('attachMobileRemoteControl: messageFactory with createMouseMove is required');
  }

  const {
    createMouseMove,
    createMouseClick,
    createMouseWheel,
    createKey,
  } = messageFactory;

  const throttler = new SimpleThrottler(throttleMs);

  const touchState = {
    activeTouches: new Map(), // touch.identifier -> { startX, startY, startTime }
  };

  function getNormalizedFromTouch(touch) {
    const rect = element.getBoundingClientRect();
    const xNorm = (touch.clientX - rect.left) / rect.width;
    const yNorm = (touch.clientY - rect.top) / rect.height;
    const x = Math.min(1, Math.max(0, xNorm));
    const y = Math.min(1, Math.max(0, yNorm));
    return { x, y };
  }

  function onTouchStart(e) {
    // Prevent browser scroll/zoom
    e.preventDefault();
    const now = Date.now();

    for (const touch of Array.from(e.changedTouches)) {
      touchState.activeTouches.set(touch.identifier, {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: now,
      });
    }
  }

  function onTouchMove(e) {
    e.preventDefault();

    for (const touch of Array.from(e.touches)) {
      const { x, y } = getNormalizedFromTouch(touch);
      const msg = createMouseMove(x, y);
      throttler.schedule(msg, send);
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();

    const now = Date.now();
    const changedTouches = Array.from(e.changedTouches);
    const remainingTouches = e.touches.length;

    if (remainingTouches === 0 && changedTouches.length > 0) {
      // All fingers lifted: interpret gesture
      const touchInfos = changedTouches.map((t) => {
        const start = touchState.activeTouches.get(t.identifier);
        return {
          id: t.identifier,
          startX: start ? start.startX : t.clientX,
          startY: start ? start.startY : t.clientY,
          endX: t.clientX,
          endY: t.clientY,
          durationMs: start ? now - start.startTime : 0,
        };
      });

      touchState.activeTouches.clear();

      if (touchInfos.length === 1) {
        const info = touchInfos[0];
        const moveDist = Math.hypot(info.endX - info.startX, info.endY - info.startY);

        if (moveDist < 10 && info.durationMs < 300) {
          // Single tap -> left click at last position
          const fakeTouch = {
            clientX: info.endX,
            clientY: info.endY,
          };
          const { x, y } = getNormalizedFromTouch(fakeTouch);
          const msg = createMouseClick(x, y, 'left');
          send(msg);
        } else {
          // Vertical swipe -> scroll
          const deltaY = info.startY - info.endY;
          if (Math.abs(deltaY) > 5 && typeof createMouseWheel === 'function') {
            const msg = createMouseWheel(0, deltaY);
            send(msg);
          }
        }
      } else if (touchInfos.length === 2) {
        // Two-finger gestures: tap = right click, swipe = stronger scroll
        const distances = touchInfos.map((info) =>
          Math.hypot(info.endX - info.startX, info.endY - info.startY),
        );
        const maxDistance = Math.max(...distances);
        const maxDuration = Math.max(...touchInfos.map((t) => t.durationMs));

        if (maxDistance < 15 && maxDuration < 350) {
          // Two-finger tap -> right click (use average position)
          const midX = (touchInfos[0].endX + touchInfos[1].endX) / 2;
          const midY = (touchInfos[0].endY + touchInfos[1].endY) / 2;
          const fakeTouch = { clientX: midX, clientY: midY };
          const { x, y } = getNormalizedFromTouch(fakeTouch);
          const msg = createMouseClick(x, y, 'right');
          send(msg);
        } else if (typeof createMouseWheel === 'function') {
          const avgDeltaY =
            (touchInfos[0].startY - touchInfos[0].endY +
              (touchInfos[1].startY - touchInfos[1].endY)) /
            2;
          if (Math.abs(avgDeltaY) > 5) {
            const msg = createMouseWheel(0, avgDeltaY * 1.5);
            send(msg);
          }
        }
      }
    } else {
      // Some touches remain; just clear the ones that ended
      for (const touch of changedTouches) {
        touchState.activeTouches.delete(touch.identifier);
      }
    }
  }

  function onKeyDown(e) {
    if (!createKey) return;
    // Forward most keyboard input; let caller decide filtering.
    const modifiers = {
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    };
    const msg = createKey(e.key, true, modifiers);
    // Prevent browser shortcuts so they go to remote host
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault();
    }
    send(msg);
  }

  function onKeyUp(e) {
    if (!createKey) return;
    const modifiers = {
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    };
    const msg = createKey(e.key, false, modifiers);
    if (e.ctrlKey || e.metaKey || e.altKey) {
      e.preventDefault();
    }
    send(msg);
  }

  element.addEventListener('touchstart', onTouchStart, { passive: false });
  element.addEventListener('touchmove', onTouchMove, { passive: false });
  element.addEventListener('touchend', onTouchEnd, { passive: false });
  element.addEventListener('touchcancel', onTouchEnd, { passive: false });

  if (keyboardElement && typeof keyboardElement.addEventListener === 'function') {
    keyboardElement.addEventListener('keydown', onKeyDown);
    keyboardElement.addEventListener('keyup', onKeyUp);
  }

  return {
    detach() {
      throttler.clear();
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
      if (keyboardElement && typeof keyboardElement.removeEventListener === 'function') {
        keyboardElement.removeEventListener('keydown', onKeyDown);
        keyboardElement.removeEventListener('keyup', onKeyUp);
      }
    },
  };
}

// TODO: In a future phase we may also export higher-level helpers that
// directly integrate with DeskLink's control protocol and WebRTC
// DataChannels, but for Phase 1 this file stays protocol-agnostic.
