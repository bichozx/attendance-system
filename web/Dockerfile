# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Panel web de asistencia — imagen de producción
#   docker build -t asistencia-web .
#   docker run -p 3100:3100 -e BACKEND_URL=http://api:3000/api/v1 asistencia-web
# BACKEND_URL y COOKIE_SECURE se leen al arrancar (no hace falta reconstruir para cambiarlos).
# ---------------------------------------------------------------------------
ARG NODE_VERSION=24
ARG PNPM_VERSION=10.26.2

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# --- Dependencias (capa cacheada mientras no cambie el lockfile) ---
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yam[l] ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Compilación ---
FROM deps AS build
COPY . .
RUN pnpm run build

# --- Imagen final: solo el servidor standalone y los archivos estáticos ---
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3100 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
