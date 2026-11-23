# Image produksi monorepo WA Bot Console.
# Satu image dipakai dua service: api dan worker (bedakan lewat command di compose).

FROM node:24.22.1-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
# pnpm dipasang sebagai binary nyata, bukan lewat corepack: shim corepack untuk
# pnpm 12 mengunduh binary native saat pertama dipakai, sehingga job migrate/seed
# akan gagal di server tanpa internet.
RUN npm install --global pnpm@12.21.0 && pnpm --version
WORKDIR /app

# 1. Dependency saja, agar layer install di-cache selama lockfile tidak berubah.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/backend/package.json packages/backend/
COPY packages/web/package.json packages/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# 2. Build backend (tsup -> dist/api.js, dist/worker.js) dan web (vite -> packages/web/dist).
# VITE_API_BASE_URL dibakar ke bundle web saat langkah ini, bukan dibaca saat runtime.
FROM deps AS build
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY . .
RUN pnpm build

# 3. Runtime. devDependencies sengaja ikut: `pnpm db:migrate` (drizzle-kit) dan
# `pnpm db:seed:key` (tsx) dijalankan dari image yang sama sebagai job sekali jalan.
FROM base AS runtime
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/package.json \
    /app/pnpm-lock.yaml \
    /app/pnpm-workspace.yaml \
    ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages

# Tanpa .env: seluruh konfigurasi datang dari environment container (lihat README).
USER node
EXPOSE 8467

CMD ["node", "packages/backend/dist/api.js"]
