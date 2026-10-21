import { TZDate } from "@date-fns/tz";
import { format, parseISO } from "date-fns";

export const utcDay = (s: string): TZDate => new TZDate(Date.parse(`${s}T00:00:00Z`), "UTC");
export const toDate = (s: string): Date => parseISO(`${s}T00:00:00Z`);
export const fmtDate = (d: Date): string => format(new TZDate(d, "UTC"), "yyyy-MM-dd");
export const fmtTime = (d: Date): string => format(new TZDate(d, "UTC"), "HH:mm");
export const epochDay = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
