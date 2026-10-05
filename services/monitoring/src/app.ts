import express, { Express } from 'express';
import type { Db } from 'mongodb';
import type { TokenVerifier } from './utils/jwt';
import { MONITORS_COLLECTION, MonitorDocument, MonitorsRepository } from './repositories/monitors.repository';
import {
  MEASUREMENTS_COLLECTION,
  MeasurementDocument,
  MeasurementsRepository,
} from './repositories/measurements.repository';
import { MonitorsService } from './services/monitors.service';
import { MonitorsController } from './controllers/monitors.controller';
import { requireAuth } from './middleware/auth.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { monitorsRoutes } from './routes/monitors.routes';
import { healthRoutes } from './routes/health.routes';

type AppDependencies = {
  db: Db;
  tokens: TokenVerifier;
  allowPrivateTargets: boolean;
};

export function createApp({ db, tokens, allowPrivateTargets }: AppDependencies): Express {
  const monitorsRepository = new MonitorsRepository(db.collection<MonitorDocument>(MONITORS_COLLECTION));
  const measurementsRepository = new MeasurementsRepository(
    db.collection<MeasurementDocument>(MEASUREMENTS_COLLECTION),
  );
  const monitorsController = new MonitorsController(
    new MonitorsService(monitorsRepository, measurementsRepository, allowPrivateTargets),
  );

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', healthRoutes(db));
  app.use('/monitors', monitorsRoutes(monitorsController, requireAuth(tokens)));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
