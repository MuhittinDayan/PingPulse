import type { Db } from 'mongodb';
import { MONITORS_COLLECTION } from '../repositories/monitors.repository';

// API ve worker iş başlamadan önce çağırır. createIndexes idempotent'tir: index zaten varsa bir şey yapmaz.
export async function setupDatabase(db: Db): Promise<void> {
  await db.collection(MONITORS_COLLECTION).createIndexes([
    { key: { companyId: 1, normalizedUrl: 1 }, name: 'company_url_unique', unique: true },
    { key: { isActive: 1, nextCheckAt: 1 }, name: 'due_monitors' },
  ]);
}
