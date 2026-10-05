import { RequestHandler, Router } from 'express';
import type { AuthController } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate.middleware';
import { loginSchema, registerSchema } from '../validation/auth.schemas';

export function authRoutes(controller: AuthController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.post('/register', validateBody(registerSchema), controller.register);
  router.post('/login', validateBody(loginSchema), controller.login);
  router.get('/me', requireAuth, controller.me);
  return router;
}
