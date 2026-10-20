import cookie from "@fastify/cookie";
import Fastify from "fastify";
import type { Deps } from "./db.js";
import { AppError, sendProblem } from "./errors.js";
import { readRoutes } from "./routes/read.js";

export function buildApp(deps: Deps) {
  const app = Fastify({ logger: deps.production, trustProxy: deps.trustProxy ?? false });
  app.register(cookie);

  app.setErrorHandler((err: Error, req, reply) => {
    if (err instanceof AppError) return sendProblem(reply, err.code, err.message);
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return sendProblem(reply, "VALIDATION_ERROR", err.message, status);
    req.log.error(err);
    return sendProblem(reply, "INTERNAL", "Unexpected error");
  });
  app.setNotFoundHandler((_req, reply) => sendProblem(reply, "NOT_FOUND", "Route not found"));

  readRoutes(app, deps);
  return app;
}

export type App = ReturnType<typeof buildApp>;
