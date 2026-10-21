import type { App } from "../app.js";
import { fmtDate, fmtTime, loadSettings, toDate, type Deps } from "../db.js";
import { AppError } from "../errors.js";
import { datesWithWeekday, practiceFieldIds, resolveRange, teamStatus, todayIn } from "../rules.js";

type RangeQuery = { from?: string; to?: string };

export function readRoutes(app: App, deps: Deps): void {
  const { prisma } = deps;

  async function rangeFor(query: unknown) {
    const settings = await loadSettings(prisma);
    const today = todayIn(settings.timezone, deps.now());
    const range = resolveRange((query ?? {}) as RangeQuery, today, settings.seasonEnd);
    return { settings, from: range.from, to: range.to > settings.seasonEnd ? settings.seasonEnd : range.to };
  }

  async function loadCells(from: string, to: string) {
    const range = { gte: toDate(from), lte: toDate(to) };
    const [slots, fields, events, blocks] = await Promise.all([
      prisma.slot.findMany({ orderBy: { id: "asc" } }),
      prisma.field.findMany({ orderBy: { id: "asc" } }),
      prisma.event.findMany({ where: { date: range } }),
      prisma.block.findMany({ where: { date: range } }),
    ]);
    const key = (date: string, slotId: number) => `${date}|${slotId}`;
    const eventsByKey = new Map<string, typeof events>();
    for (const e of events) {
      const k = key(fmtDate(e.date), e.slotId);
      eventsByKey.set(k, [...(eventsByKey.get(k) ?? []), e]);
    }
    const blockByKey = new Map(blocks.map((b) => [key(fmtDate(b.date), b.slotId), b]));
    const fieldIds = fields.map((f) => f.id);

    const cells = [];
    for (const slot of slots) {
      for (const date of datesWithWeekday(from, to, slot.weekday)) {
        const k = key(date, slot.id);
        const evs = eventsByKey.get(k) ?? [];
        const block = blockByKey.get(k);
        const homes = evs.filter((e) => e.type === "home");
        cells.push({
          date,
          slotId: slot.id,
          events: evs,
          homes,
          blocked: block !== undefined,
          blockReason: block?.reason ?? null,
          // the home_has_field check constraint guarantees fieldId on home games
          practiceFieldIds: practiceFieldIds(fieldIds, homes.map((e) => e.fieldId!), block !== undefined),
        });
      }
    }
    return cells.sort((a, b) => a.date.localeCompare(b.date) || a.slotId - b.slotId);
  }

  app.get("/api/config", async () => {
    const [teams, fields, slots, settings] = await Promise.all([
      prisma.team.findMany({ orderBy: { id: "asc" } }),
      prisma.field.findMany({ orderBy: { id: "asc" } }),
      prisma.slot.findMany({ orderBy: { id: "asc" } }),
      loadSettings(prisma),
    ]);
    return {
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
      fields: fields.map((f) => ({ id: f.id, name: f.name, size: f.size })),
      slots: slots.map((s) => ({ id: s.id, weekday: s.weekday, start: fmtTime(s.start), end: fmtTime(s.end) })),
      seasonEnd: settings.seasonEnd,
      timezone: settings.timezone,
      today: todayIn(settings.timezone, deps.now()),
    };
  });

  app.get("/api/calendar", async (req) => {
    const { settings, from, to } = await rangeFor(req.query);
    if (from > settings.seasonEnd) return { days: [] };
    const days = new Map<string, unknown[]>();
    for (const c of await loadCells(from, to)) {
      const entry = {
        slotId: c.slotId,
        blocked: c.blocked,
        blockReason: c.blockReason,
        homeGames: c.homes.map((e) => ({ eventId: e.id, teamId: e.teamId, fieldId: e.fieldId! })),
        awayGames: c.events.filter((e) => e.type === "away").map((e) => ({ eventId: e.id, teamId: e.teamId })),
        practiceFieldIds: c.practiceFieldIds,
      };
      days.set(c.date, [...(days.get(c.date) ?? []), entry]);
    }
    return { days: [...days.entries()].map(([date, slots]) => ({ date, slots })) };
  });

  app.get("/api/teams/:id/schedule", async (req) => {
    const raw = (req.params as { id: string }).id;
    const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
    const team = Number.isInteger(id) ? await prisma.team.findUnique({ where: { id } }) : null;
    if (!team) throw new AppError("NOT_FOUND", "Team not found");
    const { settings, from, to } = await rangeFor(req.query);
    if (from > settings.seasonEnd) return { teamId: id, days: [], openSlots: [] };
    const cells = await loadCells(from, to);
    const days = cells.map((c) => {
      const mine = c.events.find((e) => e.teamId === id) ?? null;
      return {
        date: c.date,
        slotId: c.slotId,
        status: teamStatus({ event: mine, blocked: c.blocked, practiceFieldIds: c.practiceFieldIds }),
        eventId: mine?.id ?? null,
        fieldId: mine?.fieldId ?? null,
        practiceFieldIds: c.practiceFieldIds,
      };
    });
    const openSlots = days
      .map((d) => ({
        date: d.date,
        slotId: d.slotId,
        fieldIds: [...new Set([...(d.fieldId === null ? [] : [d.fieldId]), ...d.practiceFieldIds])].sort((a, b) => a - b),
      }))
      .filter((s) => s.fieldIds.length > 0);
    return { teamId: id, days, openSlots };
  });
}
