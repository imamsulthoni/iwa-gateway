# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# manifest dulu, supaya cache install tidak batal tiap kali src berubah
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
ARG VITE_API_BASE_URL=/
RUN pnpm build

# hanya dependency produksi (drizzle-kit, vitest, tsx tidak ikut)
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile --prod

FROM node:24-bookworm-slim AS backend
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=builder /repo/packages/backend/dist ./packages/backend/dist
COPY --from=builder /repo/packages/backend/package.json ./packages/backend/package.json
CMD ["node", "packages/backend/dist/api.js"]

FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/packages/web/dist /usr/share/nginx/html/app
