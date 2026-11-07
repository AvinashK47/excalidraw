"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RoomIndexPage() {
  const [roomSlug, setRoomSlug] = useState("");
  const router = useRouter();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomSlug.trim()) return;
    router.push(`/room/${roomSlug.trim()}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 p-4">
      <div className="w-full max-w-md p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl">
        <h1 className="text-xl font-bold mb-1">Collaborative Whiteboard</h1>
        <p className="text-xs text-zinc-400 mb-6">Enter a room name to join or create a shared canvas.</p>

        <form onSubmit={handleJoin} className="flex flex-col gap-3">
          <input
            type="text"
            value={roomSlug}
            onChange={(e) => setRoomSlug(e.target.value)}
            placeholder="e.g. team-brainstorm"
            className="w-full px-4 py-2.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!roomSlug.trim()}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 font-medium text-sm transition-all"
          >
            Enter Room
          </button>
        </form>
      </div>
    </div>
  );
}
