import { useState } from "react";
import { useApi } from "../api-context";
import { cellLabel } from "../format";
import type { Run } from "../hooks";
import type { CalendarDay, Config } from "../types";

type Props = {
  days: CalendarDay[];
  config: Config;
  run: Run;
  busy: boolean;
};

const cellKey = (date: string, slotId: number) => `${date}|${slotId}`;

export function BlockPanel({ days, config, run, busy }: Props) {
  const api = useApi();
  const cells = days.flatMap((d) => d.slots.map((slot) => ({ date: d.date, slot, key: cellKey(d.date, slot.slotId) })));
  const free = cells.filter((c) => !c.slot.blocked);
  const blocked = cells.filter((c) => c.slot.blocked);
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const chosen = free.find((c) => c.key === picked) ?? free[0];

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
          if (!chosen) return;
          const trimmed = reason.trim();
          void run(async () => {
            await api.blockSlot(chosen.date, chosen.slot.slotId, trimmed === "" ? undefined : trimmed);
            setReason("");
          });
        }}
      >
        <label className="field">
          Date
          <select value={chosen?.key ?? ""} onChange={(e) => setPicked(e.target.value)}>
            {free.map((c) => (
              <option key={c.key} value={c.key}>
                {cellLabel(config, c.date, c.slot.slotId)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="submit" className="danger-button" disabled={busy || !chosen}>
          Block slot
        </button>
      </form>
      <ul className="blocked-list">
        {blocked.map(({ date, slot, key }) => (
          <li key={key} className="blocked-row">
            <div>
              <strong>{cellLabel(config, date, slot.slotId)}</strong>
              <span>{slot.blockReason ?? "Blocked"}</span>
            </div>
            <button
              type="button"
              className="outline-button small"
              aria-label={`Unblock ${cellLabel(config, date, slot.slotId)}`}
              disabled={busy}
              onClick={() => void run(() => api.unblockSlot(date, slot.slotId))}
            >
              Unblock
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
