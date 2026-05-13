# Observer

[osu!observer](https://replay.observer/score/4727715398?skin=default) is a web-based replay viewer for osu!

![Screenshot](.github/screenshot.png)

## Project structure

```
app/                React frontend + Tanstack Start SSR backend
packages/
  osu-renderer/     osu! replay rendering library
  osu-simulation/   osu! replay simulation library
```

## Prerequisites

- **Node.js 24+**
- **pnpm 11+**
- **Postgres 16+**
- **An osu! OAuth application** — create one at <https://osu.ppy.sh/home/account/edit#oauth>
  - Application Callback URL: `http://localhost:3000/api/auth/callback` (dev)

## Setup

1. **Install dependencies**

   ```sh
   pnpm install
   ```

2. **Create `.env`** by copying the example and filling in the values:

   ```sh
   cp .env.example .env
   ```

3. **Create the database** (any name; match what you put in `DATABASE_URL`):

   ```sh
   createdb observer
   ```

4. **Apply migrations**

   ```sh
   pnpm --filter app run db:push
   ```

5. **Start the dev server**

   ```sh
   pnpm dev
   ```

## Environment variables

| Variable            | Required | Description                                                                                         |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | yes      | Postgres connection string, e.g. `postgres://observer:observer@localhost:5432/observer`.            |
| `OSU_CLIENT_ID`     | yes      | OAuth client ID from your osu! OAuth application.                                                   |
| `OSU_CLIENT_SECRET` | yes      | OAuth client secret.                                                                                |
| `AUTH_REDIRECT_URI` | yes      | Must match the callback URL in your osu! OAuth app. Dev: `http://localhost:3000/api/auth/callback`. |
| `COOKIE_SECRET`     | yes      | Long random string for signing session JWTs. Generate with `openssl rand -hex 32`.                  |
| `SAVE_MEDIA_PATH`   | yes      | Directory for downloaded beatmaps, replays, and skins. Dev: `./media`.                              |

## Scripts

```sh
pnpm dev           # start dev server
pnpm build         # production build
pnpm check         # lint + typecheck + format in parallel
pnpm db:push       # apply schema changes
pnpm db:generate   # generate migration after editing app/src/db/schema.ts
```
