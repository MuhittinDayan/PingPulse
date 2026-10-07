FROM node:24-slim AS build
RUN npm install -g pnpm@12.9.1
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/monitoring/package.json services/monitoring/
RUN pnpm install --frozen-lockfile --filter @pingpulse/monitoring

COPY services/monitoring services/monitoring
RUN pnpm --filter @pingpulse/monitoring build \
 && pnpm --filter @pingpulse/monitoring deploy --prod /out

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3002
CMD ["node", "dist/server.js"]
