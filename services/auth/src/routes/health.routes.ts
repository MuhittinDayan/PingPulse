import { Router } from 'express';
import type { PrismaClient } from '../generated/prisma/client';

export function healthRoutes(prisma: PrismaClient): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });
  return router;
}
