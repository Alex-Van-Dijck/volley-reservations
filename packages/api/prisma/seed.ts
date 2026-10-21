import { hashPassword } from "../src/password.js";
import type { PrismaClient } from "../src/generated/prisma/client.js";

const time = (h: string) => new Date(`1970-01-01T${h}:00Z`);

const at = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`No seed entry at index ${index}`);
  return item;
};

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
  const fields = [
    await prisma.field.upsert({ where: { name: "Field 1" }, update: {}, create: { name: "Field 1", size: "big" } }),
    await prisma.field.upsert({ where: { name: "Field 2" }, update: {}, create: { name: "Field 2", size: "small" } }),
  ];

  if ((await prisma.slot.count()) === 0) {
    await prisma.slot.create({ data: { weekday: 4, start: time("20:00"), end: time("22:00") } });
  }
  const slot = await prisma.slot.findFirstOrThrow({ where: { weekday: 4 } });

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

  const manager = await prisma.user.findUniqueOrThrow({ where: { username: "manager" } });
  const roundRobin: [number, number][][] = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];
  const firstThursday = Date.UTC(2026, 9, 22);
  for (let week = 0; week < 6; week++) {
    const date = new Date(firstThursday + week * 7 * 24 * 60 * 60 * 1000);
    for (const [matchIndex, [homeIndex, awayIndex]] of at(roundRobin, week % roundRobin.length).entries()) {
      const home = at(teams, homeIndex);
      const away = at(teams, awayIndex);
      await prisma.event.upsert({
        where: { teamId_date_slotId: { teamId: home.id, date, slotId: slot.id } },
        update: {},
        create: {
          teamId: home.id,
          date,
          slotId: slot.id,
          type: "home",
          fieldId: at(fields, matchIndex).id,
          createdBy: manager.id,
        },
      });
      await prisma.event.upsert({
        where: { teamId_date_slotId: { teamId: away.id, date, slotId: slot.id } },
        update: {},
        create: {
          teamId: away.id,
          date,
          slotId: slot.id,
          type: "away",
          createdBy: manager.id,
        },
      });
    }
  }
}
