"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import axios from "axios";
import { BACKEND_URL, WS_BACKEND_URL } from "../config";

export type ToolType =
  | "select"
  | "rect"
  | "circle"
  | "diamond"
  | "arrow"
  | "line"
  | "pencil"
  | "text"
  | "eraser";

export interface Shape {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  points?: { x: number; y: number }[];
  text?: string;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

interface PeerCursor {
  userId: string;
  name: string;
  x: number;
  y: number;
  color: string;
  lastSeen: number;
}

interface CanvasProps {
  roomId: number;
  roomSlug: string;
}

const PALETTE = [
  "#ffffff",
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#f43f5e", // Rose
  "#a855f7", // Purple
  "#3b82f6", // Blue
];

const PEER_COLORS = [
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#3b82f6",
];

export default function CollaborativeCanvas({ roomId, roomSlug }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [redoStack, setRedoStack] = useState<Shape[][]>([]);

  // Current drawing tool state
  const [tool, setTool] = useState<ToolType>("rect");
  const [strokeColor, setStrokeColor] = useState<string>("#06b6d4");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);

  // Network and Peers
  const [isConnected, setIsConnected] = useState(false);
  const [peerCursors, setPeerCursors] = useState<{ [id: string]: PeerCursor }>({});
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const userNameRef = useRef<string>(`Artist_${Math.floor(1000 + Math.random() * 9000)}`);

  // Load Shape History from HTTP API
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await axios.get(`${BACKEND_URL}/chats/${roomId}`);
        if (res.data?.messages) {
          const loadedShapes: Shape[] = [];
          for (const msg of res.data.messages) {
            try {
              const shapeData = JSON.parse(msg.message);
              if (shapeData && shapeData.type) {
                loadedShapes.push(shapeData);
              }
            } catch {
              // Ignore non-shape chat messages
            }
          }
          setShapes(loadedShapes);
        }
      } catch (err) {
        console.warn("Could not load canvas shape history:", err);
      }
    }
    loadHistory();
  }, [roomId]);

  // WebSocket Connection
  useEffect(() => {
    const ws = new WebSocket(
      `${WS_BACKEND_URL}?token=guest&name=${encodeURIComponent(userNameRef.current)}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "join_room", roomId: String(roomId) }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Receive shape from peer
        if (data.type === "chat_message") {
          try {
            const incomingShape = JSON.parse(data.message);
            if (incomingShape && incomingShape.type) {
              setShapes((prev) => {
                if (prev.some((s) => s.id === incomingShape.id)) return prev;
                return [...prev, incomingShape];
              });
            }
          } catch {
            // Ignore non-JSON
          }
        }

        // Receive cursor movement
        if (data.type === "cursor_presence") {
          const color =
            PEER_COLORS[Math.abs(data.userId.split("").reduce((a: number, b: string) => a + b.charCodeAt(0), 0)) % PEER_COLORS.length];
          setPeerCursors((prev) => ({
            ...prev,
            [data.userId]: {
              userId: data.userId,
              name: data.name || "Peer",
              x: data.x,
              y: data.y,
              color,
              lastSeen: Date.now(),
            },
          }));
        }

        // Canvas cleared
        if (data.type === "canvas_cleared") {
          setShapes([]);
        }
      } catch (err) {
        console.error("Error handling WS message:", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [roomId]);

  // Clean stale peer cursors
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPeerCursors((prev) => {
        const next: { [id: string]: PeerCursor } = {};
        for (const [id, cursor] of Object.entries(prev)) {
          if (now - cursor.lastSeen < 6000) {
            next[id] = cursor;
          }
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Broadcast Shape
  const broadcastShape = useCallback(
    (shape: Shape) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "chat",
            roomId: roomId,
            message: JSON.stringify(shape),
          })
        );
      }
    },
    [roomId]
  );

  // Broadcast Cursor
  const broadcastCursor = useCallback(
    (x: number, y: number) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "cursor",
            roomId: String(roomId),
            x,
            y,
          })
        );
      }
    },
    [roomId]
  );

  // Canvas Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      renderAll();
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  // Render Engine
  const renderAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid background
    ctx.strokeStyle = "rgba(39, 39, 42, 0.4)";
    ctx.lineWidth = 1;
    const gridSize = 32;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Helper to draw single shape
    const drawShape = (s: Shape) => {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (s.type === "rect") {
        ctx.strokeRect(s.x, s.y, s.width || 0, s.height || 0);
      } else if (s.type === "circle") {
        const radiusX = Math.abs((s.width || 0) / 2);
        const radiusY = Math.abs((s.height || 0) / 2);
        const centerX = s.x + (s.width || 0) / 2;
        const centerY = s.y + (s.height || 0) / 2;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.type === "diamond") {
        const w = s.width || 0;
        const h = s.height || 0;
        ctx.beginPath();
        ctx.moveTo(s.x + w / 2, s.y);
        ctx.lineTo(s.x + w, s.y + h / 2);
        ctx.lineTo(s.x + w / 2, s.y + h);
        ctx.lineTo(s.x, s.y + h / 2);
        ctx.closePath();
        ctx.stroke();
      } else if (s.type === "line") {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x2 || s.x, s.y2 || s.y);
        ctx.stroke();
      } else if (s.type === "arrow") {
        const x1 = s.x;
        const y1 = s.y;
        const x2 = s.x2 || s.x;
        const y2 = s.y2 || s.y;
        const headLength = 14;
        const angle = Math.atan2(y2 - y1, x2 - x1);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLength * Math.cos(angle - Math.PI / 6),
          y2 - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLength * Math.cos(angle + Math.PI / 6),
          y2 - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      } else if (s.type === "pencil" && s.points && s.points.length > 1) {
        const first = s.points[0];
        if (first) {
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < s.points.length; i++) {
            const pt = s.points[i];
            if (pt) {
              ctx.lineTo(pt.x, pt.y);
            }
          }
          ctx.stroke();
        }
      } else if (s.type === "text" && s.text) {
        ctx.font = `${s.strokeWidth * 6 + 12}px sans-serif`;
        ctx.fillStyle = s.stroke;
        ctx.fillText(s.text, s.x, s.y);
      }
    };

    // Draw all confirmed shapes
    shapes.forEach(drawShape);

    // Draw current in-progress shape
    if (currentShape) {
      drawShape(currentShape);
    }
  }, [shapes, currentShape]);

  useEffect(() => {
    renderAll();
  }, [renderAll]);

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === "eraser") {
      // Find shape near click to remove
      setShapes((prev) => {
        const next = prev.filter(
          (s) =>
            !(
              x >= s.x - 10 &&
              x <= s.x + (s.width || 30) + 10 &&
              y >= s.y - 10 &&
              y <= s.y + (s.height || 30) + 10
            )
        );
        return next;
      });
      return;
    }

    if (tool === "text") {
      const text = prompt("Enter text label:");
      if (text) {
        const textShape: Shape = {
          id: crypto.randomUUID(),
          type: "text",
          x,
          y,
          text,
          stroke: strokeColor,
          strokeWidth,
        };
        setShapes((prev) => [...prev, textShape]);
        broadcastShape(textShape);
      }
      return;
    }

    setIsDrawing(true);
    const newShape: Shape = {
      id: crypto.randomUUID(),
      type: tool,
      x,
      y,
      width: 0,
      height: 0,
      x2: x,
      y2: y,
      points: tool === "pencil" ? [{ x, y }] : undefined,
      stroke: strokeColor,
      strokeWidth,
    };
    setCurrentShape(newShape);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Broadcast cursor position
    broadcastCursor(x, y);

    if (!isDrawing || !currentShape) return;

    if (tool === "pencil") {
      setCurrentShape((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          points: [...(prev.points || []), { x, y }],
        };
      });
    } else if (tool === "line" || tool === "arrow") {
      setCurrentShape((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          x2: x,
          y2: y,
        };
      });
    } else {
      setCurrentShape((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          width: x - prev.x,
          height: y - prev.y,
        };
      });
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing || !currentShape) {
      setIsDrawing(false);
      return;
    }

    setIsDrawing(false);
    const finalized = { ...currentShape };
    setCurrentShape(null);

    // Save previous state to undo stack
    setUndoStack((prev) => [...prev, shapes]);
    setRedoStack([]);

    setShapes((prev) => [...prev, finalized]);
    broadcastShape(finalized);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prevShapes = undoStack[undoStack.length - 1];
    if (!prevShapes) return;
    setRedoStack((prev) => [...prev, shapes]);
    setShapes(prevShapes);
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextShapes = redoStack[redoStack.length - 1];
    if (!nextShapes) return;
    setUndoStack((prev) => [...prev, shapes]);
    setShapes(nextShapes);
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
  };

  // Clear Canvas
  const handleClear = () => {
    if (confirm("Are you sure you want to clear the entire whiteboard?")) {
      setUndoStack((prev) => [...prev, shapes]);
      setShapes([]);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: "clear_canvas", roomId: String(roomId) })
        );
      }
    }
  };

  // Export to PNG
  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `whiteboard-${roomSlug}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // Share URL
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0c10] select-none">
      {/* Top Floating App Bar & Tool Dock */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-2xl backdrop-blur-md">
          {/* Room Title */}
          <div className="px-3 py-1 flex items-center gap-2 border-r border-zinc-800">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span className="text-xs font-semibold text-zinc-200">
              {roomSlug}
            </span>
          </div>

          {/* Tools */}
          <div className="flex items-center gap-1 px-1">
            {[
              { id: "select", icon: "↖", label: "Pan" },
              { id: "rect", icon: "▢", label: "Rectangle" },
              { id: "circle", icon: "◯", label: "Circle" },
              { id: "diamond", icon: "◇", label: "Diamond" },
              { id: "arrow", icon: "→", label: "Arrow" },
              { id: "line", icon: "—", label: "Line" },
              { id: "pencil", icon: "✎", label: "Pencil" },
              { id: "text", icon: "T", label: "Text" },
              { id: "eraser", icon: "⌫", label: "Eraser" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id as ToolType)}
                title={t.label}
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-medium transition-all cursor-pointer ${
                  tool === t.id
                    ? "bg-cyan-500 text-zinc-950 font-bold shadow-md shadow-cyan-500/20 scale-105"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80"
                }`}
              >
                {t.icon}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="w-[1px] h-6 bg-zinc-800 mx-1" />

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo"
              className="p-1.5 rounded-lg text-xs text-zinc-400 hover:text-white disabled:text-zinc-600 transition-colors"
            >
              ↶
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Redo"
              className="p-1.5 rounded-lg text-xs text-zinc-400 hover:text-white disabled:text-zinc-600 transition-colors"
            >
              ↷
            </button>
            <button
              onClick={handleClear}
              title="Clear Canvas"
              className="p-1.5 rounded-lg text-xs text-zinc-400 hover:text-rose-400 transition-colors"
            >
              🗑
            </button>
            <button
              onClick={handleExport}
              title="Export as PNG"
              className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono transition-colors"
            >
              Export
            </button>
            <button
              onClick={handleShare}
              className="px-2.5 py-1 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-semibold transition-all shadow-md shadow-cyan-500/20"
            >
              {copied ? "✓ Copied" : "Share"}
            </button>
          </div>
        </div>

        {/* Floating Styling Palette Bar */}
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-850 shadow-lg backdrop-blur-sm text-xs">
          {/* Colors */}
          <div className="flex items-center gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setStrokeColor(c)}
                style={{ backgroundColor: c }}
                className={`w-4 h-4 rounded-full transition-all cursor-pointer ${
                  strokeColor === c
                    ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110"
                    : "opacity-80 hover:opacity-100"
                }`}
              />
            ))}
          </div>

          <div className="w-[1px] h-3.5 bg-zinc-800" />

          {/* Stroke Width */}
          <div className="flex items-center gap-1.5">
            {[2, 4, 8].map((w) => (
              <button
                key={w}
                onClick={() => setStrokeWidth(w)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                  strokeWidth === w
                    ? "bg-zinc-700 text-cyan-300 font-bold"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {w}px
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Peer Cursors Overlay */}
      {Object.values(peerCursors).map((peer) => (
        <div
          key={peer.userId}
          className="absolute pointer-events-none z-10 transition-all duration-75 ease-out"
          style={{ transform: `translate(${peer.x}px, ${peer.y}px)` }}
        >
          <svg
            className="w-4 h-4 drop-shadow-md"
            viewBox="0 0 24 24"
            fill={peer.color}
          >
            <path d="M0 0l7 20 3-7 7-3L0 0z" />
          </svg>
          <span
            className="ml-3 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-white shadow-sm"
            style={{ backgroundColor: peer.color }}
          >
            {peer.name}
          </span>
        </div>
      ))}

      {/* Main Drawing Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full h-full cursor-crosshair touch-none"
      />

      {/* Bottom Status Pill */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono text-zinc-400 backdrop-blur-sm">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isConnected ? "bg-emerald-400" : "bg-rose-500"
          }`}
        />
        <span>
          {isConnected
            ? `Sync Active • ${Object.keys(peerCursors).length} online`
            : "Reconnecting..."}
        </span>
      </div>
    </div>
  );
}
