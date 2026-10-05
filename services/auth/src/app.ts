import express, { Express } from 'express';
import type { PrismaClient } from './generated/prisma/client';
import { TokenService } from './utils/jwt';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';
import { AuthController } from './controllers/auth.controller';
import { UsersController } from './controllers/users.controller';
import { requireAuth } from './middleware/auth.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { authRoutes } from './routes/auth.routes';
import { usersRoutes } from './routes/users.routes';
import { healthRoutes } from './routes/health.routes';

type AppDependencies = {
  prisma: PrismaClient;
  tokens: TokenService;
};

export function createApp({ prisma, tokens }: AppDependencies): Express {
  const authController = new AuthController(new AuthService(prisma, tokens));
  const usersController = new UsersController(new UsersService(prisma));
  const auth = requireAuth(tokens);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', healthRoutes(prisma));
  app.use('/auth', authRoutes(authController, auth));
  app.use('/users', usersRoutes(usersController, auth));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
