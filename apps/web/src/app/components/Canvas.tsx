"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";
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

export type FillStyle = "none" | "tint" | "solid";
export type StrokeStyle = "solid" | "dashed";

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
  fillStyle?: FillStyle;
  strokeStyle?: StrokeStyle;
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
  { name: "Chalk White", hex: "#f8fafc" },
  { name: "Cyber Cyan", hex: "#06b6d4" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Sunset Amber", hex: "#f59e0b" },
  { name: "Coral Rose", hex: "#f43f5e" },
  { name: "Violet", hex: "#a855f7" },
  { name: "Cobalt Blue", hex: "#3b82f6" },
  { name: "Muted Slate", hex: "#64748b" },
];

const PEER_COLORS = [
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#a855f7",
  "#3b82f6",
  "#ec4899",
];

export default function CollaborativeCanvas({ roomId, roomSlug }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [redoStack, setRedoStack] = useState<Shape[][]>([]);

  // Selected tool & styles
  const [tool, setTool] = useState<ToolType>("rect");
  const [strokeColor, setStrokeColor] = useState<string>("#06b6d4");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [fillStyle, setFillStyle] = useState<FillStyle>("none");
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>("solid");

  // Selection & drag state
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [isDraggingShape, setIsDraggingShape] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);

  // Viewport zoom & pan
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Network & Peers
  const [isConnected, setIsConnected] = useState(false);
  const [peerCursors, setPeerCursors] = useState<{ [id: string]: PeerCursor }>({});
  const [showShareToast, setShowShareToast] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const userNameRef = useRef<string>(`Artist_${Math.floor(100 + Math.random() * 900)}`);

  // Load Existing Shape History from HTTP API
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await axios.get(`${BACKEND_URL}/chats/${roomId}`);
        if (res.data?.messages) {
          const loadedShapes: Shape[] = [];
          for (const msg of res.data.messages) {
            try {
              const shapeData = JSON.parse(msg.message);
              if (shapeData && shapeData.id) {
                loadedShapes.push(shapeData);
              }
            } catch {
              // Ignore non-shape message
            }
          }
          if (loadedShapes.length > 0) {
            setShapes((prev) => {
              const existingIds = new Set(prev.map((s) => s.id));
              const fresh = loadedShapes.filter((s) => !existingIds.has(s.id));
              return [...prev, ...fresh];
            });
          }
        }
      } catch (err) {
        console.warn("Could not load canvas shape history:", err);
      }
    }
    loadHistory();
  }, [roomId]);

  // WebSocket Connection with In-Memory Init Shapes Catchup
  useEffect(() => {
    const ws = new WebSocket(
      `${WS_BACKEND_URL}?token=guest&name=${encodeURIComponent(userNameRef.current)}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(
        JSON.stringify({
          type: "join_room",
          roomId: String(roomId),
          slug: roomSlug,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 1. Initial bulk shapes from server on join
        if (data.type === "init_shapes" && Array.isArray(data.shapes)) {
          setShapes((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            const fresh = data.shapes.filter((s: Shape) => !existingIds.has(s.id));
            return [...prev, ...fresh];
          });
        }

        // 2. Incoming single shape drawing from peer
        if (data.type === "chat_message") {
          try {
            const incomingShape = JSON.parse(data.message);
            if (incomingShape && incomingShape.id) {
              setShapes((prev) => {
                const idx = prev.findIndex((s) => s.id === incomingShape.id);
                if (idx !== -1) {
                  const updated = [...prev];
                  updated[idx] = incomingShape;
                  return updated;
                }
                return [...prev, incomingShape];
              });
            }
          } catch {
            // Ignore non-JSON
          }
        }

        // 3. Peer cursor movement
        if (data.type === "cursor_presence") {
          const color =
            PEER_COLORS[
              Math.abs(
                data.userId
                  .split("")
                  .reduce((a: number, b: string) => a + b.charCodeAt(0), 0)
              ) % PEER_COLORS.length
            ];
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

        // 4. Remote canvas cleared
        if (data.type === "canvas_cleared") {
          setShapes([]);
          setSelectedShapeId(null);
        }
      } catch (err) {
        console.error("WS message parse error:", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [roomId, roomSlug]);

  // Periodic prune of inactive peer cursors (older than 5s)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPeerCursors((prev) => {
        const next: { [id: string]: PeerCursor } = {};
        for (const [id, cursor] of Object.entries(prev)) {
          if (now - cursor.lastSeen < 5000) {
            next[id] = cursor;
          }
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Broadcast Shape Mutation
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

  // Broadcast Cursor Location
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

  // Spacebar tracking for Pan
  const isSpacePressedRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        isSpacePressedRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpacePressedRef.current = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Master Canvas Rendering Engine
  const renderAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Apply Viewport Pan and Zoom
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Subtle Architectural Dot Grid
    const gridSize = 28;
    const startX = -pan.x / zoom;
    const startY = -pan.y / zoom;
    const endX = (canvas.width - pan.x) / zoom;
    const endY = (canvas.height - pan.y) / zoom;

    ctx.fillStyle = "rgba(71, 85, 105, 0.25)";
    for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
      for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
        ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }

    // Draw single shape
    const drawShape = (s: Shape, isSelected: boolean) => {
      ctx.save();
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (s.strokeStyle === "dashed") {
        ctx.setLineDash([8, 6]);
      } else {
        ctx.setLineDash([]);
      }

      // Fill setup
      if (s.fillStyle === "solid") {
        ctx.fillStyle = s.stroke;
      } else if (s.fillStyle === "tint") {
        // Hex to RGBA with 15% opacity
        ctx.fillStyle = `${s.stroke}24`;
      } else {
        ctx.fillStyle = "transparent";
      }

      if (s.type === "rect") {
        const w = s.width || 0;
        const h = s.height || 0;
        if (s.fillStyle !== "none") {
          ctx.fillRect(s.x, s.y, w, h);
        }
        ctx.strokeRect(s.x, s.y, w, h);
      } else if (s.type === "circle") {
        const radiusX = Math.abs((s.width || 0) / 2);
        const radiusY = Math.abs((s.height || 0) / 2);
        const centerX = s.x + (s.width || 0) / 2;
        const centerY = s.y + (s.height || 0) / 2;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        if (s.fillStyle !== "none") ctx.fill();
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
        if (s.fillStyle !== "none") ctx.fill();
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
        const headLength = 16;
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
        ctx.beginPath();
        const p0 = s.points[0];
        if (p0) {
          ctx.moveTo(p0.x, p0.y);
          // Smooth midpoint Bézier curve
          for (let i = 1; i < s.points.length - 1; i++) {
            const pi = s.points[i];
            const pNext = s.points[i + 1];
            if (pi && pNext) {
              const midX = (pi.x + pNext.x) / 2;
              const midY = (pi.y + pNext.y) / 2;
              ctx.quadraticCurveTo(pi.x, pi.y, midX, midY);
            }
          }
          const pLast = s.points[s.points.length - 1];
          if (pLast) ctx.lineTo(pLast.x, pLast.y);
          ctx.stroke();
        }
      } else if (s.type === "text" && s.text) {
        ctx.font = `500 ${s.strokeWidth * 5 + 14}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = s.stroke;
        ctx.fillText(s.text, s.x, s.y);
      }

      // Active Selection Halo
      if (isSelected) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        const pad = 6;
        const w = s.width || 60;
        const h = s.height || 40;
        ctx.strokeRect(s.x - pad, s.y - pad, w + pad * 2, h + pad * 2);
      }

      ctx.restore();
    };

    // Draw all confirmed shapes
    shapes.forEach((s) => drawShape(s, s.id === selectedShapeId));

    // Draw active drawing shape preview
    if (currentShape) {
      drawShape(currentShape, false);
    }

    ctx.restore();
  }, [shapes, currentShape, selectedShapeId, zoom, pan]);

  useEffect(() => {
    renderAll();
  }, [renderAll]);

  // Coordinate Conversion (Screen to Canvas Space)
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    return {
      x: (clientX - pan.x) / zoom,
      y: (clientY - pan.y) / zoom,
    };
  };

  // Hit-testing for selection / eraser
  const findShapeAt = (x: number, y: number): Shape | null => {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (!s) continue;
      const minX = Math.min(s.x, s.x + (s.width || 0)) - 10;
      const maxX = Math.max(s.x, s.x + (s.width || 0)) + 10;
      const minY = Math.min(s.y, s.y + (s.height || 0)) - 10;
      const maxY = Math.max(s.y, s.y + (s.height || 0)) + 10;

      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        return s;
      }
    }
    return null;
  };

  // Pointer Events
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);

    // Spacebar or Middle Click -> Pan Viewport
    if (e.button === 1 || isSpacePressedRef.current) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    if (tool === "select") {
      const hit = findShapeAt(coords.x, coords.y);
      if (hit) {
        setSelectedShapeId(hit.id);
        setIsDraggingShape(true);
        dragStartRef.current = { x: coords.x - hit.x, y: coords.y - hit.y };
      } else {
        setSelectedShapeId(null);
      }
      return;
    }

    if (tool === "eraser") {
      const hit = findShapeAt(coords.x, coords.y);
      if (hit) {
        setUndoStack((prev) => [...prev, shapes]);
        setRedoStack([]);
        setShapes((prev) => prev.filter((s) => s.id !== hit.id));
      }
      return;
    }

    if (tool === "text") {
      const text = prompt("Enter text label:");
      if (text && text.trim()) {
        const textShape: Shape = {
          id: crypto.randomUUID(),
          type: "text",
          x: coords.x,
          y: coords.y,
          text: text.trim(),
          stroke: strokeColor,
          strokeWidth,
        };
        setUndoStack((prev) => [...prev, shapes]);
        setRedoStack([]);
        setShapes((prev) => [...prev, textShape]);
        broadcastShape(textShape);
      }
      return;
    }

    // Start drawing shape
    setIsDrawing(true);
    const newShape: Shape = {
      id: crypto.randomUUID(),
      type: tool,
      x: coords.x,
      y: coords.y,
      width: 0,
      height: 0,
      x2: coords.x,
      y2: coords.y,
      points: tool === "pencil" ? [{ x: coords.x, y: coords.y }] : undefined,
      stroke: strokeColor,
      strokeWidth,
      fillStyle,
      strokeStyle,
    };
    setCurrentShape(newShape);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    broadcastCursor(coords.x, coords.y);

    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (isDraggingShape && selectedShapeId) {
      setShapes((prev) =>
        prev.map((s) => {
          if (s.id === selectedShapeId) {
            const updated = {
              ...s,
              x: coords.x - dragStartRef.current.x,
              y: coords.y - dragStartRef.current.y,
            };
            broadcastShape(updated);
            return updated;
          }
          return s;
        })
      );
      return;
    }

    if (!isDrawing || !currentShape) return;

    if (tool === "pencil") {
      setCurrentShape((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          points: [...(prev.points || []), { x: coords.x, y: coords.y }],
        };
      });
    } else if (tool === "line" || tool === "arrow") {
      setCurrentShape((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          x2: coords.x,
          y2: coords.y,
        };
      });
    } else {
      setCurrentShape((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          width: coords.x - prev.x,
          height: coords.y - prev.y,
        };
      });
    }
  };

  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDraggingShape) {
      setIsDraggingShape(false);
      return;
    }

    if (!isDrawing || !currentShape) {
      setIsDrawing(false);
      return;
    }

    setIsDrawing(false);
    const finalized = { ...currentShape };
    setCurrentShape(null);

    setUndoStack((prev) => [...prev, shapes]);
    setRedoStack([]);
    setShapes((prev) => [...prev, finalized]);
    broadcastShape(finalized);
  };

  // Keyboard Shortcuts (Undo, Redo, Delete, Tool Selection)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Delete selected shape
      if ((e.key === "Delete" || e.key === "Backspace") && selectedShapeId) {
        e.preventDefault();
        setUndoStack((prev) => [...prev, shapes]);
        setRedoStack([]);
        setShapes((prev) => prev.filter((s) => s.id !== selectedShapeId));
        setSelectedShapeId(null);
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Tool Switching
      switch (e.key.toLowerCase()) {
        case "v":
          setTool("select");
          break;
        case "r":
          setTool("rect");
          break;
        case "o":
          setTool("circle");
          break;
        case "d":
          setTool("diamond");
          break;
        case "a":
          setTool("arrow");
          break;
        case "l":
          setTool("line");
          break;
        case "p":
          setTool("pencil");
          break;
        case "t":
          setTool("text");
          break;
        case "e":
          setTool("eraser");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

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
  const confirmClear = () => {
    setUndoStack((prev) => [...prev, shapes]);
    setRedoStack([]);
    setShapes([]);
    setSelectedShapeId(null);
    setShowClearModal(false);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: "clear_canvas", roomId: String(roomId) })
      );
    }
  };

  // Zoom Controls
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.15, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.15, 0.4));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Export to PNG Image
  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `syncboard-${roomSlug}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // Share URL Link
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2400);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a0c12] text-zinc-100 select-none font-sans">
      {/* Top Header Bar */}
      <header className="absolute top-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        {/* Left: Brand Identity & Room Slug Pill */}
        <div className="flex items-center gap-2.5 pointer-events-auto">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl backdrop-blur-md hover:border-zinc-700 transition-colors"
          >
            <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white text-[11px]">
              ⚡
            </div>
            <span className="text-xs font-semibold tracking-tight text-zinc-100">SyncBoard</span>
          </Link>

          {/* Room Slug Pill */}
          <button
            onClick={handleShare}
            title="Click to copy room link"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl backdrop-blur-md hover:border-cyan-500/50 transition-all cursor-pointer group"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span className="text-xs font-mono text-zinc-300 group-hover:text-cyan-300">
              {roomSlug}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {showShareToast ? "✓ Link Copied" : "🔗"}
            </span>
          </button>
        </div>

        {/* Right: Peer Presence & Session Actions */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Active Peers Avatar Deck */}
          <div className="hidden sm:flex items-center -space-x-1 px-2.5 py-1 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl backdrop-blur-md">
            {Object.values(peerCursors).slice(0, 4).map((p) => (
              <div
                key={p.userId}
                title={p.name}
                className="w-5 h-5 rounded-full border border-zinc-900 flex items-center justify-center text-[9px] font-bold text-zinc-950 font-mono shadow-sm"
                style={{ backgroundColor: p.color }}
              >
                {p.name.slice(0, 2).toUpperCase()}
              </div>
            ))}
            <span className="text-[10px] font-mono text-zinc-400 pl-2">
              {Object.keys(peerCursors).length + 1} live
            </span>
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl backdrop-blur-md">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded-lg text-xs text-zinc-400 hover:text-white disabled:text-zinc-650 transition-colors"
            >
              ↶
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Y)"
              className="p-1.5 rounded-lg text-xs text-zinc-400 hover:text-white disabled:text-zinc-650 transition-colors"
            >
              ↷
            </button>
          </div>

          {/* Zoom Deck */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl backdrop-blur-md text-xs font-mono">
            <button
              onClick={handleZoomOut}
              className="text-zinc-400 hover:text-zinc-100 px-1 transition-colors"
            >
              -
            </button>
            <button
              onClick={handleResetZoom}
              title="Reset Zoom"
              className="text-[11px] text-zinc-300 hover:text-cyan-400 px-1 font-medium"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              className="text-zinc-400 hover:text-zinc-100 px-1 transition-colors"
            >
              +
            </button>
          </div>

          {/* Clear Canvas */}
          <button
            onClick={() => setShowClearModal(true)}
            title="Clear Canvas"
            className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800/80 hover:border-rose-500/50 text-zinc-400 hover:text-rose-400 transition-colors shadow-xl backdrop-blur-md"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* Export PNG */}
          <button
            onClick={handleExport}
            className="px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors shadow-xl backdrop-blur-md"
          >
            Export
          </button>

          {/* Share Pill */}
          <button
            onClick={handleShare}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-semibold transition-all shadow-md shadow-cyan-500/20"
          >
            Share
          </button>
        </div>
      </header>

      {/* Primary Floating Tool Dock (Top-Center) */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
        <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-zinc-900/95 border border-zinc-800/90 shadow-2xl backdrop-blur-md">
          {[
            {
              id: "select",
              label: "Select (V)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
              ),
            },
            {
              id: "rect",
              label: "Rectangle (R)",
              svg: (
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
              ),
            },
            {
              id: "circle",
              label: "Circle (O)",
              svg: (
                <circle cx="12" cy="12" r="9" strokeWidth={2} />
              ),
            },
            {
              id: "diamond",
              label: "Diamond (D)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l10 10-10 10L2 12z" />
              ),
            },
            {
              id: "arrow",
              label: "Arrow (A)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7" />
              ),
            },
            {
              id: "line",
              label: "Line (L)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20L20 4" />
              ),
            },
            {
              id: "pencil",
              label: "Pen (P)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              ),
            },
            {
              id: "text",
              label: "Text (T)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M12 6v14" />
              ),
            },
            {
              id: "eraser",
              label: "Eraser (E)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11l-8-8-8 8m16 0l-8 8m8-8H3m8 8l5 5h5" />
              ),
            },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTool(t.id as ToolType);
                if (t.id !== "select") setSelectedShapeId(null);
              }}
              title={t.label}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative group ${
                tool === t.id
                  ? "bg-zinc-800 text-cyan-400 border border-cyan-500/40 shadow-md shadow-cyan-950 scale-105"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {t.svg}
              </svg>
            </button>
          ))}
        </div>

        {/* Secondary Tool Properties Ribbon */}
        {tool !== "eraser" && tool !== "select" && (
          <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl backdrop-blur-md text-xs">
            {/* Color Swatches */}
            <div className="flex items-center gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setStrokeColor(c.hex)}
                  title={c.name}
                  style={{ backgroundColor: c.hex }}
                  className={`w-4 h-4 rounded-full transition-all cursor-pointer ${
                    strokeColor === c.hex
                      ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-110 shadow-sm"
                      : "opacity-80 hover:opacity-100"
                  }`}
                />
              ))}
            </div>

            <div className="w-[1px] h-3.5 bg-zinc-800" />

            {/* Stroke Thickness */}
            <div className="flex items-center gap-1">
              {[
                { w: 2, label: "Fine" },
                { w: 4, label: "Medium" },
                { w: 8, label: "Bold" },
              ].map((item) => (
                <button
                  key={item.w}
                  onClick={() => setStrokeWidth(item.w)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                    strokeWidth === item.w
                      ? "bg-zinc-800 text-cyan-300 border border-zinc-700 font-semibold"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="w-[1px] h-3.5 bg-zinc-800" />

            {/* Fill Mode */}
            {tool !== "line" && tool !== "arrow" && tool !== "pencil" && tool !== "text" && (
              <div className="flex items-center gap-1">
                {(["none", "tint", "solid"] as FillStyle[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFillStyle(f)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-all ${
                      fillStyle === f
                        ? "bg-zinc-800 text-cyan-300 border border-zinc-700 font-semibold"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            {/* Line Dash */}
            {tool !== "text" && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    setStrokeStyle((prev) => (prev === "solid" ? "dashed" : "solid"))
                  }
                  title="Toggle Dashed Line"
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all ${
                    strokeStyle === "dashed"
                      ? "bg-zinc-800 text-cyan-300 border border-zinc-700 font-semibold"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {strokeStyle === "dashed" ? "- - -" : "———"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Peer Cursors */}
      {Object.values(peerCursors).map((peer) => (
        <div
          key={peer.userId}
          className="absolute pointer-events-none z-10 transition-all duration-75 ease-out"
          style={{
            transform: `translate(${peer.x * zoom + pan.x}px, ${peer.y * zoom + pan.y}px)`,
          }}
        >
          <svg
            className="w-4 h-4 drop-shadow-md"
            viewBox="0 0 24 24"
            fill={peer.color}
          >
            <path d="M0 0l7 20 3-7 7-3L0 0z" />
          </svg>
          <span
            className="ml-3 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium text-white shadow-md border border-black/20"
            style={{ backgroundColor: peer.color }}
          >
            {peer.name}
          </span>
        </div>
      ))}

      {/* Main Drawing Canvas Element */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`w-full h-full touch-none ${
          isPanning
            ? "cursor-grab active:cursor-grabbing"
            : tool === "select"
            ? "cursor-default"
            : "cursor-crosshair"
        }`}
      />

      {/* Bottom Status Bar */}
      <footer className="absolute bottom-3 left-4 right-4 z-20 flex items-center justify-between text-[11px] font-mono text-zinc-400 pointer-events-none">
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xl backdrop-blur-md pointer-events-auto">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span className="text-zinc-300">
              {isConnected ? "Sync Mesh Active" : "Reconnecting..."}
            </span>
          </span>
          <span className="text-zinc-600">•</span>
          <span>{shapes.length} {shapes.length === 1 ? "object" : "objects"}</span>
          <span className="text-zinc-600">•</span>
          <span className="text-cyan-400">
            {Object.keys(peerCursors).length + 1} online
          </span>
        </div>

        <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md pointer-events-auto">
          <span>[V] Select</span>
          <span>[R] Rect</span>
          <span>[O] Circle</span>
          <span>[P] Pen</span>
          <span>[Del] Delete</span>
          <span>[Ctrl+Z] Undo</span>
        </div>
      </footer>

      {/* Clear Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm p-5 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-100 mb-1">Clear entire whiteboard?</h3>
            <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
              This will remove all {shapes.length} shapes from this room for all connected peers. This action can be undone locally.
            </p>
            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-3 py-1.5 rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmClear}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors cursor-pointer"
              >
                Clear Canvas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
