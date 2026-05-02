# Observer

A web-based replay viewer for osu!
[replay.observer](https://replay.observer/score/4727715398?skin=default)

![Screenshot](.github/screenshot.png)

## Project structure

```
apps/
  web/            React frontend (Vite + TanStack Router + Radix UI)
  api/            Hono API server (Node.js + Postgres + Drizzle)
packages/
  osu-renderer/   osu! gameplay rendering library (PixiJS)
```

## Prerequisites

- **Node.js 22+**
- **Postgres 14+** (running locally or reachable over the network)
- **An osu! OAuth application** — used so users of your deployment can log in
  with their own osu! account. Create one at
  <https://osu.ppy.sh/home/account/edit#oauth>.
  - Application Callback URL: `http://localhost:5173/api/auth/callback` (dev)

## Setup

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Create `.env`** in the repo root by copying the example:

   ```sh
   cp .env.example .env
   ```

   Then fill in the values — see [Environment variables](#environment-variables)
   below for what each one does.

3. **Create the database** (any name; match what you put in `DATABASE_URL`):

   ```sh
   createdb observer
   ```

4. **Apply migrations**

   ```sh
   npm run db:push -w apps/api
   ```

   This creates the `users`, `comments`, `score_metadata`, and `score_views`
   tables. Re-run after pulling changes that touch
   `apps/api/src/db/schema.ts`.

5. **Start the dev servers**

   ```sh
   npm run dev
   ```

   - Frontend: <http://localhost:5173>
   - API: <http://localhost:3001>

   The Vite dev server proxies `/api/*` to the API, so the frontend can talk
   to it through the same origin.

## Environment variables

All env vars live in a single `.env` file at the repo root (loaded by both the
API and Vite). See `.env.example` for a template.

| Variable            | Required | Description                                                                                                                                        |
| ------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | yes      | Postgres connection string, e.g. `postgres://observer:observer@localhost:5432/observer`.                                                           |
| `OSU_CLIENT_ID`     | yes      | OAuth client ID from your osu! OAuth application.                                                                                                  |
| `OSU_CLIENT_SECRET` | yes      | OAuth client secret.                                                                                                                               |
| `AUTH_REDIRECT_URI` | yes      | Must exactly match the Application Callback URL configured in your osu! OAuth app. Dev: `http://localhost:5173/api/auth/callback`.                 |
| `COOKIE_SECRET`     | yes      | Long random string used to sign session JWTs and salt anonymous viewer IP hashes. Generate one with `openssl rand -hex 32`. **Don't commit this.** |
| `SAVE_MEDIA_PATH`   | yes      | Directory where downloaded beatmaps, replays, and skins are stored. In dev, e.g. `./media`.                                                        |
| `FRONTEND_URL`      | no       | Where to redirect the user after a successful OAuth login. Defaults to `http://localhost:5173`.                                                    |
| `VITE_API_URL`      | no       | Frontend API base URL. Defaults to `/api` (uses the Vite dev-server proxy / nginx in production).                                                  |
| `VITE_MEDIA_URL`    | no       | Frontend media base URL. Defaults to `/api/media`.                                                                                                 |

## Useful scripts

From the repo root:

```sh
npm run dev                      # both frontend + api in watch mode
npm run build                    # production build for all workspaces
npm run typecheck                # tsc -b across all workspaces
npm run lint                     # oxlint
npm run prettier                 # prettier --check
npm run check                    # lint + typecheck + prettier in parallel

# Database (from apps/api):
npm run db:push -w apps/api      # apply schema changes directly
npm run db:generate -w apps/api  # generate a migration after editing schema.ts
```

## Running with Docker

`docker-compose.yml` brings up the all-in-one image (nginx + API + frontend
build) along with a Postgres database. Copy `.env.example` to `.env`, fill it
in, then:

```sh
docker compose up -d
```

The app will be available at <http://localhost>. When using Docker, set
`AUTH_REDIRECT_URI=http://localhost/api/auth/callback` (and update your osu!
OAuth application's callback URL to match).
