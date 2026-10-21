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
    <section className="block-panel">
      <div>
        <span className="eyebrow">Manager only</span>
        <h2>Block a slot</h2>
        <p>Mark the slot on a date as unavailable for every team.</p>
      </div>
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
        <label className="field">
          Date
          <select value={chosen ?? ""} onChange={(e) => setDate(e.target.value)}>
            {free.map((d) => (
              <option key={d.date} value={d.date}>
                {d.date}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="submit" className="danger-button">
          Block slot
        </button>
      </form>
      <ul className="blocked-list">
        {blocked.map(({ date: d, slot }) => (
          <li key={`${d}|${slot.slotId}`} className="blocked-row">
            <div>
              <strong>{formatDay(d)}</strong>
              <span>{slot.blockReason ?? "Blocked"}</span>
            </div>
            <button
              type="button"
              className="outline-button small"
              aria-label={`Unblock ${d}`}
              onClick={() => void run(() => api.unblockSlot(d, slot.slotId))}
            >
              Unblock
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
