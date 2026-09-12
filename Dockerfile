# Build stage
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS builder
WORKDIR /app
# Next.js build telemetry (anonymous usage data to Vercel) is off: a
# privacy-focused app must not phone home during build, and reproducible
# builds shouldn't depend on local opt-out state.
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
# npm's download cache survives layer invalidation (BuildKit cache mount,
# never lands in the image). `next build` needs the devDependencies, so this
# installs everything — the cache keeps re-downloads off the wire.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
# Opt into standalone output for this build only: the runner stage copies the
# self-contained server.js. Local/CI builds leave it off so `next start` does
# not warn about the mismatch (see next.config.ts).
ENV NVEIL_STANDALONE=1
RUN npm run build

# Production stage
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# The standalone server needs no writable paths at runtime.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
