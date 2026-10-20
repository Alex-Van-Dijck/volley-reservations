import type { App } from "../app.js";
import { createSession, FailureLimiter, hashToken, requireActor, SESSION_COOKIE } from "../auth.js";
import type { Deps } from "../db.js";
import { AppError } from "../errors.js";
import { hashPassword, verifyPassword } from "../password.js";

const WINDOW_MS = 15 * 60_000;

let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));

export function authRoutes(app: App, deps: Deps): void {
  const perPair = new FailureLimiter(5, WINDOW_MS);
  const perIp = new FailureLimiter(30, WINDOW_MS);

  app.post("/api/auth/login", async (req, reply) => {
    const body = req.body as { username?: unknown; password?: unknown } | null;
    if (typeof body?.username !== "string" || typeof body.password !== "string") {
      throw new AppError("VALIDATION_ERROR", "username and password are required");
    }
    const now = deps.now().getTime();
    const pairKey = `${req.ip}|${body.username.toLowerCase()}`;
    if (perPair.isBlocked(pairKey, now) || perIp.isBlocked(req.ip, now)) {
      throw new AppError("RATE_LIMITED", "Too many failed attempts, try again later");
    }

    const user = await deps.prisma.user.findUnique({ where: { username: body.username } });
    // always verify against some hash so unknown users cost the same time as wrong passwords
    const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), body.password);
    if (!user || !valid) {
      perPair.fail(pairKey, now);
      perIp.fail(req.ip, now);
      throw new AppError("UNAUTHENTICATED", "Invalid username or password");
    }

    perPair.clear(pairKey);
    const token = await createSession(deps, user.id);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: deps.production,
      path: "/",
      // the server enforces the 30 day sliding expiry, the cookie just has to outlive it
      maxAge: 365 * 86_400,
    });
    return { id: user.id, username: user.username, role: user.role, teamId: user.teamId };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deps.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/auth/me", async (req) => {
    const actor = await requireActor(deps, req);
    const user = await deps.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    return { id: user.id, username: user.username, role: user.role, teamId: user.teamId };
  });
}
