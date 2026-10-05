import type { MonitorDocument, MonitorsRepository } from '../repositories/monitors.repository';
import type { MeasurementsRepository } from '../repositories/measurements.repository';
import type { HttpChecker } from './http-checker';
import type { PlanCache } from './plan-cache';
import { Semaphore } from './semaphore';

type SchedulerOptions = {
  monitors: MonitorsRepository;
  measurements: MeasurementsRepository;
  checker: HttpChecker;
  plans: PlanCache;
  concurrency: number;
  intervalMs: number;
  tickMs: number;
};

export class Scheduler {
  private readonly semaphore: Semaphore;
  private readonly inFlight = new Set<Promise<void>>();
  private timer: NodeJS.Timeout | undefined;
  private filling: Promise<void> | null = null;
  private stopping = false;

  constructor(private readonly options: SchedulerOptions) {
    this.semaphore = new Semaphore(options.concurrency);
  }

  start(): void {
    this.timer = setInterval(() => void this.fillSlots(), this.options.tickMs);
    void this.fillSlots();
  }

  // Yeni monitor alınmaz. Önce o an süren claim (varsa) beklenir, çünkü o da bir kontrol
  // başlatabilir; sonra başlamış bütün kontrollerin bitmesi beklenir.
  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.timer);
    await this.filling;
    await Promise.allSettled(this.inFlight);
  }

  // Hem her tick'te hem de bir kontrol bitip slot boşaldığında çağrılır.
  // Aynı anda tek bir doldurma döngüsü çalışır.
  private fillSlots(): Promise<void> {
    if (this.stopping) {
      return Promise.resolve();
    }
    this.filling ??= this.fillLoop().finally(() => {
      this.filling = null;
    });
    return this.filling;
  }

  // Boş slot olduğu sürece zamanı gelmiş monitor alır ve kontrolünü başlatır (beklemeden).
  private async fillLoop(): Promise<void> {
    while (!this.stopping && this.semaphore.tryAcquire()) {
      let monitor: MonitorDocument | null;
      try {
        monitor = await this.options.monitors.claimNextDue(new Date(), this.options.intervalMs);
      } catch (error) {
        this.semaphore.release();
        console.error('Failed to claim monitor:', error);
        return;
      }
      if (!monitor) {
        this.semaphore.release();
        return;
      }
      // Claim sürerken stop() çağrılmış olabilir; alınmış monitor yine de kontrol edilir
      // ve stop() onu da bekler (önce bu döngüyü, sonra inFlight'ı).
      this.launch(monitor);
    }
  }

  private launch(monitor: MonitorDocument): void {
    const run = this.runCheck(monitor).finally(() => {
      this.semaphore.release();
      this.inFlight.delete(run);
      void this.fillSlots();
    });
    this.inFlight.add(run);
  }

  // Hiçbir hata dışarı sızmaz: bir monitor'deki sorun diğerlerini ve döngüyü etkilemez.
  private async runCheck(monitor: MonitorDocument): Promise<void> {
    try {
      const startedAt = new Date();
      const result = await this.options.checker.check(monitor.url);
      const plan = await this.options.plans.planFor(monitor.companyId);
      await this.options.measurements.insert({
        timestamp: startedAt,
        meta: { companyId: monitor.companyId, monitorId: monitor._id.toHexString(), plan },
        ...result,
        scheduleLagMs: Math.max(0, startedAt.getTime() - monitor.nextCheckAt.getTime()),
      });
    } catch (error) {
      console.error(`Check failed for monitor ${monitor._id.toHexString()}:`, error);
    }
  }
}
