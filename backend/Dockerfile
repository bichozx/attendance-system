# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# API de asistencia — imagen de producción
#   docker build -t asistencia-api --target runtime .
#   docker build -t asistencia-migrator --target migrator .
# ---------------------------------------------------------------------------
ARG NODE_VERSION=24
ARG PNPM_VERSION=10.26.2

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# --- Dependencias (capa cacheada mientras no cambie el lockfile) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yam[l] ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Compilación ---
FROM deps AS build
COPY . .
# prisma.config.ts lee DATABASE_URL; para generar el cliente basta un valor de relleno
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma generate \
 && pnpm run build

# --- Migraciones: imagen aparte con la CLI de Prisma (no va en la imagen de la API) ---
FROM build AS migrator
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# --- Solo dependencias de producción ---
FROM build AS prod-deps
RUN pnpm prune --prod

# --- Imagen final ---
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
# Usuario sin privilegios (viene en la imagen oficial de Node)
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
