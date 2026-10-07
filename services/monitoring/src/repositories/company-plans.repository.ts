import type { Collection } from 'mongodb';
import type { Plan } from '../config/retention';

export const COMPANY_PLANS_COLLECTION = 'company_plans';

// auth-service'teki planın monitoring tarafındaki kopyası (PLAN §4).
export type CompanyPlanDocument = { _id: string; plan: Plan; updatedAt: Date };

export class CompanyPlansRepository {
  constructor(private readonly collection: Collection<CompanyPlanDocument>) {}

  // Kaydı olmayan şirket FREE kabul edilir; kayıt sırasında senkronizasyon gerekmez.
  async findPlan(companyId: string): Promise<Plan> {
    const document = await this.collection.findOne({ _id: companyId });
    return document?.plan ?? 'FREE';
  }

  // Upsert: kayıt yoksa oluşturur, varsa günceller. Aynı çağrı tekrarlanırsa sonuç değişmez.
  async upsertPlan(companyId: string, plan: Plan): Promise<void> {
    await this.collection.updateOne(
      { _id: companyId },
      { $set: { plan, updatedAt: new Date() } },
      { upsert: true },
    );
  }
}
