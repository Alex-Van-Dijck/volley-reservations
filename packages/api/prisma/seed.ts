import { hashPassword } from "../src/password.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const time = (h: string) => new Date(`1970-01-01T${h}:00Z`);

export async function seed(
  prisma: PrismaClient,
  opts: { managerPassword?: string; captainPassword?: string } = {},
): Promise<void> {
  const managerPassword = opts.managerPassword ?? process.env.SEED_MANAGER_PASSWORD ?? "change-me";
  const captainPassword = opts.captainPassword ?? process.env.SEED_CAPTAIN_PASSWORD ?? "change-me";

  const teams = [];
  for (let i = 1; i <= 4; i++) {
    teams.push(await prisma.team.upsert({ where: { name: `Team ${i}` }, update: {}, create: { name: `Team ${i}` } }));
  }
  await prisma.field.upsert({ where: { name: "Field 1" }, update: {}, create: { name: "Field 1", size: "big" } });
  await prisma.field.upsert({ where: { name: "Field 2" }, update: {}, create: { name: "Field 2", size: "small" } });

  if ((await prisma.slot.count()) === 0) {
    await prisma.slot.create({ data: { weekday: 4, start: time("20:00"), end: time("22:00") } });
  }

  for (const [key, value] of [["season_end", "2027-08-31"], ["timezone", "Europe/Brussels"]] as const) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  await prisma.user.upsert({
    where: { username: "manager" },
    update: {},
    create: { username: "manager", role: "manager", passwordHash: await hashPassword(managerPassword) },
  });
  for (const [i, team] of teams.entries()) {
    await prisma.user.upsert({
      where: { username: `captain${i + 1}` },
      update: {},
      create: {
        username: `captain${i + 1}`,
        role: "captain",
        teamId: team.id,
        passwordHash: await hashPassword(captainPassword),
      },
    });
  }
}
