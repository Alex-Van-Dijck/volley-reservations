import { TZDate } from "@date-fns/tz";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  getISODay,
  isAfter,
  isBefore,
  isValid,
} from "date-fns";
import { AppError } from "./errors.js";
import { utcDay } from "./dates.js";

export type Actor = { id: string; role: "captain" | "manager"; teamId: number | null };
export type TeamStatus = "home" | "away" | "unavailable" | "training" | "no_training";

const MAX_RANGE_DAYS = 400;

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = utcDay(s);
  return isValid(d) && format(d, "yyyy-MM-dd") === s;
}

export function isoWeekday(date: string): number {
  return getISODay(utcDay(date));
}

export function todayIn(timezone: string, now: Date): string {
  return format(new TZDate(now, timezone), "yyyy-MM-dd");
}

export function datesWithWeekday(from: string, to: string, weekday: number): string[] {
  return eachDayOfInterval({ start: utcDay(from), end: utcDay(to) })
    .filter((d) => getISODay(d) === weekday)
    .map((d) => format(d, "yyyy-MM-dd"));
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
  if (isAfter(utcDay(from), utcDay(to))) throw new AppError("VALIDATION_ERROR", "from must not be after to");
  if (differenceInCalendarDays(utcDay(to), utcDay(from)) > MAX_RANGE_DAYS) {
    throw new AppError("VALIDATION_ERROR", `the range is limited to ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}

function defaultEnd(from: string, seasonEnd: string): string {
  const start = utcDay(from);
  const end = utcDay(seasonEnd);
  if (!isAfter(end, start)) return from;
  const limit = addDays(start, MAX_RANGE_DAYS);
  return isBefore(end, limit) ? seasonEnd : format(limit, "yyyy-MM-dd");
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
  if (isBefore(utcDay(i.date), utcDay(i.today))) throw new AppError("DATE_IN_PAST", "The date is in the past");
  if (isAfter(utcDay(i.date), utcDay(i.seasonEnd))) {
    throw new AppError("OUT_OF_SEASON", `The season ends on ${i.seasonEnd}`);
  }
}

export function assertOwnsTeam(actor: Actor, teamId: number): void {
  if (actor.role === "manager") return;
  if (actor.teamId !== teamId) throw new AppError("FORBIDDEN", "You can only manage your own team");
}

export function assertCanModify(actor: Actor, event: { teamId: number; date: string }, today: string): void {
  assertOwnsTeam(actor, event.teamId);
  if (actor.role !== "manager" && isBefore(utcDay(event.date), utcDay(today))) {
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
