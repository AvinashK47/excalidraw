"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [roomId, setRoomId] = useState("");
  const router = useRouter();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) return;
    router.push(`/room/${encodeURIComponent(roomId.trim().toLowerCase())}`);
  };

  const handleLaunchQuickDemo = () => {
    const randomSlug = `sketch-${Math.random().toString(36).substring(2, 8)}`;
    router.push(`/room/${randomSlug}`);
  };

  return (
    <main className="min-h-screen bg-[#080a0f] text-zinc-100 flex flex-col items-center justify-between p-6 sm:p-12 font-sans selection:bg-cyan-500 selection:text-zinc-950">
      {/* Top Brand Bar */}
      <header className="w-full max-w-4xl flex items-center justify-between py-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center font-black text-white shadow-lg shadow-cyan-500/20 text-lg">
            ⚡
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              SyncBoard <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">REALTIME</span>
            </h1>
            <p className="text-xs text-zinc-400">Collaborative Vector Whiteboard & Architecture Canvas</p>
          </div>
        </div>

        <a
          href="https://github.com/AvinashK47"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-zinc-400 hover:text-cyan-400 transition-colors"
        >
          @AvinashK47
        </a>
      </header>

      {/* Hero & Quick Entry Hub */}
      <div className="w-full max-w-xl my-auto py-12 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400 mb-6 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          WebSocket Mesh • PostgreSQL Shape Persistence
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100 mb-4">
          Infinite Canvas for <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">Instant Collaboration</span>
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mb-8 leading-relaxed">
          Sketch system architectures, brainstorm user flows, and draw with teammates simultaneously with sub-50ms peer synchronization.
        </p>

        {/* Room Join Form */}
        <div className="w-full p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleJoin} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room name (e.g. system-design)"
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-950/80 border border-zinc-800 focus:border-cyan-500 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!roomId.trim()}
              className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 text-sm font-semibold transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
            >
              Enter Room
            </button>
          </form>

          <div className="flex items-center justify-between pt-4 mt-4 border-t border-zinc-800/60 text-xs text-zinc-400">
            <span>Don&apos;t have a room yet?</span>
            <button
              onClick={handleLaunchQuickDemo}
              className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer transition-colors"
            >
              + Create Instant Canvas →
            </button>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-3 gap-4 w-full mt-10 text-left">
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-850">
            <div className="text-cyan-400 text-sm font-bold mb-1">⚡ Low Latency</div>
            <div className="text-[11px] text-zinc-400">Bi-directional WS broadcast with live cursor presence</div>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-850">
            <div className="text-emerald-400 text-sm font-bold mb-1">💾 Auto-Saved</div>
            <div className="text-[11px] text-zinc-400">Shapes persisted to PostgreSQL for instant reload</div>
          </div>
          <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-850">
            <div className="text-indigo-400 text-sm font-bold mb-1">🖼 Export Ready</div>
            <div className="text-[11px] text-zinc-400">One-click PNG image export with dark-mode canvas</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-4xl py-4 flex items-center justify-between text-xs text-zinc-400 border-t border-zinc-800/80 font-mono">
        <span>Collaborative Whiteboard • Turborepo Microservices</span>
        <span>Next.js 15 • Express • WS • Prisma</span>
      </footer>
    </main>
  );
}
