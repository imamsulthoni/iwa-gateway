# syntax=docker/dockerfile:1
ARG NODE_VERSION=24.22.1
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml* package.json ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm build

FROM build AS backend
ENV NODE_ENV=production
CMD ["node", "packages/backend/dist/api.js"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/packages/web/dist /srv/app
