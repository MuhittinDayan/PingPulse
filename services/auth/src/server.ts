import { loadEnv } from './config/env';
import { createPrismaClient } from './database/prisma';
import { TokenService } from './utils/jwt';
import { MonitoringClient } from './clients/monitoring.client';
import { createApp } from './app';

function main(): void {
  const env = loadEnv();
  const prisma = createPrismaClient(env.DATABASE_URL);
  const tokens = new TokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN);
  const monitoring = new MonitoringClient(env.MONITORING_URL, env.INTERNAL_TOKEN);

  const server = createApp({ prisma, tokens, monitoring }).listen(env.PORT, '0.0.0.0', (error) => {
    if (error) throw error;
    console.log(`auth-service listening on port ${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
