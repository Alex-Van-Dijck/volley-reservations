export type Role = "captain" | "manager";
export type User = { id: string; username: string; role: Role; teamId: number | null };
export type Team = { id: number; name: string };
export type Field = { id: number; name: string; size: string };
export type Slot = { id: number; weekday: number; start: string; end: string };
export type Config = { teams: Team[]; fields: Field[]; slots: Slot[]; seasonEnd: string; today: string; timezone: string };

export type CalendarSlot = {
  slotId: number;
  blocked: boolean;
  blockReason: string | null;
  homeGames: { eventId: string; teamId: number; fieldId: number }[];
  awayGames: { eventId: string; teamId: number }[];
  practiceFieldIds: number[];
};
export type CalendarDay = { date: string; slots: CalendarSlot[] };

export type TeamStatus = "home" | "away" | "unavailable" | "training" | "no_training";
export type TeamDay = {
  date: string;
  slotId: number;
  status: TeamStatus;
  eventId: string | null;
  fieldId: number | null;
  practiceFieldIds: number[];
};

export type OpenSlot = { date: string; slotId: number; fieldIds: number[] };
export type TeamSchedule = { teamId: number; days: TeamDay[]; openSlots: OpenSlot[] };

export type EventView = {
  id: string;
  teamId: number;
  date: string;
  slotId: number;
  type: "home" | "away";
  fieldId: number | null;
};
export type NewEventInput = {
  teamId: number;
  date: string;
  slotId: number;
  type: "home" | "away";
  fieldId: number | null;
};
