import { useState } from "react";
import { css } from "styled-system/css";
import { button } from "styled-system/recipes";
import { useApi } from "../api-context";
import { fieldName, formatDay } from "../format";
import type { Run } from "../hooks";
import type { Config, OpenSlot, TeamDay } from "../types";
import { DateBlock } from "../ui/DateBlock";
import { StatusBadge } from "../ui/StatusBadge";

type Props = {
  day: TeamDay;
  teamId: number;
  config: Config;
  dates: string[];
  openSlots: OpenSlot[];
  run: Run;
  busy: boolean;
};

const row = css({
  display: "grid",
  gridTemplateColumns: { base: "70px 1fr auto", mdDown: "52px 1fr" },
  gap: { base: "20px", mdDown: "12px" },
  alignItems: "center",
  p: { base: "20px 24px", mdDown: "18px 14px" },
  borderBottom: "1px solid",
  borderColor: "line",
  _last: { borderBottom: 0 },
});

const copy = css({
  "& > span": { mb: "6px" },
  "& h3": { m: "0 0 4px" },
  "& p": { textStyle: "small" },
});

const actions = css({
  display: "flex",
  gap: "7px",
  mdDown: { gridColumn: "1 / -1", ml: "64px" },
});

const inlineForm = css({
  gridColumn: "1 / -1",
  bg: "soft",
  p: "16px",
  display: "grid",
  gridTemplateColumns: { base: "1fr 1fr auto", mdDown: "1fr" },
  gap: "12px",
  alignItems: "end",
  borderLeft: "3px solid",
  borderColor: "ink",
  mdDown: { mt: "4px" },
});

const field = css({
  display: "grid",
  gap: "6px",
  textStyle: "label",
  "& input, & select": { minWidth: 0, width: "100%" },
});

const formActions = css({ display: "flex", gap: "8px" });

const pick = (wanted: number | null, options: number[]) =>
  wanted !== null && options.includes(wanted) ? wanted : (options[0] ?? null);

export function ReservationRow({ day, teamId, config, dates, openSlots, run, busy }: Props) {
  const api = useApi();
  const [mode, setMode] = useState<"reserve" | "move" | null>(null);
  const toggle = (next: "reserve" | "move") => setMode(mode === next ? null : next);

  const reserveFields = day.practiceFieldIds;
  const [reserveField, setReserveField] = useState<number | null>(null);
  const chosenReserveField = pick(reserveField, reserveFields);

  const isHome = day.status === "home";
  const moveSlots = openSlots
    .map((s) => ({
      date: s.date,
      fieldIds: s.date === day.date ? s.fieldIds.filter((id) => id !== day.fieldId) : s.fieldIds,
    }))
    .filter((s) => s.fieldIds.length > 0);
  const moveOptions = isHome ? moveSlots : dates.filter((d) => d !== day.date).map((date) => ({ date, fieldIds: [] }));
  const moveDates = moveOptions.map((s) => s.date);
  const [moveDate, setMoveDate] = useState<string | null>(null);
  const defaultMoveDate = moveDates.includes(day.date) ? day.date : (moveDates[0] ?? null);
  const chosenMoveDate = moveDate !== null && moveDates.includes(moveDate) ? moveDate : defaultMoveDate;
  const [moveField, setMoveField] = useState<number | null>(null);
  const moveFields = moveOptions.find((s) => s.date === chosenMoveDate)?.fieldIds ?? [];
  const chosenMoveField = pick(moveField, moveFields);

  function reserve() {
    void run(async () => {
      await api.createEvent({
        teamId,
        date: day.date,
        slotId: day.slotId,
        type: "home",
        fieldId: chosenReserveField,
      });
      setMode(null);
    });
  }

  function move(eventId: string) {
    void run(async () => {
      await api.moveEvent(eventId, {
        date: chosenMoveDate!,
        slotId: day.slotId,
        fieldId: isHome ? chosenMoveField : null,
      });
      setMode(null);
    });
  }

  return (
    <li className={row}>
      <DateBlock date={day.date} />
      <div className={copy}>
        <StatusBadge status={day.status} compact />
        <h3>{formatDay(day.date)}</h3>
        {day.fieldId !== null && <p>{fieldName(config, day.fieldId)}</p>}
      </div>
      <div className={actions}>
        {day.eventId ? (
          <>
            <button
              type="button"
              className={button({ visual: "outline", size: "sm" })}
              aria-label={`Move ${day.date}`}
              aria-expanded={mode === "move"}
              onClick={() => toggle("move")}
            >
              Move
            </button>
            <button
              type="button"
              className={button({ visual: "danger", size: "sm" })}
              aria-label={`Cancel ${day.date}`}
              disabled={busy}
              onClick={() => void run(() => api.cancelEvent(day.eventId!))}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className={button({ size: "sm" })}
            aria-label={`Reserve ${day.date}`}
            aria-expanded={mode === "reserve"}
            onClick={() => toggle("reserve")}
          >
            Reserve
          </button>
        )}
      </div>
      {mode === "reserve" && (
        <form
          className={inlineForm}
          onSubmit={(e) => {
            e.preventDefault();
            reserve();
          }}
        >
          <label className={field}>
            Field
            <select value={chosenReserveField ?? ""} onChange={(e) => setReserveField(Number(e.target.value))}>
              {reserveFields.length === 0 && <option value="">No free field</option>}
              {reserveFields.map((id) => (
                <option key={id} value={id}>
                  {fieldName(config, id)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className={button()}
            aria-label={`Save ${day.date}`}
            disabled={busy || chosenReserveField === null}
          >
            Save
          </button>
        </form>
      )}
      {mode === "move" && day.eventId && (
        <form
          className={inlineForm}
          onSubmit={(e) => {
            e.preventDefault();
            move(day.eventId!);
          }}
        >
          <label className={field}>
            New date
            <select value={chosenMoveDate ?? ""} onChange={(e) => setMoveDate(e.target.value)}>
              {moveDates.map((d) => (
                <option key={d} value={d}>
                  {formatDay(d)}
                </option>
              ))}
            </select>
          </label>
          {isHome && (
            <label className={field}>
              New field
              <select value={chosenMoveField ?? ""} onChange={(e) => setMoveField(Number(e.target.value))}>
                {moveFields.map((id) => (
                  <option key={id} value={id}>
                    {fieldName(config, id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className={formActions}>
            <button type="button" className={button({ visual: "outline" })} aria-label={`Cancel move ${day.date}`} onClick={() => setMode(null)}>
              Cancel
            </button>
            <button
              type="submit"
              className={button()}
              aria-label={`Save ${day.date}`}
              disabled={busy || chosenMoveDate === null || (isHome && chosenMoveField === null)}
            >
              Save
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
