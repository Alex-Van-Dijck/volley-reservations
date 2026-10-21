import { useState } from "react";
import { css, cx } from "styled-system/css";
import { button } from "styled-system/recipes";
import { useApi } from "../api-context";
import { cellLabel } from "../format";
import type { Run } from "../hooks";
import type { CalendarDay, Config } from "../types";
import { Eyebrow } from "../ui/Eyebrow";

type Props = {
  days: CalendarDay[];
  config: Config;
  run: Run;
  busy: boolean;
};

const panel = css({
  bg: "ink",
  color: "paper",
  mt: "24px",
  p: { base: "28px", mdDown: "22px" },
  display: "grid",
  gridTemplateColumns: { base: "1fr 2fr", mdDown: "1fr" },
  gap: "28px 36px",
  alignItems: "end",
  "& p": { color: "paper", opacity: 0.65, textStyle: "small" },
  "& input, & select": { bg: "white", color: "#111111", borderColor: "#777777" },
});

const form = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr 1.3fr auto", mdDown: "1fr" },
  gap: "10px",
  alignItems: "end",
});

const field = css({
  display: "grid",
  gap: "6px",
  textStyle: "label",
  "& input, & select": { minWidth: 0, width: "100%" },
});

const blockedList = css({
  gridColumn: "1 / -1",
  display: "grid",
  borderTop: "1px solid color-mix(in srgb, {colors.paper} 30%, transparent)",
  _empty: { display: "none" },
});

const blockedRow = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  py: "12px",
  borderBottom: "1px solid color-mix(in srgb, {colors.paper} 15%, transparent)",
  "& span": { opacity: 0.65, textStyle: "small", ml: "12px" },
});

const unblock = css({ color: "paper", borderColor: "paper" });

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
    <section className={panel}>
      <div>
        <Eyebrow style={{ color: "paper", opacity: 0.65 }}>Manager only</Eyebrow>
        <h2>Block a slot</h2>
        <p>Mark the slot on a date as unavailable for every team.</p>
      </div>
      <form
        className={form}
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
        <label className={field}>
          Date
          <select value={chosen?.key ?? ""} onChange={(e) => setPicked(e.target.value)}>
            {free.map((c) => (
              <option key={c.key} value={c.key}>
                {cellLabel(config, c.date, c.slot.slotId)}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="submit" className={button({ visual: "danger" })} disabled={busy || !chosen}>
          Block slot
        </button>
      </form>
      <ul className={blockedList}>
        {blocked.map(({ date, slot, key }) => (
          <li key={key} className={blockedRow}>
            <div>
              <strong>{cellLabel(config, date, slot.slotId)}</strong>
              <span>{slot.blockReason ?? "Blocked"}</span>
            </div>
            <button
              type="button"
              className={cx(button({ visual: "outline", size: "sm" }), unblock)}
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
