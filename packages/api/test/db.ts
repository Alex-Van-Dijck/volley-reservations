import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

export function testPrisma(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Session", "Event", "Block", "User", "Slot", "Field", "Team", "Setting" RESTART IDENTITY CASCADE',
  );
}

export async function clearBookings(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "Session", "Event", "Block" CASCADE');
}
