import { MongoClient } from 'mongodb';
import { loadApiEnv } from './config/env';
import { setupDatabase } from './database/setup';
import { TokenVerifier } from './utils/jwt';
import { createApp } from './app';

async function main(): Promise<void> {
  const env = loadApiEnv();

  const mongo = new MongoClient(env.MONGO_URL);
  await mongo.connect();
  const db = mongo.db();
  await setupDatabase(db);

  const app = createApp({
    db,
    tokens: new TokenVerifier(env.JWT_SECRET),
    internalToken: env.INTERNAL_TOKEN,
    allowPrivateTargets: env.ALLOW_PRIVATE_TARGETS,
  });
  const server = app.listen(env.PORT, '0.0.0.0', (error) => {
    if (error) throw error;
    console.log(`monitoring-api listening on port ${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await mongo.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
