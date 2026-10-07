import { AppError } from '../errors/app-error';
import type { CompanyPlansRepository } from '../repositories/company-plans.repository';
import { SetPlanInput, companyIdSchema } from '../validation/internal.schemas';

export class CompanyPlansService {
  constructor(private readonly plans: CompanyPlansRepository) {}

  async setPlan(companyId: string, input: SetPlanInput): Promise<void> {
    if (!companyIdSchema.safeParse(companyId).success) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Validation failed', [
        { field: 'companyId', message: 'Invalid UUID' },
      ]);
    }
    await this.plans.upsertPlan(companyId, input.plan);
  }
}
