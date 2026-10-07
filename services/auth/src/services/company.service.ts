import type { PrismaClient } from '../generated/prisma/client';
import type { MonitoringClient } from '../clients/monitoring.client';
import { AppError } from '../errors/app-error';
import type { ChangePlanInput } from '../validation/company.schemas';
import { CompanyView, toCompanyView } from './views';

export class CompanyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly monitoring: MonitoringClient,
  ) {}

  async changePlan(companyId: string, input: ChangePlanInput): Promise<CompanyView> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${companyId}))`;

        try {
          await this.monitoring.setCompanyPlan(companyId, input.plan);
        } catch (error) {
          console.error('Plan sync with monitoring-service failed:', error);
          throw new AppError(503, 'PLAN_SYNC_FAILED', 'Plan could not be changed, please try again');
        }

        const company = await tx.company.update({
          where: { id: companyId },
          data: { plan: input.plan },
        });
        return toCompanyView(company);
      },
      { timeout: 10_000 },
    );
  }
}
