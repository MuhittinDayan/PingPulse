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
