import { AppError } from '../errors/app-error';
import type { CompanyPlansRepository } from '../repositories/company-plans.repository';
import { SetPlanInput, companyIdSchema } from '../validation/internal.schemas';

export class CompanyPlansService {
  constructor(private readonly plans: CompanyPlansRepository) {}

  // Eski ölçümlere dokunulmaz (PLAN §9, snapshot): yeni plan sadece bundan sonra yazılan
  // ölçümlere uygulanır. Worker'ın plan cache'i yüzünden en geç 30 sn içinde yansır.
  async setPlan(companyId: string, input: SetPlanInput): Promise<void> {
    if (!companyIdSchema.safeParse(companyId).success) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Validation failed', [
        { field: 'companyId', message: 'Invalid UUID' },
      ]);
    }
    await this.plans.upsertPlan(companyId, input.plan);
  }
}
