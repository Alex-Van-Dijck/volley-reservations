import { AppError } from "./errors.js";

export type Actor = { id: string; role: "captain" | "manager"; teamId: number | null };
export type TeamStatus = "home" | "away" | "unavailable" | "training" | "no_training";

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 400;

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function datesWithWeekday(from: string, to: string, weekday: number): string[] {
  const out: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += DAY_MS) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (isoWeekday(iso) === weekday) out.push(iso);
  }
  return out;
}

export function resolveRange(
  q: { from?: string; to?: string },
  today: string,
  seasonEnd: string,
): { from: string; to: string } {
  const from = q.from ?? today;
  if (!isValidDate(from)) {
    throw new AppError("VALIDATION_ERROR", "from and to must be dates in YYYY-MM-DD format");
  }
  const to = q.to ?? defaultEnd(from, seasonEnd);
  if (!isValidDate(to)) {
    throw new AppError("VALIDATION_ERROR", "from and to must be dates in YYYY-MM-DD format");
  }
  if (from > to) throw new AppError("VALIDATION_ERROR", "from must not be after to");
  if (Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * DAY_MS) {
    throw new AppError("VALIDATION_ERROR", `the range is limited to ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}

function defaultEnd(from: string, seasonEnd: string): string {
  if (seasonEnd <= from) return from;
  const limit = new Date(Date.parse(`${from}T00:00:00Z`) + MAX_RANGE_DAYS * DAY_MS).toISOString().slice(0, 10);
  return seasonEnd < limit ? seasonEnd : limit;
}

export function checkEventInput(i: {
  type: "home" | "away";
  fieldId: number | null;
  date: string;
  slotWeekday: number;
  today: string;
  seasonEnd: string;
}): void {
  if (i.type === "home" && i.fieldId === null) throw new AppError("FIELD_REQUIRED", "A home game needs a field");
  if (i.type === "away" && i.fieldId !== null) throw new AppError("FIELD_NOT_ALLOWED", "An away game has no field");
  if (isoWeekday(i.date) !== i.slotWeekday) {
    throw new AppError("WEEKDAY_MISMATCH", "The date does not fall on the weekday of this slot");
  }
  if (i.date < i.today) throw new AppError("DATE_IN_PAST", "The date is in the past");
  if (i.date > i.seasonEnd) throw new AppError("OUT_OF_SEASON", `The season ends on ${i.seasonEnd}`);
}

export function assertOwnsTeam(actor: Actor, teamId: number): void {
  if (actor.role === "manager") return;
  if (actor.teamId !== teamId) throw new AppError("FORBIDDEN", "You can only manage your own team");
}

export function assertCanModify(actor: Actor, event: { teamId: number; date: string }, today: string): void {
  assertOwnsTeam(actor, event.teamId);
  if (actor.role !== "manager" && event.date < today) {
    throw new AppError("PAST_EVENT_MANAGER_ONLY", "Only the manager can change past events");
  }
}

export function practiceFieldIds(allFieldIds: number[], homeFieldIds: number[], blocked: boolean): number[] {
  if (blocked) return [];
  return allFieldIds.filter((id) => !homeFieldIds.includes(id));
}

export function teamStatus(i: {
  event: { type: "home" | "away" } | null;
  blocked: boolean;
  practiceFieldIds: number[];
}): TeamStatus {
  if (i.event) return i.event.type;
  if (i.blocked) return "unavailable";
  return i.practiceFieldIds.length > 0 ? "training" : "no_training";
}
