# Build stage
FROM node:26-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS builder
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
RUN npm run build

# Production stage
FROM node:26-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS runner
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
