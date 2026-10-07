import express, { Express } from 'express';
import type { PrismaClient } from './generated/prisma/client';
import type { TokenService } from './utils/jwt';
import type { MonitoringClient } from './clients/monitoring.client';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';
import { CompanyService } from './services/company.service';
import { AuthController } from './controllers/auth.controller';
import { UsersController } from './controllers/users.controller';
import { CompanyController } from './controllers/company.controller';
import { requireAuth } from './middleware/auth.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { authRoutes } from './routes/auth.routes';
import { usersRoutes } from './routes/users.routes';
import { companyRoutes } from './routes/company.routes';
import { healthRoutes } from './routes/health.routes';

type AppDependencies = {
  prisma: PrismaClient;
  tokens: TokenService;
  monitoring: MonitoringClient;
};

export function createApp({ prisma, tokens, monitoring }: AppDependencies): Express {
  const authController = new AuthController(new AuthService(prisma, tokens));
  const usersController = new UsersController(new UsersService(prisma));
  const companyController = new CompanyController(new CompanyService(prisma, monitoring));
  const auth = requireAuth(tokens);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/health', healthRoutes(prisma));
  app.use('/auth', authRoutes(authController, auth));
  app.use('/users', usersRoutes(usersController, auth));
  app.use('/company', companyRoutes(companyController, auth));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
