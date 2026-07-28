# Observer

[osu!observer](https://osu.observer/score/4727715398?skin=default) is a web-based replay viewer for osu!

![Screenshot](.github/screenshot.png)

## Prerequisites

- **Node.js 24+**
- **pnpm 11+**
- **Postgres 16+**
- **An S3-compatible object storage bucket**
- **An osu! OAuth application** — create one at <https://osu.ppy.sh/home/account/edit#oauth>
  - Application Callback URL: `http://localhost:3000/api/auth/callback` (dev)

## Setup

1. **Install dependencies**

   ```sh
   pnpm install
   ```

2. **Create `app/.env`** by copying the example and filling in the values:

   ```sh
   cp app/.env.example app/.env
   ```

   Docker Compose reads the same variables from `.env` in the repository root instead.

3. **Create the database** (any name; match what you put in `DATABASE_URL`):

   ```sh
   createdb observer
   ```

4. **Apply migrations**

   ```sh
   pnpm db:push
   ```

5. **Start the dev server**

   ```sh
   pnpm dev
   ```

## Environment variables

| Variable               | Required | Description                                                                                         |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | yes      | Postgres connection string, e.g. `postgres://observer:observer@localhost:5432/observer`.            |
| `OSU_CLIENT_ID`        | yes      | OAuth client ID from your osu! OAuth application.                                                   |
| `OSU_CLIENT_SECRET`    | yes      | OAuth client secret.                                                                                |
| `AUTH_REDIRECT_URI`    | yes      | Must match the callback URL in your osu! OAuth app. Dev: `http://localhost:3000/api/auth/callback`. |
| `COOKIE_SECRET`        | yes      | Long random string for signing session JWTs. Generate with `openssl rand -hex 32`.                  |
| `FRONTEND_URL`         | yes      | Public application URL. Dev: `http://localhost:3000`.                                               |
| `MEDIA_BASE_URL`       | yes      | Public bucket or CDN URL used by browsers to download media directly.                               |
| `S3_ENDPOINT`          | yes      | S3-compatible API URL, e.g. `https://s3.us-east-1.amazonaws.com` or `http://localhost:9000`.        |
| `S3_REGION`            | yes      | Region used to sign S3 requests.                                                                    |
| `S3_BUCKET`            | yes      | Existing bucket used for beatmaps, replays, and skins.                                              |
| `S3_ACCESS_KEY_ID`     | yes      | Access key with read, write, list, and delete access to the bucket.                                 |
| `S3_SECRET_ACCESS_KEY` | yes      | Secret key for the S3 access key.                                                                   |
| `S3_SESSION_TOKEN`     | no       | Session token when using temporary S3 credentials.                                                  |
| `S3_FORCE_PATH_STYLE`  | no       | Set to `true` when the provider requires path-style bucket URLs. Defaults to `false`.               |

The media bucket must permit public reads and cross-origin `GET` requests from `FRONTEND_URL`.
`S3_ENDPOINT` remains the authenticated server-side API endpoint; do not set it to a CDN URL.
To upload the bundled and custom skins after configuring the bucket, run:

```sh
pnpm --filter app ingest-skins
```
