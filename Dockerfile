FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY app/package.json app/
COPY packages/osu-simulation/package.json packages/osu-simulation/
COPY packages/osu-renderer/package.json packages/osu-renderer/

RUN npm ci

COPY packages/osu-simulation/ packages/osu-simulation/
RUN npm run build -w packages/osu-simulation

COPY packages/osu-renderer/ packages/osu-renderer/
RUN npm run build -w packages/osu-renderer

COPY app/ app/

ARG VITE_MEDIA_URL=https://observer-assets.danielpower.ca
ENV VITE_MEDIA_URL=$VITE_MEDIA_URL

RUN npm run build -w web

FROM node:24-alpine

WORKDIR /app

COPY --from=build /app/app/.output .output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
