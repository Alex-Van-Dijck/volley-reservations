import { ApiError } from "./api";
import type { Slot, TeamStatus } from "./types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const monthName = (monthKey: string): string => MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1] ?? "";
export const formatMonth = (monthKey: string): string => `${monthName(monthKey)} ${monthKey.slice(0, 4)}`;

export const formatSlot =(slot: Slot): string => `${slot.start}-${slot.end}`;

const STATUS: Record<TeamStatus, string> = {
  home: "Home game",
  away: "Away game",
  unavailable: "Unavailable",
  training: "Training",
  no_training: "No training",
};
export const statusLabel = (status: TeamStatus): string => STATUS[status];

const ERRORS: Record<string, string> = {
  FIELD_TAKEN: "That field is already taken.",
  TEAM_BUSY: "This team already has an event in that slot.",
  SLOT_BLOCKED: "The slot is blocked on that date.",
  BLOCK_HAS_HOME_GAMES: "Home games exist in that slot, cancel them first.",
  FIELD_REQUIRED: "Choose a field for a home game.",
  FIELD_NOT_ALLOWED: "An away game has no field.",
  WEEKDAY_MISMATCH: "That date is not on the weekday of the slot.",
  DATE_IN_PAST: "That date is in the past.",
  OUT_OF_SEASON: "That date is after the end of the season.",
  FORBIDDEN: "You are not allowed to do that.",
  PAST_EVENT_MANAGER_ONLY: "Only the manager can change past events.",
  UNAUTHENTICATED: "Please sign in again.",
  RATE_LIMITED: "Too many attempts, try again later.",
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return ERRORS[e.code] ?? e.message;
  return "Something went wrong, please try again.";
}
