import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../src/app.js";
import { clearBookings, testPrisma } from "./db.js";
import { buildTestApp, loginAs, PASSWORDS, seedWorld, type World } from "./helpers.js";

const prisma = testPrisma();
let app: App;
let w: World;
let manager: string;

const THU1 = "2026-10-22";
const JSON_TYPE = { "content-type": "application/json" };

beforeAll(async () => {
  w = await seedWorld(prisma);
  app = buildTestApp(prisma);
});
beforeEach(async () => {
  await clearBookings(prisma);
  manager = await loginAs(app, "manager", PASSWORDS.manager);
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("bodyless requests with content-type application/json", () => {
  it("PUT a block without a body succeeds with a null reason", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/blocks/${THU1}/${w.slot.id}`,
      headers: { ...JSON_TYPE, cookie: manager },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ date: THU1, slotId: w.slot.id, reason: null });
  });

  it("DELETE a block without a body returns 204", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/blocks/${THU1}/${w.slot.id}`,
      headers: { ...JSON_TYPE, cookie: manager },
    });
    expect(res.statusCode).toBe(204);
  });

  it("DELETE an unknown event without a body reaches the route and returns 404", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/events/00000000-0000-4000-8000-000000000000",
      headers: { ...JSON_TYPE, cookie: manager },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
  });

  it("POST logout without a body returns 204", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { ...JSON_TYPE, cookie: manager },
    });
    expect(res.statusCode).toBe(204);
  });
});

describe("JSON bodies", () => {
  const login = (payload: string) =>
    app.inject({ method: "POST", url: "/api/auth/login", headers: JSON_TYPE, payload });

  it("still parses a valid JSON body", async () => {
    const res = await login(JSON.stringify({ username: "manager", password: PASSWORDS.manager }));
    expect(res.statusCode).toBe(200);
  });

  it("rejects malformed JSON with 400 VALIDATION_ERROR", async () => {
    const res = await login('{"a":');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  it("rejects prototype poisoning with 400 VALIDATION_ERROR", async () => {
    const res = await login('{"__proto__":{"x":1}}');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  it("still rejects a non-JSON body through the content-type guard", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { "content-type": "text/plain" },
      payload: "hello",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });
});
