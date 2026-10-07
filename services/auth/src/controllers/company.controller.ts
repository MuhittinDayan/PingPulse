import type { Request, Response } from 'express';
import type { CompanyService } from '../services/company.service';

export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  changePlan = async (req: Request, res: Response) => {
    res.json(await this.company.changePlan(res.locals.user.companyId, req.body));
  };
}
