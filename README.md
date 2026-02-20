# Observer

An osu! replay observer built with React and PixiJS.

## Project Structure

```
apps/
  web/            React frontend (Vite + TanStack Router + Tailwind)
  api/            Hono API server (Node.js)
packages/
  osu-renderer/   osu! gameplay rendering library (PixiJS)
```

## Development

```sh
npm install
npm run dev
```

This starts both the frontend (http://localhost:5173) and the API server (http://localhost:3001).

## Build

```sh
npm run build
```

Builds all workspaces. The frontend outputs static files to `apps/web/dist/`, the API runs as a standalone Node.js server.
