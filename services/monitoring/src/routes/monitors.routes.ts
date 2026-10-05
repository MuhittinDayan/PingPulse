import { RequestHandler, Router } from 'express';
import type { MonitorsController } from '../controllers/monitors.controller';
import { validateBody } from '../middleware/validate.middleware';
import { createMonitorSchema } from '../validation/monitors.schemas';

export function monitorsRoutes(controller: MonitorsController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);
  router.post('/', validateBody(createMonitorSchema), controller.create);
  router.get('/', controller.list);
  router.delete('/:id', controller.remove);
  return router;
}
