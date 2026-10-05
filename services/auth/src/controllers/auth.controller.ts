import type { Request, Response } from 'express';
import type { AuthService } from '../services/auth.service';

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  register = async (req: Request, res: Response) => {
    res.status(201).json(await this.auth.register(req.body));
  };

  login = async (req: Request, res: Response) => {
    res.json(await this.auth.login(req.body));
  };

  me = async (_req: Request, res: Response) => {
    res.json(await this.auth.me(res.locals.user));
  };
}
