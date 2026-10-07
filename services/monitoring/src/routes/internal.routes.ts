import { RequestHandler, Router } from 'express';
import type { InternalController } from '../controllers/internal.controller';
import { validateBody } from '../middleware/validate.middleware';
import { setPlanSchema } from '../validation/internal.schemas';

// Sadece auth-service çağırır; kullanıcı JWT'si burada geçerli değildir.
export function internalRoutes(controller: InternalController, requireInternalToken: RequestHandler): Router {
  const router = Router();
  router.use(requireInternalToken);
  router.put('/companies/:companyId/plan', validateBody(setPlanSchema), controller.setPlan);
  return router;
}
