import { prisma } from './prisma';

/**
 * Returns the current global overhead rate (e.g. 0.47 = 47%).
 * Falls back to 0.47 if the singleton row hasn't been seeded yet.
 */
export async function getOverheadRate(): Promise<number> {
  const cfg = await (prisma as any).overheadConfig.findUnique({
    where: { id: 'singleton' },
  });
  return cfg ? Number(cfg.rate) : 0.47;
}

/**
 * Update the global overhead rate. Clamps to [0, 0.99] for safety.
 */
export async function setOverheadRate(rate: number, updatedBy?: string): Promise<number> {
  const safe = Math.min(Math.max(rate, 0), 0.99);
  const cfg = await (prisma as any).overheadConfig.upsert({
    where:  { id: 'singleton' },
    create: { id: 'singleton', rate: safe, updatedBy },
    update: { rate: safe, updatedBy },
  });
  return Number(cfg.rate);
}
