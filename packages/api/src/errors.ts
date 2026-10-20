import type { FastifyReply } from "fastify";

const STATUS = {
  FIELD_TAKEN: 409,
  TEAM_BUSY: 409,
  SLOT_BLOCKED: 409,
  BLOCK_HAS_HOME_GAMES: 409,
  FIELD_REQUIRED: 422,
  FIELD_NOT_ALLOWED: 422,
  WEEKDAY_MISMATCH: 422,
  DATE_IN_PAST: 422,
  OUT_OF_SEASON: 422,
  FORBIDDEN: 403,
  PAST_EVENT_MANAGER_ONLY: 403,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof STATUS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, detail: string) {
    super(detail);
    this.code = code;
    this.status = STATUS[code];
  }
}

export function sendProblem(reply: FastifyReply, code: ErrorCode, detail: string, status = STATUS[code]) {
  const title = code.charAt(0) + code.slice(1).toLowerCase().replaceAll("_", " ");
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: `/problems/${code.toLowerCase().replaceAll("_", "-")}`, title, status, detail, code });
}
