# ── TutorSurvey API (Express + Prisma + Telegraf) ─────────────────────────────
FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install workspace deps (root lockfile drives both apps)
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/api --include-workspace-root --ignore-scripts

# Build
FROM deps AS build
COPY apps/api apps/api
RUN npm run build -w apps/api

# Runtime
FROM base AS runner
ENV NODE_ENV=production PORT=4000 TZ=Asia/Tashkent
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/src/generated ./apps/api/src/generated
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY apps/api/assets ./apps/api/assets
COPY apps/api/package.json ./apps/api/package.json
COPY package.json ./package.json
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
