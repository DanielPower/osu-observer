FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/osu-renderer/package.json packages/osu-renderer/

RUN npm ci

COPY apps/api/ apps/api/

EXPOSE 3001

CMD ["npx", "tsx", "apps/api/src/index.ts"]
