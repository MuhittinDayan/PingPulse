FROM node:24-slim AS build
RUN npm install -g pnpm@12.9.1
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/auth/package.json services/auth/
RUN pnpm install --frozen-lockfile --filter @pingpulse/auth

COPY services/auth services/auth
RUN pnpm --filter @pingpulse/auth exec prisma generate \
 && pnpm --filter @pingpulse/auth build \
 && pnpm --filter @pingpulse/auth deploy --prod /out

FROM node:24-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/server.js"]
