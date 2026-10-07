import type { Request, Response } from 'express';
import type { CompanyPlansService } from '../services/company-plans.service';

export class InternalController {
  constructor(private readonly plans: CompanyPlansService) {}

  setPlan = async (req: Request<{ companyId: string }>, res: Response) => {
    await this.plans.setPlan(req.params.companyId, req.body);
    res.status(204).end();
  };
}
