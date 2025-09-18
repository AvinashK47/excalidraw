# Excalidraw Clone

This is a clone of the Excalidraw collaborative whiteboarding tool, built with modern web technologies.

## Demo

https://github.com/AvinashK47/excalidraw/assets/128841330/6e9d319a-331f-483a-a888-1f3d3e54910b

## Features

- Real-time collaboration with WebSockets
- User authentication and authorization
- Create and join rooms
- Chat functionality within rooms
- Drawing tools (freehand, shapes, etc.)

## Tech Stack

- **Frontend**: Next.js, React, TypeScript
- **Backend**: Node.js, Express, WebSockets
- **Database**: PostgreSQL with Prisma
- **Monorepo**: Turborepo

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- pnpm
- Docker

### Installation

1.  Clone the repository:
    ```sh
    git clone https://github.com/AvinashK47/excalidraw.git
    ```
2.  Install dependencies:
    ```sh
    pnpm install
    ```
3.  Set up environment variables. Create a `.env` file in the root of the project and add the following:
    ```
    DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<database>"
    JWT_SECRET="your-secret-key"
    ```
    You will also need to create `.env` files in `apps/http-backend` and `apps/ws-backend` with the same `DATABASE_URL`.

4.  Start the development servers:
    ```sh
    pnpm run dev
    ```

This will start the following services:
- `web`: Next.js frontend on port `3001`
- `http-backend`: HTTP server on port `3000`
- `ws-backend`: WebSocket server on port `8000`

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `web`: The Next.js frontend application.
- `http-backend`: The Express.js server for handling HTTP requests (authentication, room creation, etc.).
- `ws-backend`: The WebSocket server for real-time communication.
- `@repo/ui`: A shared React component library.
- `@repo/db`: Prisma schema and client for database access.
- `@repo/common`: Shared types and configuration.
- `@repo/backend-common`: Shared backend utilities.
- `@repo/eslint-config`: ESLint configurations.
- `@repo/typescript-config`: TypeScript configurations.

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo build

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo build
yarn dlx turbo build
pnpm exec turbo build
```

You can build a specific package by using a [filter](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo build --filter=web

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo build --filter=web
yarn exec turbo build --filter=web
pnpm exec turbo build --filter=web
```

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev
yarn exec turbo dev
pnpm exec turbo dev
```

You can develop a specific package by using a [filter](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev --filter=web

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev --filter=web
yarn exec turbo dev --filter=web
pnpm exec turbo dev --filter=web
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:


```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo login

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo login
yarn exec turbo login
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo link

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo link
yarn exec turbo link
pnpm exec turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.com/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.com/docs/reference/configuration)
- [CLI Usage](https://turborepo.com/docs/reference/command-line-reference)
