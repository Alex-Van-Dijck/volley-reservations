import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { clearBookings, testPrisma } from "./db.js";
import { buildTestApp, loginAs, NOW, PASSWORDS, seedWorld, type World } from "./helpers.js";

const prisma = testPrisma();
let app: App;
let w: World;

beforeAll(async () => {
  w = await seedWorld(prisma);
});
beforeEach(async () => {
  await clearBookings(prisma);
  app = buildTestApp(prisma);
});
afterEach(() => app.close());
afterAll(() => prisma.$disconnect());

const login = (username: string, password: string) =>
  app.inject({ method: "POST", url: "/api/auth/login", payload: { username, password } });

describe("login", () => {
  it("signs in and sets an httpOnly session cookie", async () => {
    const res = await login("koen", PASSWORDS.captain);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: "koen", role: "captain", teamId: w.teams[0]!.id });
    const cookie = res.cookies.find((c) => c.name === "session")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(res.body).not.toContain("passwordHash");
  });

  it("stores only a hash of the token", async () => {
    const res = await login("manager", PASSWORDS.manager);
    const token = res.cookies[0]!.value;
    const rows = await prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(token);
  });

  it("rejects a wrong password and an unknown user the same way", async () => {
    const wrong = await login("manager", "nope");
    const unknown = await login("ghost", "nope");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().detail).toBe(unknown.json().detail);
    expect(wrong.json().code).toBe("UNAUTHENTICATED");
  });

  it("rejects a body without credentials", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "manager" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  it("rate limits repeated failures even for the right password", async () => {
    for (let i = 0; i < 5; i++) expect((await login("manager", "nope")).statusCode).toBe(401);
    const res = await login("manager", PASSWORDS.manager);
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe("RATE_LIMITED");
  });

  it("refuses a body that is not application/json", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "text/plain" },
      payload: JSON.stringify({ username: "manager", password: PASSWORDS.manager }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
    expect(res.cookies).toHaveLength(0);
  });
});

describe("me and logout", () => {
  it("returns the current user for a valid cookie", async () => {
    const cookie = await loginAs(app, "wilfried", PASSWORDS.captain);
    const res = await app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: "wilfried", role: "captain" });
  });

  it("returns 401 without a cookie", async () => {
    const res = await app.inject({ url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("UNAUTHENTICATED");
  });

  it("logout ends the session", async () => {
    const cookie = await loginAs(app, "manager", PASSWORDS.manager);
    const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    expect(out.statusCode).toBe(204);
    const me = await app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it("expires a session idle for more than 30 days", async () => {
    const cookie = await loginAs(app, "manager", PASSWORDS.manager);
    await prisma.session.updateMany({ data: { lastUsedAt: new Date(NOW.getTime() - 31 * 86_400_000) } });
    const me = await app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it("expires a session older than 30 days even if it was used recently", async () => {
    const cookie = await loginAs(app, "manager", PASSWORDS.manager);
    await prisma.session.updateMany({
      data: { createdAt: new Date(NOW.getTime() - 31 * 86_400_000), lastUsedAt: NOW },
    });
    const me = await app.inject({ url: "/api/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });
});
