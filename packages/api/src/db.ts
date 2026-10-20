import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";

export { Prisma, PrismaClient };

export type Deps = {
  prisma: PrismaClient;
  now: () => Date;
  production: boolean;
  trustProxy?: boolean;
};

export function createPrisma(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
export const fmtDate = (d: Date): string => d.toISOString().slice(0, 10);
export const fmtTime = (d: Date): string => d.toISOString().slice(11, 16);

export async function loadSettings(prisma: PrismaClient): Promise<{ seasonEnd: string; timezone: string }> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const seasonEnd = map.get("season_end");
  const timezone = map.get("timezone");
  if (!seasonEnd || !timezone) throw new Error("Settings season_end and timezone are missing, run the seed");
  return { seasonEnd, timezone };
}
