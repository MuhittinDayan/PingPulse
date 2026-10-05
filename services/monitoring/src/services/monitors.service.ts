import { ObjectId } from 'mongodb';
import { AppError } from '../errors/app-error';
import { MonitorDocument, MonitorsRepository, isDuplicateKey } from '../repositories/monitors.repository';
import { isPrivateHost, normalizeUrl } from '../utils/url';
import type { CreateMonitorInput } from '../validation/monitors.schemas';

export type MonitorView = {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: Date;
};

export class MonitorsService {
  constructor(
    private readonly monitors: MonitorsRepository,
    private readonly allowPrivateTargets: boolean,
  ) {}

  async create(companyId: string, input: CreateMonitorInput): Promise<MonitorView> {
    const url = new URL(input.url);
    if (!this.allowPrivateTargets && isPrivateHost(url.hostname)) {
      throw new AppError(400, 'TARGET_NOT_ALLOWED', 'Private or local addresses cannot be monitored');
    }

    const now = new Date();
    try {
      const monitor = await this.monitors.insert(companyId, {
        name: input.name ?? url.hostname,
        url: input.url,
        normalizedUrl: normalizeUrl(url),
        isActive: true,
        nextCheckAt: now,
        createdAt: now,
      });
      return toMonitorView(monitor);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(409, 'MONITOR_ALREADY_EXISTS', 'This URL is already being monitored');
      }
      throw error;
    }
  }

  async list(companyId: string): Promise<MonitorView[]> {
    const monitors = await this.monitors.listByCompany(companyId);
    return monitors.map(toMonitorView);
  }

  // Başka şirketin monitor'ü de "bulunamadı" (404) döner: 403 kaynağın var olduğunu sızdırır.
  async remove(companyId: string, id: string): Promise<void> {
    const objectId = parseObjectId(id);
    if (!objectId || !(await this.monitors.deleteById(companyId, objectId))) {
      throw new AppError(404, 'MONITOR_NOT_FOUND', 'Monitor not found');
    }
  }
}

function parseObjectId(id: string): ObjectId | null {
  return /^[a-f\d]{24}$/i.test(id) ? new ObjectId(id) : null;
}

function toMonitorView(monitor: MonitorDocument): MonitorView {
  return {
    id: monitor._id.toHexString(),
    name: monitor.name,
    url: monitor.url,
    isActive: monitor.isActive,
    createdAt: monitor.createdAt,
  };
}
