import type { Request, Response } from 'express';
import type { UsersService } from '../services/users.service';

export class UsersController {
  constructor(private readonly users: UsersService) {}

  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.users.create(res.locals.user.companyId, req.body));
  };

  list = async (_req: Request, res: Response) => {
    res.json(await this.users.list(res.locals.user.companyId));
  };
}
