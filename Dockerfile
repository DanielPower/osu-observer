FROM node:24-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run prepare
RUN npm run build
RUN npm prune --production

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY package.json .
EXPOSE 3000
ENV NODE_ENV=production
ENV MEDIA_PATH=./static
CMD [ "node", "build" ]
