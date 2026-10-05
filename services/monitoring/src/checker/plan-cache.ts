import type { Plan } from '../config/retention';
import type { CompanyPlansRepository } from '../repositories/company-plans.repository';

const CACHE_TTL_MS = 30_000;

// Her ölçümde DB'ye plan sorgusu atmamak için planlar 30 sn bellekte tutulur.
// Plan değişikliği en geç 30 sn içinde yansır (PLAN §9: snapshot politikasında kabul edilebilir).
export class PlanCache {
  private readonly entries = new Map<string, { plan: Plan; expiresAt: number }>();
  private lastSweepAt = 0;

  constructor(private readonly plans: CompanyPlansRepository) {}

  async planFor(companyId: string, now = Date.now()): Promise<Plan> {
    const cached = this.entries.get(companyId);
    if (cached && cached.expiresAt > now) {
      return cached.plan;
    }
    this.sweepExpired(now);
    const plan = await this.plans.findPlan(companyId);
    this.entries.set(companyId, { plan, expiresAt: now + CACHE_TTL_MS });
    return plan;
  }

  // Artık kontrol edilmeyen şirketlerin kayıtları birikmesin diye TTL periyodunda bir temizlenir.
  private sweepExpired(now: number): void {
    if (now - this.lastSweepAt < CACHE_TTL_MS) {
      return;
    }
    this.lastSweepAt = now;
    for (const [companyId, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(companyId);
      }
    }
  }
}
