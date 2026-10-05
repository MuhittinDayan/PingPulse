import { Db, MongoServerError } from 'mongodb';
import { RETENTION_SECONDS } from '../config/retention';
import { MONITORS_COLLECTION } from '../repositories/monitors.repository';
import { MEASUREMENTS_COLLECTION } from '../repositories/measurements.repository';

const NAMESPACE_EXISTS = 48;

// Partial TTL süreyi sadece kısaltabilir; en uzun süre (ENTERPRISE) koleksiyon TTL'idir.
const TTL_INDEXES = [
  { name: 'ttl_free', plan: 'FREE', expireAfterSeconds: RETENTION_SECONDS.FREE },
  { name: 'ttl_pro', plan: 'PRO', expireAfterSeconds: RETENTION_SECONDS.PRO },
] as const;

// API ve worker iş başlamadan önce çağırır. Her adım idempotent'tir; saklama süreleri
// değişirse mevcut TTL'ler yeni değerlere çekilir.
export async function setupDatabase(db: Db): Promise<void> {
  await db.collection(MONITORS_COLLECTION).createIndexes([
    { key: { companyId: 1, normalizedUrl: 1 }, name: 'company_url_unique', unique: true },
    { key: { isActive: 1, nextCheckAt: 1 }, name: 'due_monitors' },
  ]);

  await ensureMeasurementsCollection(db);
  await syncTtlIndexes(db);
  await db
    .collection(MEASUREMENTS_COLLECTION)
    .createIndex({ 'meta.monitorId': 1, timestamp: 1 }, { name: 'monitor_time' });
}

async function ensureMeasurementsCollection(db: Db): Promise<void> {
  try {
    await db.createCollection(MEASUREMENTS_COLLECTION, {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'meta',
        bucketMaxSpanSeconds: 3600,
        bucketRoundingSeconds: 3600,
      },
      expireAfterSeconds: RETENTION_SECONDS.ENTERPRISE,
    });
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === NAMESPACE_EXISTS)) {
      throw error;
    }
  }

  // Koleksiyon önceden bir insertOne ile normal koleksiyon olarak oluşmuşsa
  // time series ve TTL sessizce devre dışı kalır. Bu durumda çalışmaya devam edilmez.
  const [info] = await db
    .listCollections({ name: MEASUREMENTS_COLLECTION }, { nameOnly: false })
    .toArray();
  if (info?.type !== 'timeseries') {
    throw new Error(
      `"${MEASUREMENTS_COLLECTION}" exists but is not a time series collection; ` +
        'TTL would not work. Drop it and restart the service.',
    );
  }

  if (Number(info.options?.expireAfterSeconds) !== RETENTION_SECONDS.ENTERPRISE) {
    await db.command({
      collMod: MEASUREMENTS_COLLECTION,
      expireAfterSeconds: RETENTION_SECONDS.ENTERPRISE,
    });
  }
}

// Time series'te TTL index süresi collMod ile değiştirilemez; süre farklıysa index
// silinip yeniden oluşturulur. Aradaki kısa anda silme sadece bir sonraki TTL turuna kayar.
async function syncTtlIndexes(db: Db): Promise<void> {
  const collection = db.collection(MEASUREMENTS_COLLECTION);
  const existing = await collection.indexes();

  for (const ttl of TTL_INDEXES) {
    const current = existing.find((index) => index.name === ttl.name);
    if (current?.expireAfterSeconds === ttl.expireAfterSeconds) {
      continue;
    }
    if (current) {
      await collection.dropIndex(ttl.name);
    }
    await collection.createIndex(
      { timestamp: 1 },
      {
        name: ttl.name,
        partialFilterExpression: { 'meta.plan': ttl.plan },
        expireAfterSeconds: ttl.expireAfterSeconds,
      },
    );
  }
}
