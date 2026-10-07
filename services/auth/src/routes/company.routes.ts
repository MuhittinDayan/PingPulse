import { RequestHandler, Router } from 'express';
import type { CompanyController } from '../controllers/company.controller';
import { validateBody } from '../middleware/validate.middleware';
import { changePlanSchema } from '../validation/company.schemas';

export function companyRoutes(controller: CompanyController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);
  router.patch('/plan', validateBody(changePlanSchema), controller.changePlan);
  return router;
}
