import http from "k6/http";
import { SioClient } from "./sio.js";

/**
 * Create rooms through POST /demo/create (no login needed).
 * generateRoomId() on the server has only ~13k possible ids, so at a few hundred rooms
 * collisions are likely; a collision silently overwrites the other room's metadata.
 * We detect duplicates and ask for another room.
 */
export function createRooms(baseUrl, count, maxParticipants) {
  const rooms = [];
  const seen = new Set();
  let attempts = 0;
  while (rooms.length < count) {
    if (++attempts > count * 20 + 50) throw new Error("Could not create enough unique rooms");
    const res = http.post(
      `${baseUrl}/demo/create`,
      JSON.stringify({
        displayName: `perf-host-${rooms.length}`,
        name: `perf-room-${rooms.length}`,
        mode: "conference",
        maxParticipants,
      }),
      { headers: { "Content-Type": "application/json" }, tags: { name: "demo_create" } },
    );
    if (res.status !== 201) {
      throw new Error(`POST /demo/create -> ${res.status} ${res.body}. Is the server up at ${baseUrl}?`);
    }
    const j = res.json();
    if (seen.has(j.roomId)) continue;
    seen.add(j.roomId);
    rooms.push({ roomId: j.roomId, hostId: j.userId });
  }
  return rooms;
}

/** Ends every room as its host (deletes the Redis keys and closes the router). */
export async function endRooms(baseUrl, rooms) {
  const BATCH = 20;
  let ended = 0;
  for (let i = 0; i < rooms.length; i += BATCH) {
    await Promise.all(
      rooms.slice(i, i + BATCH).map(async (r) => {
        const s = new SioClient(baseUrl, { roomId: r.roomId, demoUserId: r.hostId, displayName: "perf-cleanup" }, { ackTimeoutMs: 5000, connectTimeoutMs: 5000 });
        try {
          await s.connect();
          const j = await s.request("room:join", {});
          if (j && !j.error) {
            await s.request("room:end");
            ended++;
          }
        } catch (_) {
          /* best effort */
        } finally {
          s.close();
        }
      }),
    );
  }
  return ended;
}
