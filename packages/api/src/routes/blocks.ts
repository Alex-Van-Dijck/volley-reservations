import type { FastifyRequest } from "fastify";
import type { App } from "../app.js";
import { requireActor } from "../auth.js";
import { lockCells, toDate, transact, type Deps } from "../db.js";
import { AppError } from "../errors.js";
import { isoWeekday, isValidDate } from "../rules.js";

export function blockRoutes(app: App, deps: Deps): void {
  const { prisma } = deps;

  async function managerCell(req: FastifyRequest) {
    const actor = await requireActor(deps, req);
    if (actor.role !== "manager") throw new AppError("FORBIDDEN", "Only the manager can manage blocks");
    const params = req.params as { date: string; slotId: string };
    const slotId = Number(params.slotId);
    if (!isValidDate(params.date) || !Number.isInteger(slotId)) {
      throw new AppError("VALIDATION_ERROR", "date (YYYY-MM-DD) and slotId must be valid");
    }
    return { date: params.date, slotId };
  }

  app.put("/api/blocks/:date/:slotId", async (req) => {
    const cell = await managerCell(req);
    const slot = await prisma.slot.findUnique({ where: { id: cell.slotId } });
    if (!slot) throw new AppError("NOT_FOUND", "Slot not found");
    if (isoWeekday(cell.date) !== slot.weekday) {
      throw new AppError("WEEKDAY_MISMATCH", "The date does not fall on the weekday of this slot");
    }
    const raw = (req.body as { reason?: unknown } | null | undefined)?.reason;
    if (raw !== undefined && raw !== null && (typeof raw !== "string" || raw.length > 200)) {
      throw new AppError("VALIDATION_ERROR", "reason must be text of at most 200 characters");
    }
    const reason = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
    const date = toDate(cell.date);

    await transact(prisma, async (tx) => {
      await lockCells(tx, [cell]);
      const homes = await tx.event.count({ where: { date, slotId: cell.slotId, type: "home" } });
      if (homes > 0) throw new AppError("BLOCK_HAS_HOME_GAMES", "Home games exist in that slot, cancel them first");
      await tx.block.upsert({
        where: { date_slotId: { date, slotId: cell.slotId } },
        update: { reason },
        create: { date, slotId: cell.slotId, reason },
      });
    });
    return { date: cell.date, slotId: cell.slotId, reason };
  });

  app.delete("/api/blocks/:date/:slotId", async (req, reply) => {
    const cell = await managerCell(req);
    await prisma.block.deleteMany({ where: { date: toDate(cell.date), slotId: cell.slotId } });
    return reply.code(204).send();
  });
}
