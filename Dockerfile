FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/osu-simulation/package.json packages/osu-simulation/
COPY packages/osu-renderer/package.json packages/osu-renderer/

RUN npm ci

COPY packages/osu-simulation/ packages/osu-simulation/
RUN npm run build -w packages/osu-simulation

COPY packages/osu-renderer/ packages/osu-renderer/
RUN npm run build -w packages/osu-renderer

COPY apps/web/ apps/web/

ARG VITE_API_URL=/api
ARG VITE_MEDIA_URL=/api/media
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MEDIA_URL=$VITE_MEDIA_URL

RUN npm run build -w apps/web

FROM node:24-alpine

RUN apk add --no-cache nginx

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/osu-simulation/package.json packages/osu-simulation/
COPY packages/osu-renderer/package.json packages/osu-renderer/

RUN npm ci --omit=dev && npm install tsx

COPY --from=build /app/packages/osu-simulation/dist packages/osu-simulation/dist
COPY --from=build /app/packages/osu-renderer/dist packages/osu-renderer/dist

COPY apps/api/ apps/api/

COPY nginx.conf /etc/nginx/http.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

CMD ["/entrypoint.sh"]
