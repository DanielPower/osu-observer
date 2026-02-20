FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/osu-renderer/package.json packages/osu-renderer/

RUN npm ci

COPY packages/osu-renderer/ packages/osu-renderer/
RUN npm run build -w packages/osu-renderer

COPY apps/web/ apps/web/

ARG VITE_API_URL=/api
ARG VITE_MEDIA_URL=/api/media
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MEDIA_URL=$VITE_MEDIA_URL

RUN npm run build -w apps/web

FROM nginx:alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
