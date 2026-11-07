"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import axios from "axios";
import { BACKEND_URL, WS_BACKEND_URL } from "../config";

export type ToolType =
  | "hand"
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
  { name: "Chalk", hex: "#ffffff" },
  { name: "Cyan", hex: "#38bdf8" },
  { name: "Emerald", hex: "#34d399" },
  { name: "Amber", hex: "#fbbf24" },
  { name: "Rose", hex: "#f87171" },
  { name: "Violet", hex: "#c084fc" },
  { name: "Slate", hex: "#94a3b8" },
  { name: "Charcoal", hex: "#334155" },
];

const PEER_COLORS = [
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#c084fc",
  "#818cf8",
];

export default function CollaborativeCanvas({ roomId, roomSlug }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [undoStack, setUndoStack] = useState<Shape[][]>([]);
  const [redoStack, setRedoStack] = useState<Shape[][]>([]);

  // Current Tool and Styling Properties
  const [tool, setTool] = useState<ToolType>("rect");
  const [strokeColor, setStrokeColor] = useState<string>("#38bdf8");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [fillStyle, setFillStyle] = useState<FillStyle>("none");
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>("solid");

  // Selection & Manipulation
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const isDraggingShapeRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Drawing in progress
  const isDrawingRef = useRef(false);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);

  // Viewport Pan & Zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isSpacePressedRef = useRef(false);

  // Network & Peers
  const [isConnected, setIsConnected] = useState(false);
  const [peerCursors, setPeerCursors] = useState<{ [id: string]: PeerCursor }>({});
  const [showShareToast, setShowShareToast] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const userNameRef = useRef<string>(`User_${Math.floor(100 + Math.random() * 900)}`);

  // 1. Initial Shapes Hydration via HTTP API
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await axios.get(`${BACKEND_URL}/chats/${roomId}`);
        if (res.data?.messages) {
          const loadedShapes: Shape[] = [];
          for (const msg of res.data.messages) {
            try {
              const parsed = JSON.parse(msg.message);
              if (parsed && parsed.id) {
                loadedShapes.push(parsed);
              }
            } catch {
              // Ignore
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

  // 2. WebSocket Real-Time Sync & Catch-Up Hydration
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

        // Immediate full shape history on room join
        if (data.type === "init_shapes" && Array.isArray(data.shapes)) {
          setShapes((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            const fresh = data.shapes.filter((s: Shape) => !existingIds.has(s.id));
            return [...prev, ...fresh];
          });
        }

        // Single shape drawn/updated by peer
        if (data.type === "chat_message") {
          try {
            const incoming = JSON.parse(data.message);
            if (incoming && incoming.id) {
              setShapes((prev) => {
                const idx = prev.findIndex((s) => s.id === incoming.id);
                if (idx !== -1) {
                  const updated = [...prev];
                  updated[idx] = incoming;
                  return updated;
                }
                return [...prev, incoming];
              });
            }
          } catch {
            // Ignore non-JSON
          }
        }

        // Live cursor presence
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

        // Canvas cleared remotely
        if (data.type === "canvas_cleared") {
          setShapes([]);
          setSelectedShapeId(null);
        }
      } catch (err) {
        console.error("WS event error:", err);
      }
    };

    ws.onclose = () => setIsConnected(false);

    return () => {
      ws.close();
    };
  }, [roomId, roomSlug]);

  // Prune idle peer cursors
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

  // Broadcast Cursor Position
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

  // 3. High-DPI Canvas Rendering Engine
  const renderAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // Reset transform & clear full physical buffer
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply DPI scaling first
    ctx.scale(dpr, dpr);

    // Apply Viewport Pan and Zoom
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Subtle Architectural Grid
    const gridSize = 24;
    const startX = -pan.x / zoom;
    const startY = -pan.y / zoom;
    const endX = (window.innerWidth - pan.x) / zoom;
    const endY = (window.innerHeight - pan.y) / zoom;

    ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
    for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
      for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
        ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }

    // Single shape renderer
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

      // Fill style
      if (s.fillStyle === "solid") {
        ctx.fillStyle = s.stroke;
      } else if (s.fillStyle === "tint") {
        ctx.fillStyle = `${s.stroke}24`; // 14% alpha
      } else {
        ctx.fillStyle = "transparent";
      }

      if (s.type === "rect") {
        const w = s.width || 0;
        const h = s.height || 0;
        if (s.fillStyle !== "none") ctx.fillRect(s.x, s.y, w, h);
        ctx.strokeRect(s.x, s.y, w, h);
      } else if (s.type === "circle") {
        const rx = Math.abs((s.width || 0) / 2);
        const ry = Math.abs((s.height || 0) / 2);
        const cx = s.x + (s.width || 0) / 2;
        const cy = s.y + (s.height || 0) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
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
        ctx.lineTo(s.x2 ?? s.x, s.y2 ?? s.y);
        ctx.stroke();
      } else if (s.type === "arrow") {
        const x1 = s.x;
        const y1 = s.y;
        const x2 = s.x2 ?? s.x;
        const y2 = s.y2 ?? s.y;
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
      } else if (s.type === "pencil" && s.points && s.points.length > 0) {
        ctx.beginPath();
        const first = s.points[0];
        if (first) {
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i < s.points.length - 1; i++) {
            const pi = s.points[i];
            const pNext = s.points[i + 1];
            if (pi && pNext) {
              const mx = (pi.x + pNext.x) / 2;
              const my = (pi.y + pNext.y) / 2;
              ctx.quadraticCurveTo(pi.x, pi.y, mx, my);
            }
          }
          const last = s.points[s.points.length - 1];
          if (last) ctx.lineTo(last.x, last.y);
          ctx.stroke();
        }
      } else if (s.type === "text" && s.text) {
        ctx.font = `500 ${s.strokeWidth * 4 + 14}px system-ui, sans-serif`;
        ctx.fillStyle = s.stroke;
        ctx.fillText(s.text, s.x, s.y);
      }

      // Subtle Selection Bounding Box
      if (isSelected) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        const pad = 6;
        const w = s.width || 40;
        const h = s.height || 30;
        ctx.strokeRect(s.x - pad, s.y - pad, w + pad * 2, h + pad * 2);

        // Corner handles
        ctx.fillStyle = "#ffffff";
        ctx.setLineDash([]);
        const handleSize = 5;
        ctx.fillRect(s.x - pad - handleSize / 2, s.y - pad - handleSize / 2, handleSize, handleSize);
        ctx.fillRect(s.x + w + pad - handleSize / 2, s.y - pad - handleSize / 2, handleSize, handleSize);
        ctx.fillRect(s.x - pad - handleSize / 2, s.y + h + pad - handleSize / 2, handleSize, handleSize);
        ctx.fillRect(s.x + w + pad - handleSize / 2, s.y + h + pad - handleSize / 2, handleSize, handleSize);
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
  }, [pan, zoom, shapes, currentShape, selectedShapeId]);

  // 4. DPI-Aware Window Resize Engine
  const updateCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    renderAll();
  }, [renderAll]);

  useEffect(() => {
    updateCanvasDimensions();
    window.addEventListener("resize", updateCanvasDimensions);
    return () => window.removeEventListener("resize", updateCanvasDimensions);
  }, [updateCanvasDimensions]);

  useEffect(() => {
    renderAll();
  }, [renderAll]);

  // Spacebar tracking for Pan
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

  // Screen to Canvas Coordinates Transformation
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom,
    };
  };

  // Hit-testing for selection / eraser
  const findShapeAt = (x: number, y: number): Shape | null => {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (!s) continue;
      const minX = Math.min(s.x, s.x + (s.width || 0)) - 12;
      const maxX = Math.max(s.x, s.x + (s.width || 0)) + 12;
      const minY = Math.min(s.y, s.y + (s.height || 0)) - 12;
      const maxY = Math.max(s.y, s.y + (s.height || 0)) + 12;

      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        return s;
      }
    }
    return null;
  };

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Capture pointer so drawing continues smoothly even if cursor briefly leaves canvas
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const coords = getCanvasCoords(e);

    // Pan via Spacebar or Middle Click or Hand Tool
    if (tool === "hand" || e.button === 1 || isSpacePressedRef.current) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    if (tool === "select") {
      const hit = findShapeAt(coords.x, coords.y);
      if (hit) {
        setSelectedShapeId(hit.id);
        isDraggingShapeRef.current = true;
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

    // Begin new shape drawing
    isDrawingRef.current = true;
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

    if (isPanningRef.current) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (isDraggingShapeRef.current && selectedShapeId) {
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

    if (!isDrawingRef.current || !currentShape) return;

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

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }

    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (isDraggingShapeRef.current) {
      isDraggingShapeRef.current = false;
      return;
    }

    if (!isDrawingRef.current || !currentShape) {
      isDrawingRef.current = false;
      return;
    }

    isDrawingRef.current = false;
    const coords = getCanvasCoords(e);
    const finalized = { ...currentShape };
    setCurrentShape(null);

    // Normalize rectangle / circle / diamond dimensions
    if (finalized.type === "rect" || finalized.type === "diamond" || finalized.type === "circle") {
      const rawW = finalized.width || 0;
      const rawH = finalized.height || 0;
      const normW = Math.abs(rawW);
      const normH = Math.abs(rawH);
      const normX = Math.min(finalized.x, finalized.x + rawW);
      const normY = Math.min(finalized.y, finalized.y + rawH);

      // If user tapped without dragging, spawn standard-sized shape
      if (normW < 5 && normH < 5) {
        finalized.x = coords.x - 60;
        finalized.y = coords.y - 40;
        finalized.width = 120;
        finalized.height = 80;
      } else {
        finalized.x = normX;
        finalized.y = normY;
        finalized.width = normW;
        finalized.height = normH;
      }
    }

    setUndoStack((prev) => [...prev, shapes]);
    setRedoStack([]);
    setShapes((prev) => [...prev, finalized]);
    broadcastShape(finalized);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedShapeId) {
        e.preventDefault();
        setUndoStack((prev) => [...prev, shapes]);
        setRedoStack([]);
        setShapes((prev) => prev.filter((s) => s.id !== selectedShapeId));
        setSelectedShapeId(null);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      switch (e.key.toLowerCase()) {
        case "h":
          setTool("hand");
          break;
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

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.15, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.15, 0.4));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `syncboard-${roomSlug}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 2400);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0e1117] text-zinc-100 select-none font-sans">
      {/* Top Application Bar */}
      <header className="absolute top-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        {/* Brand & Document Room Slug */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-sm backdrop-blur-md hover:border-zinc-700 transition-colors"
          >
            <div className="w-4 h-4 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-[10px]">
              ⚡
            </div>
            <span className="text-xs font-semibold tracking-tight text-zinc-200">SyncBoard</span>
          </Link>

          <button
            onClick={handleShare}
            title="Click to copy room share URL"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-sm backdrop-blur-md hover:border-zinc-700 transition-all cursor-pointer"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? "bg-emerald-400" : "bg-rose-500"
              }`}
            />
            <span className="text-xs font-mono text-zinc-300">room/{roomSlug}</span>
            <span className="text-[10px] text-zinc-400 font-mono">
              {showShareToast ? "✓ Copied" : "Copy"}
            </span>
          </button>
        </div>

        {/* Central Tool Dock (Figma-grade minimal floating dock) */}
        <div className="pointer-events-auto flex items-center gap-0.5 p-1 rounded-2xl bg-zinc-900/95 border border-zinc-800 shadow-xl backdrop-blur-md">
          {[
            {
              id: "hand",
              label: "Pan Tool (H)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5a1.5 1.5 0 013 0v5.5m0 0a1.5 1.5 0 013 0v2" />
              ),
            },
            {
              id: "select",
              label: "Select (V)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
              ),
            },
            {
              id: "rect",
              label: "Rectangle (R)",
              svg: (
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.75} />
              ),
            },
            {
              id: "circle",
              label: "Circle (O)",
              svg: (
                <circle cx="12" cy="12" r="9" strokeWidth={1.75} />
              ),
            },
            {
              id: "diamond",
              label: "Diamond (D)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 2l10 10-10 10L2 12z" />
              ),
            },
            {
              id: "arrow",
              label: "Arrow (A)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 12h14m-7-7l7 7-7 7" />
              ),
            },
            {
              id: "line",
              label: "Line (L)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 20L20 4" />
              ),
            },
            {
              id: "pencil",
              label: "Pen (P)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              ),
            },
            {
              id: "text",
              label: "Text (T)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M12 6v14" />
              ),
            },
            {
              id: "eraser",
              label: "Eraser (E)",
              svg: (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 11l-8-8-8 8m16 0l-8 8m8-8H3m8 8l5 5h5" />
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
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                tool === t.id
                  ? "bg-zinc-800 text-white shadow-sm border border-zinc-700/80"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {t.svg}
              </svg>
            </button>
          ))}
        </div>

        {/* Right: Actions, Zoom, Export & Share */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Active Collaborators count */}
          <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs font-mono text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>{Object.keys(peerCursors).length + 1} live</span>
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center rounded-xl bg-zinc-900/90 border border-zinc-800 p-0.5">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Undo (Ctrl+Z)"
              className="p-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-100 disabled:text-zinc-650 transition-colors"
            >
              ↶
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Redo (Ctrl+Y)"
              className="p-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-100 disabled:text-zinc-650 transition-colors"
            >
              ↷
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs font-mono text-zinc-400">
            <button onClick={handleZoomOut} className="hover:text-zinc-100 px-0.5">-</button>
            <button onClick={handleResetZoom} title="Reset Zoom" className="text-zinc-300 hover:text-white px-1">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={handleZoomIn} className="hover:text-zinc-100 px-0.5">+</button>
          </div>

          {/* Clear Canvas */}
          <button
            onClick={() => setShowClearModal(true)}
            title="Clear Canvas"
            className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-rose-500/40 text-zinc-400 hover:text-rose-400 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* Export PNG */}
          <button
            onClick={handleExport}
            className="px-3 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-colors"
          >
            Export
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-semibold transition-all shadow-sm shadow-cyan-500/20"
          >
            Share
          </button>
        </div>
      </header>

      {/* Floating Left Properties Dock (Only visible when drawing or shape is selected) */}
      {tool !== "eraser" && tool !== "hand" && (
        <aside className="absolute left-4 top-20 z-20 flex flex-col gap-3 p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800/90 shadow-xl backdrop-blur-md w-44 text-xs font-sans">
          {/* Stroke Palette */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold mb-2 block">
              Stroke
            </span>
            <div className="grid grid-cols-4 gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setStrokeColor(c.hex)}
                  title={c.name}
                  style={{ backgroundColor: c.hex }}
                  className={`w-6 h-6 rounded-lg transition-transform cursor-pointer ${
                    strokeColor === c.hex
                      ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-900 scale-105"
                      : "opacity-80 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="w-full h-[1px] bg-zinc-800" />

          {/* Stroke Width */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold mb-2 block">
              Width
            </span>
            <div className="grid grid-cols-3 gap-1">
              {[
                { w: 2, label: "2px" },
                { w: 4, label: "4px" },
                { w: 8, label: "8px" },
              ].map((item) => (
                <button
                  key={item.w}
                  onClick={() => setStrokeWidth(item.w)}
                  className={`py-1 rounded-lg text-[10px] font-mono text-center transition-all ${
                    strokeWidth === item.w
                      ? "bg-zinc-800 text-white font-semibold border border-zinc-700"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fill Mode (For Rect / Circle / Diamond) */}
          {tool !== "line" && tool !== "arrow" && tool !== "pencil" && tool !== "text" && (
            <>
              <div className="w-full h-[1px] bg-zinc-800" />
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold mb-2 block">
                  Fill
                </span>
                <div className="grid grid-cols-3 gap-1">
                  {(["none", "tint", "solid"] as FillStyle[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFillStyle(f)}
                      className={`py-1 rounded-lg text-[10px] font-mono uppercase text-center transition-all ${
                        fillStyle === f
                          ? "bg-zinc-800 text-white font-semibold border border-zinc-700"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Stroke Pattern */}
          {tool !== "text" && (
            <>
              <div className="w-full h-[1px] bg-zinc-800" />
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold mb-2 block">
                  Pattern
                </span>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => setStrokeStyle("solid")}
                    className={`py-1 rounded-lg text-[10px] font-mono text-center transition-all ${
                      strokeStyle === "solid"
                        ? "bg-zinc-800 text-white font-semibold border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Solid
                  </button>
                  <button
                    onClick={() => setStrokeStyle("dashed")}
                    className={`py-1 rounded-lg text-[10px] font-mono text-center transition-all ${
                      strokeStyle === "dashed"
                        ? "bg-zinc-800 text-white font-semibold border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Dashed
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>
      )}

      {/* Floating Peer Cursors Overlay */}
      {Object.values(peerCursors).map((peer) => (
        <div
          key={peer.userId}
          className="absolute pointer-events-none z-10 transition-all duration-75 ease-out"
          style={{
            transform: `translate(${peer.x * zoom + pan.x}px, ${peer.y * zoom + pan.y}px)`,
          }}
        >
          <svg className="w-4 h-4 drop-shadow-md" viewBox="0 0 24 24" fill={peer.color}>
            <path d="M0 0l7 20 3-7 7-3L0 0z" />
          </svg>
          <span
            className="ml-3 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium text-white shadow-sm border border-black/20"
            style={{ backgroundColor: peer.color }}
          >
            {peer.name}
          </span>
        </div>
      ))}

      {/* Primary Drawing Canvas Element */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`w-full h-full touch-none ${
          tool === "hand" || isSpacePressedRef.current
            ? "cursor-grab active:cursor-grabbing"
            : tool === "select"
            ? "cursor-default"
            : "cursor-crosshair"
        }`}
      />

      {/* Bottom Telemetry & Status Bar */}
      <footer className="absolute bottom-3 left-4 right-4 z-20 flex items-center justify-between text-[11px] font-mono text-zinc-400 pointer-events-none">
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-sm backdrop-blur-md pointer-events-auto">
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
          <span className="text-zinc-650">•</span>
          <span>{shapes.length} {shapes.length === 1 ? "shape" : "shapes"}</span>
          <span className="text-zinc-650">•</span>
          <span className="text-cyan-400">{Object.keys(peerCursors).length + 1} online</span>
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
              This will remove all {shapes.length} shapes from this room for all connected peers. This action can be undone locally with Undo.
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
