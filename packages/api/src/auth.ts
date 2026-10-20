import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Deps } from "./db.js";
import { AppError } from "./errors.js";
import type { Actor } from "./rules.js";

export const SESSION_COOKIE = "session";
const SESSION_MAX_IDLE_MS = 30 * 86_400_000;
const TOUCH_AFTER_MS = 3_600_000;

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export async function createSession(deps: Deps, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = deps.now();
  await deps.prisma.session.create({
    data: { tokenHash: hashToken(token), userId, createdAt: now, lastUsedAt: now },
  });
  return token;
}

export async function actorFromToken(deps: Deps, token: string): Promise<Actor | null> {
  const session = await deps.prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  const now = deps.now();
  const idle = now.getTime() - session.lastUsedAt.getTime();
  if (idle > SESSION_MAX_IDLE_MS) {
    await deps.prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (idle > TOUCH_AFTER_MS) {
    await deps.prisma.session.updateMany({ where: { id: session.id }, data: { lastUsedAt: now } });
  }
  return { id: session.user.id, role: session.user.role, teamId: session.user.teamId };
}

export async function requireActor(deps: Deps, req: FastifyRequest): Promise<Actor> {
  const token = req.cookies[SESSION_COOKIE];
  const actor = token ? await actorFromToken(deps, token) : null;
  if (!actor) throw new AppError("UNAUTHENTICATED", "Sign in required");
  return actor;
}

export class FailureLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const kept = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (kept.length > 0) this.hits.set(key, kept);
    else this.hits.delete(key);
    return kept;
  }

  isBlocked(key: string, now: number): boolean {
    return this.recent(key, now).length >= this.max;
  }

  fail(key: string, now: number): void {
    if (this.hits.size > 10_000) for (const k of [...this.hits.keys()]) this.recent(k, now);
    const kept = this.recent(key, now);
    kept.push(now);
    this.hits.set(key, kept);
  }

  clear(key: string): void {
    this.hits.delete(key);
  }
}
