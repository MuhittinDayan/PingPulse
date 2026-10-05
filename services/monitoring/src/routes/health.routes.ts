import { Router } from 'express';
import type { Db } from 'mongodb';

export function healthRoutes(db: Db): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    await db.command({ ping: 1 });
    res.json({ status: 'ok' });
  });
  return router;
}
