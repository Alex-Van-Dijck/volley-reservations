import type { App } from "../app.js";
import { requireActor } from "../auth.js";
import { fmtDate, toDate } from "../dates.js";
import { conflictFromUnique, loadSettings, lockCells, transact, type Deps, type Tx } from "../db.js";
import { AppError } from "../errors.js";
import { assertCanModify, assertOwnsTeam, checkEventInput, isValidDate, todayIn } from "../rules.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NewEvent = {
  teamId: number;
  date: string;
  slotId: number;
  type: "home" | "away";
  fieldId: number | null;
  createdBy: string;
};

function parseFieldId(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  if (!Number.isInteger(v)) throw new AppError("VALIDATION_ERROR", "fieldId must be an integer");
  return v as number;
}

function parseCell(b: Record<string, unknown>): { date: string; slotId: number; fieldId: number | null } {
  if (typeof b.date !== "string" || !isValidDate(b.date) || !Number.isInteger(b.slotId)) {
    throw new AppError("VALIDATION_ERROR", "date (YYYY-MM-DD) and slotId are required");
  }
  return { date: b.date, slotId: b.slotId as number, fieldId: parseFieldId(b.fieldId) };
}

function view(e: { id: string; teamId: number; date: Date; slotId: number; type: string; fieldId: number | null }) {
  return { id: e.id, teamId: e.teamId, date: fmtDate(e.date), slotId: e.slotId, type: e.type, fieldId: e.fieldId };
}

async function place(tx: Tx, e: NewEvent) {
  const date = toDate(e.date);
  if (e.type === "home") {
    const block = await tx.block.findUnique({ where: { date_slotId: { date, slotId: e.slotId } } });
    if (block) throw new AppError("SLOT_BLOCKED", "The slot is blocked on that date");
    const taken = await tx.event.findFirst({ where: { fieldId: e.fieldId, date, slotId: e.slotId } });
    if (taken) throw new AppError("FIELD_TAKEN", "That field is already taken");
  }
  const busy = await tx.event.findFirst({ where: { teamId: e.teamId, date, slotId: e.slotId } });
  if (busy) throw new AppError("TEAM_BUSY", "This team already has an event in that slot");
  return tx.event.create({ data: { ...e, date } });
}

export function eventRoutes(app: App, deps: Deps): void {
  const { prisma } = deps;

  async function context() {
    const settings = await loadSettings(prisma);
    return { seasonEnd: settings.seasonEnd, today: todayIn(settings.timezone, deps.now()) };
  }

  async function requireExisting(table: "team" | "field" | "slot", id: number | null) {
    if (id === null) return null;
    const found = await (prisma[table] as unknown as { findUnique(a: { where: { id: number } }): Promise<unknown> }).findUnique({
      where: { id },
    });
    if (!found) throw new AppError("NOT_FOUND", `Unknown ${table}`);
    return found as { weekday?: number };
  }

  app.post("/api/events", async (req, reply) => {
    const actor = await requireActor(deps, req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!Number.isInteger(b.teamId) || (b.type !== "home" && b.type !== "away")) {
      throw new AppError("VALIDATION_ERROR", "teamId and type (home or away) are required");
    }
    const teamId = b.teamId as number;
    const type = b.type;
    const cell = parseCell(b);
    assertOwnsTeam(actor, teamId);
    await requireExisting("team", teamId);
    const slot = await requireExisting("slot", cell.slotId);
    await requireExisting("field", cell.fieldId);
    const { seasonEnd, today } = await context();
    checkEventInput({ type, fieldId: cell.fieldId, date: cell.date, slotWeekday: slot!.weekday!, today, seasonEnd });

    try {
      const created = await transact(prisma, async (tx) => {
        await lockCells(tx, [cell]);
        return place(tx, { teamId, type, createdBy: actor.id, ...cell });
      });
      return reply.code(201).send(view(created));
    } catch (e) {
      throw conflictFromUnique(e) ?? e;
    }
  });

  app.delete("/api/events/:id", async (req, reply) => {
    const actor = await requireActor(deps, req);
    const id = (req.params as { id: string }).id;
    const event = UUID.test(id) ? await prisma.event.findUnique({ where: { id } }) : null;
    if (!event) throw new AppError("NOT_FOUND", "Event not found");
    const { today } = await context();
    assertCanModify(actor, { teamId: event.teamId, date: fmtDate(event.date) }, today);
    await prisma.event.deleteMany({ where: { id } });
    return reply.code(204).send();
  });

  app.post("/api/events/:id/move", async (req) => {
    const actor = await requireActor(deps, req);
    const id = (req.params as { id: string }).id;
    const event = UUID.test(id) ? await prisma.event.findUnique({ where: { id } }) : null;
    if (!event) throw new AppError("NOT_FOUND", "Event not found");
    const { today, seasonEnd } = await context();
    const from = { date: fmtDate(event.date), slotId: event.slotId };
    assertCanModify(actor, { teamId: event.teamId, date: from.date }, today);

    const target = parseCell((req.body ?? {}) as Record<string, unknown>);
    const slot = await requireExisting("slot", target.slotId);
    await requireExisting("field", target.fieldId);
    checkEventInput({
      type: event.type,
      fieldId: target.fieldId,
      date: target.date,
      slotWeekday: slot!.weekday!,
      today,
      seasonEnd,
    });

    try {
      const moved = await transact(prisma, async (tx) => {
        await lockCells(tx, [from, target]);
        const gone = await tx.event.deleteMany({ where: { id } });
        if (gone.count === 0) throw new AppError("NOT_FOUND", "Event not found");
        return place(tx, { teamId: event.teamId, type: event.type, createdBy: actor.id, ...target });
      });
      return view(moved);
    } catch (e) {
      throw conflictFromUnique(e) ?? e;
    }
  });
}
