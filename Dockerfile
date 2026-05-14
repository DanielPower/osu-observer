FROM node:24-alpine AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY app/package.json app/
COPY packages/osu-simulation/package.json packages/osu-simulation/
COPY packages/osu-renderer/package.json packages/osu-renderer/

RUN pnpm install --frozen-lockfile

COPY packages/osu-simulation/ packages/osu-simulation/
RUN pnpm --filter osu-simulation run build

COPY packages/osu-renderer/ packages/osu-renderer/
RUN pnpm --filter osu-renderer run build

COPY app/ app/

RUN pnpm --filter app run build

FROM node:24-alpine

WORKDIR /app

COPY --from=build /app/app/.output .output
COPY --from=build /app/app/drizzle drizzle

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
