import { useEffect, useRef } from 'react';
import { useMeetingStore } from '../store/meetingStore';
import type { Socket } from 'socket.io-client';

const SYNC_ROUNDS = 5;
const SYNC_INTERVAL_MS = 30_000;

export function useTimeSync(socket: Socket | null) {
  const setClockOffset = useMeetingStore((s) => s.setClockOffset);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function syncClock() {
    if (!socket?.connected) return;
    const samples: number[] = [];

    for (let i = 0; i < SYNC_ROUNDS; i++) {
      await new Promise<void>((resolve) => {
        const t0 = Date.now();
        socket.emit('time:sync', { t0 }, (res: { t1: number; t2: number; serverNow: number }) => {
          const t3 = Date.now();
          const offset = ((res.t1 - t0) + (res.t2 - t3)) / 2;
          samples.push(offset);
          resolve();
        });
      });
      await new Promise((r) => setTimeout(r, 50));
    }

    // Discard outliers
    const sorted = [...samples].sort((a, b) => a - b);
    const trimmed = sorted.length > 2 ? sorted.slice(1, -1) : sorted;
    const avgOffset = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    setClockOffset(Math.round(avgOffset));
  }

  useEffect(() => {
    if (!socket) return;
    syncClock();
    timerRef.current = setInterval(syncClock, SYNC_INTERVAL_MS);
    socket.on('time:server-tick', ({ serverNow }: { serverNow: number }) => {
      setClockOffset(serverNow - Date.now());
    });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      socket.off('time:server-tick');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);
}