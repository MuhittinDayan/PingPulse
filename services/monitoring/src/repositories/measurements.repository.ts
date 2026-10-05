import type { Collection } from 'mongodb';
import type { Plan } from '../config/retention';

export const MEASUREMENTS_COLLECTION = 'measurements';

export type CheckErrorCode =
  | 'TIMEOUT'
  | 'DNS_ERROR'
  | 'CONN_REFUSED'
  | 'TLS_ERROR'
  | 'HTTP_ERROR'
  | 'BLOCKED_TARGET'
  | 'UNKNOWN';

export type MeasurementDocument = {
  timestamp: Date;
  // plan: ölçümün yazıldığı andaki plan. TTL index'leri buna göre siler (PLAN §9, snapshot).
  meta: { companyId: string; monitorId: string; plan: Plan };
  isUp: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  errorCode: CheckErrorCode | null;
  scheduleLagMs: number;
};

export class MeasurementsRepository {
  constructor(private readonly collection: Collection<MeasurementDocument>) {}

  async insert(measurement: MeasurementDocument): Promise<void> {
    await this.collection.insertOne(measurement);
  }

  async deleteByMonitor(companyId: string, monitorId: string): Promise<void> {
    await this.collection.deleteMany({ 'meta.companyId': companyId, 'meta.monitorId': monitorId });
  }
}
