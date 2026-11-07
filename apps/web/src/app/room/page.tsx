"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RoomIndexPage() {
  const [roomSlug, setRoomSlug] = useState("");
  const router = useRouter();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomSlug.trim()) return;
    router.push(`/room/${encodeURIComponent(roomSlug.trim().toLowerCase())}`);
  };

  const handleQuickDemo = () => {
    const slug = `sketch-${Math.random().toString(36).substring(2, 8)}`;
    router.push(`/room/${slug}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0e1117] text-zinc-100 p-4 font-sans selection:bg-cyan-500 selection:text-zinc-950">
      <div className="w-full max-w-md p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2 mb-4">
          <Link
            href="/"
            className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs"
          >
            ⚡
          </Link>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            SyncBoard Rooms
          </span>
        </div>

        <h1 className="text-xl font-bold tracking-tight mb-1 text-zinc-100">
          Join or Create a Canvas
        </h1>
        <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
          Enter an existing room name to collaborate with your team, or start a new shared workspace.
        </p>

        <form onSubmit={handleJoin} className="flex flex-col gap-3">
          <input
            type="text"
            value={roomSlug}
            onChange={(e) => setRoomSlug(e.target.value)}
            placeholder="e.g. system-architecture"
            className="w-full px-4 py-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800 focus:border-cyan-500/80 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all font-mono text-xs"
          />
          <button
            type="submit"
            disabled={!roomSlug.trim()}
            className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-semibold text-xs transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
          >
            Enter Room →
          </button>
        </form>

        <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-800/60 text-xs text-zinc-400">
          <span>Need a quick scratchpad?</span>
          <button
            onClick={handleQuickDemo}
            className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer transition-colors"
          >
            + Instant Canvas
          </button>
        </div>
      </div>
    </div>
  );
}
