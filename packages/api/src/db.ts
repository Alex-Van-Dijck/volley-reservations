import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";
import { AppError } from "./errors.js";

export { Prisma, PrismaClient };
export type Tx = Prisma.TransactionClient;

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

const epochDay = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

export async function lockCells(tx: Tx, cells: { date: string; slotId: number }[]): Promise<void> {
  const distinct = new Map(cells.map((c) => [`${c.date}|${c.slotId}`, c]));
  const ordered = [...distinct.values()].sort((a, b) => a.date.localeCompare(b.date) || a.slotId - b.slotId);
  for (const c of ordered) {
    // $executeRaw, not $queryRaw: the function returns void, which Prisma cannot deserialize
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${epochDay(c.date)}::int, ${c.slotId}::int)`;
  }
}

export function transact<T>(prisma: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: 3000,
    timeout: 5000,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}

// The advisory lock prevents conflicts, the unique constraints are the backstop.
export function conflictFromUnique(e: unknown): AppError | null {
  if (typeof e !== "object" || e === null || (e as { code?: string }).code !== "P2002") return null;
  const text = `${JSON.stringify((e as { meta?: unknown }).meta ?? {})} ${(e as Error).message}`;
  if (text.includes("Event_fieldId_date_slotId_key")) {
    return new AppError("FIELD_TAKEN", "That field is already taken");
  }
  if (text.includes("Event_teamId_date_slotId_key")) {
    return new AppError("TEAM_BUSY", "This team already has an event in that slot");
  }
  return null;
}
