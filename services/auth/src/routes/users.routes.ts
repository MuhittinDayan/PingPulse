import { RequestHandler, Router } from 'express';
import type { UsersController } from '../controllers/users.controller';
import { validateBody } from '../middleware/validate.middleware';
import { createUserSchema } from '../validation/users.schemas';

export function usersRoutes(controller: UsersController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);
  router.post('/', validateBody(createUserSchema), controller.create);
  router.get('/', controller.list);
  return router;
}
