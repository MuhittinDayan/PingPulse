import { MongoClient } from 'mongodb';
import { loadWorkerEnv } from './config/env';
import { setupDatabase } from './database/setup';
import { MONITORS_COLLECTION, MonitorDocument, MonitorsRepository } from './repositories/monitors.repository';
import {
  MEASUREMENTS_COLLECTION,
  MeasurementDocument,
  MeasurementsRepository,
} from './repositories/measurements.repository';
import {
  COMPANY_PLANS_COLLECTION,
  CompanyPlanDocument,
  CompanyPlansRepository,
} from './repositories/company-plans.repository';
import { HttpChecker } from './checker/http-checker';
import { PlanCache } from './checker/plan-cache';
import { Scheduler } from './checker/scheduler';

async function main(): Promise<void> {
  const env = loadWorkerEnv();

  const mongo = new MongoClient(env.MONGO_URL);
  await mongo.connect();
  const db = mongo.db();
  await setupDatabase(db);

  const scheduler = new Scheduler({
    monitors: new MonitorsRepository(db.collection<MonitorDocument>(MONITORS_COLLECTION)),
    measurements: new MeasurementsRepository(db.collection<MeasurementDocument>(MEASUREMENTS_COLLECTION)),
    checker: new HttpChecker(env.CHECK_TIMEOUT_MS),
    plans: new PlanCache(new CompanyPlansRepository(db.collection<CompanyPlanDocument>(COMPANY_PLANS_COLLECTION))),
    concurrency: env.CHECK_CONCURRENCY,
    intervalMs: env.CHECK_INTERVAL_SECONDS * 1000,
    tickMs: env.WORKER_TICK_MS,
  });
  scheduler.start();
  console.log(
    `worker started: concurrency=${env.CHECK_CONCURRENCY}, interval=${env.CHECK_INTERVAL_SECONDS}s, timeout=${env.CHECK_TIMEOUT_MS}ms`,
  );

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, waiting for in-flight checks`);
    await scheduler.stop();
    await mongo.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
