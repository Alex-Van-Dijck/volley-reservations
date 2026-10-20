import { useState } from "react";
import { useApi } from "../api-context";
import { formatDay } from "../format";
import type { CalendarDay, Config } from "../types";

type Props = {
  days: CalendarDay[];
  config: Config;
  run: (action: () => Promise<unknown>) => Promise<void>;
};

export function BlockPanel({ days, run }: Props) {
  const api = useApi();
  const free = days.filter((d) => d.slots.some((s) => !s.blocked));
  const blocked = days.flatMap((d) => d.slots.filter((s) => s.blocked).map((s) => ({ date: d.date, slot: s })));
  const [date, setDate] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const chosen = date !== null && free.some((d) => d.date === date) ? date : (free[0]?.date ?? null);

  return (
    <section className="card">
      <h2>Block a slot</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const day = days.find((d) => d.date === chosen);
          const slot = day?.slots.find((s) => !s.blocked);
          if (!day || !slot) return;
          void run(async () => {
            await api.blockSlot(day.date, slot.slotId, reason.trim() === "" ? undefined : reason.trim());
            setReason("");
          });
        }}
      >
        <label>
          Date
          <select value={chosen ?? ""} onChange={(e) => setDate(e.target.value)}>
            {free.map((d) => (
              <option key={d.date} value={d.date}>
                {d.date}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="submit">Block slot</button>
      </form>
      <ul className="rows">
        {blocked.map(({ date: d, slot }) => (
          <li key={`${d}|${slot.slotId}`} className="row">
            <div className="row-head">
              <strong>{formatDay(d)}</strong>
              <span className="muted">{slot.blockReason ?? "Blocked"}</span>
            </div>
            <div className="row-actions">
              <button
                type="button"
                className="secondary"
                aria-label={`Unblock ${d}`}
                onClick={() => void run(() => api.unblockSlot(d, slot.slotId))}
              >
                Unblock
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
