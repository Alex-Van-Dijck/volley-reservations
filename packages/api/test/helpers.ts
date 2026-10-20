import type { Field, Slot, Team, User } from "../src/generated/prisma/client.js";
import { buildApp, type App } from "../src/app.js";
import type { PrismaClient } from "../src/db.js";
import { seed } from "../prisma/seed.js";
import { resetDb } from "./db.js";

export const NOW = new Date("2026-10-20T10:00:00Z");
export const PASSWORDS = { manager: "m-pass", captain: "c-pass" };

export type World = {
  teams: Team[];
  fields: Field[];
  slot: Slot;
  manager: User;
  captainOf(teamId: number): User;
};

export function buildTestApp(prisma: PrismaClient, now: Date = NOW): App {
  return buildApp({ prisma, now: () => now, production: false });
}

export async function seedWorld(prisma: PrismaClient): Promise<World> {
  await resetDb(prisma);
  await seed(prisma, { managerPassword: PASSWORDS.manager, captainPassword: PASSWORDS.captain });
  const teams = await prisma.team.findMany({ orderBy: { id: "asc" } });
  const fields = await prisma.field.findMany({ orderBy: { id: "asc" } });
  const slot = await prisma.slot.findFirstOrThrow();
  const users = await prisma.user.findMany();
  return {
    teams,
    fields,
    slot,
    manager: users.find((u) => u.role === "manager")!,
    captainOf: (teamId) => users.find((u) => u.teamId === teamId)!,
  };
}

export async function loginAs(app: App, username: string, password: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  return `session=${res.cookies[0]!.value}`;
}
