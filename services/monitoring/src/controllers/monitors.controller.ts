import type { Request, Response } from 'express';
import type { MonitorsService } from '../services/monitors.service';

export class MonitorsController {
  constructor(private readonly monitors: MonitorsService) {}

  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.monitors.create(res.locals.user.companyId, req.body));
  };

  list = async (_req: Request, res: Response) => {
    res.json(await this.monitors.list(res.locals.user.companyId));
  };

  remove = async (req: Request<{ id: string }>, res: Response) => {
    await this.monitors.remove(res.locals.user.companyId, req.params.id);
    res.status(204).end();
  };
}
