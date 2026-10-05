export type Plan = 'FREE' | 'PRO' | 'ENTERPRISE';

const DAY_IN_SECONDS = 24 * 60 * 60;

export const RETENTION_SECONDS: Record<Plan, number> = {
  FREE: 7 * DAY_IN_SECONDS,
  PRO: 30 * DAY_IN_SECONDS,
  ENTERPRISE: 90 * DAY_IN_SECONDS,
};
