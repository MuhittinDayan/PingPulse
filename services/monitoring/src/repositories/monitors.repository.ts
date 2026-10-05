import { Collection, MongoServerError, ObjectId } from 'mongodb';

export const MONITORS_COLLECTION = 'monitors';

export type MonitorDocument = {
  _id: ObjectId;
  companyId: string;
  name: string;
  url: string;
  normalizedUrl: string;
  isActive: boolean;
  nextCheckAt: Date;
  createdAt: Date;
};

// API'nin kullandığı her sorgu companyId ister. Tek istisna worker'ın claimNextDue sorgusu.
export class MonitorsRepository {
  constructor(private readonly collection: Collection<MonitorDocument>) {}

  async insert(companyId: string, data: Omit<MonitorDocument, '_id' | 'companyId'>) {
    const document = { _id: new ObjectId(), companyId, ...data };
    await this.collection.insertOne(document);
    return document;
  }

  listByCompany(companyId: string): Promise<MonitorDocument[]> {
    return this.collection.find({ companyId }).sort({ createdAt: 1 }).toArray();
  }

  async deleteById(companyId: string, id: ObjectId): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id, companyId });
    return result.deletedCount === 1;
  }

  // Worker'a özel, şirketten bağımsız sistem sorgusu: zamanı gelmiş en eski monitor'ü alır
  // ve bir sonraki kontrol zamanını aynı işlemde ileri atar. İki worker aynı anda çağırsa
  // bile MongoDB doküman güncellemesini atomik yaptığı için monitor'ü sadece biri alır.
  // Dönen doküman güncelleme ÖNCESİ halidir; nextCheckAt planlanan kontrol zamanıdır.
  claimNextDue(now: Date, intervalMs: number): Promise<MonitorDocument | null> {
    return this.collection.findOneAndUpdate(
      { isActive: true, nextCheckAt: { $lte: now } },
      { $set: { nextCheckAt: new Date(now.getTime() + intervalMs) } },
      { sort: { nextCheckAt: 1 }, returnDocument: 'before' },
    );
  }
}

export function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}
