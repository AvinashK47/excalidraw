# SyncBoard — Real-Time Collaborative Whiteboard

A high-performance, real-time collaborative vector canvas and architecture diagramming studio built with **Next.js 15**, **WebSockets**, **Express**, and **PostgreSQL (Prisma)** inside a **Turborepo** monorepo.

![SyncBoard](https://img.shields.io/badge/Architecture-Turborepo%20Monorepo-blue)
![Next.js](https://img.shields.io/badge/Next.js-15.4-black)
![React](https://img.shields.io/badge/React-19-cyan)
![WebSockets](https://img.shields.io/badge/WebSockets-ws%208.18-emerald)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-blue)

---

## Key Features

- **Collaborative Vector Canvas**:
  - **Primitives**: Select/Move (`V`), Pan/Hand (`H` / `Space`), Rectangle (`R`), Circle/Ellipse (`O`), Diamond (`D`), Directional Arrow (`A`), Line (`L`), Freehand Pen (`P`), Text labels (`T`), and Eraser (`E`).
  - **High-DPI Retina Rendering**: Device Pixel Ratio (DPR) aware coordinate mapping ensures 1:1 razor-sharp drawing with zero scaling distortion or blur.
  - **Smooth Freehand Bézier Curves**: Midpoint quadratic Bézier curve interpolation (`ctx.quadraticCurveTo`) renders natural, fluid digital inking without jagged edges.
  - **Shape Manipulation**: Select, drag to move, and delete shapes (`Delete` / `Backspace`).
  - **Styling Ribbon**: Curated 8-color designer palette, stroke thickness presets (2px, 4px, 8px), fill styles (outline, 15% tint, solid), and dashed stroke patterns.
  - **Export to PNG**: Instant high-resolution image snapshot download.
- **Real-Time Collaboration**:
  - **Sub-50ms Peer Sync**: Bi-directional WebSocket broadcast mesh for drawing events and state mutations.
  - **Live Multi-Cursor Presence**: Real-time laser pointers and color-coded avatar tags showing peer positions across the canvas.
  - **Dual-Channel Late-Joiner Hydration**:
    - Newly connected peers instantly receive the complete room shape history over WebSocket (`init_shapes`) via an in-memory write-through cache.
    - Full persistence backed by PostgreSQL (`Chat` and `Room` records) ensuring shapes survive reloads, reconnects, and server restarts.

---

## Architecture & Monorepo Structure

```
syncboard/
├── apps/
│   ├── web/               # Next.js 15 App Router + Tailwind v4 (Port 3000)
│   ├── http-backend/      # Express API for Auth, Rooms & Chat history (Port 3001)
│   └── ws-backend/        # Native WebSockets server for real-time broadcast (Port 8000)
├── packages/
│   ├── db/                # Prisma schema & PostgreSQL client
│   ├── common/            # Zod validation schemas & shared types
│   ├── backend-common/    # JWT & shared backend utilities
│   ├── ui/                # Shared UI design tokens
│   ├── eslint-config/     # Strict lint configurations
│   └── typescript-config/ # Base tsconfig references
```

---

## Ports & Services

| Service | Protocol / Port | Technology | Purpose |
| :--- | :--- | :--- | :--- |
| **`web`** | `http://localhost:3000` | Next.js 15 (Turbopack) | Interactive canvas frontend & landing hub |
| **`http-backend`** | `http://localhost:3001` | Express + CORS | Room auto-resolution, auth & shape history |
| **`ws-backend`** | `ws://localhost:8000` | `ws` (WebSockets) | Sub-50ms shape broadcast & cursor tracking |
| **`db`** | `localhost:5432` | PostgreSQL 16 (Prisma) | Persistent relational storage for rooms & shapes |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9
- **PostgreSQL** running locally (or via Docker)

### 1. Clone & Install

```bash
git clone https://github.com/AvinashK47/excalidraw.git
cd excalidraw
pnpm install
```

### 2. Configure Environment Variables

Create `.env` in `packages/db`, `apps/http-backend`, and `apps/ws-backend`:

```env
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/excalidraw"
JWT_SECRET="your-secret-key"
PORT=3001 # for http-backend
# PORT=8000 for ws-backend
```

Push schema to PostgreSQL:

```bash
cd packages/db
pnpm dlx prisma db push
```

### 3. Run Development Servers

From the monorepo root:

```bash
pnpm dev
```

Visit [`http://localhost:3000`](http://localhost:3000) or open a shared room directly at [`http://localhost:3000/room/architecture`](http://localhost:3000/room/architecture).

---

## Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| **`V`** | Selection & Move Tool |
| **`H`** or **`Space + Drag`** | Pan Viewport Canvas |
| **`R`** | Rectangle |
| **`O`** | Circle / Ellipse |
| **`D`** | Diamond / Decision |
| **`A`** | Directional Arrow |
| **`L`** | Straight Line |
| **`P`** | Freehand Pen |
| **`T`** | Text Label |
| **`E`** | Eraser |
| **`Ctrl + Z`** | Undo |
| **`Ctrl + Y`** | Redo |
| **`Delete` / `Backspace`** | Delete Selected Shape |

---

## License

MIT © [Avinash Kushwaha](https://github.com/AvinashK47)
